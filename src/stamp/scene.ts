import { SubscribedDrawdyElement } from "@drawdy/driver-protocol";

import { command, session } from "../drawdy-bridge/session";
import { META_KEY, stampElement, stampSvg } from "./draw";
import { sanitizeStyle, StampStyle } from "./style";

export class StampError extends Error {}

/**
 * A stamp's elements and settings. A stamp is one image; one from 0.1.0 is
 * the four shapes and texts of its group, until a change redraws it.
 */
export type Stamp = { ids: string[]; style: StampStyle; legacy?: boolean };

const isStamp = (element: SubscribedDrawdyElement): boolean => {
  const meta = element.meta?.[META_KEY];
  return typeof meta === "object" && meta !== null;
};

/** An old stamp's parts are grouped; a new stamp, or an ungrouped part, stands alone. */
const stampKey = (element: SubscribedDrawdyElement): string => element.groupId ?? element.id;

function collect(elements: SubscribedDrawdyElement[], into: Map<string, Stamp>): void {
  for (const element of elements) {
    if (!isStamp(element)) continue;
    const stamp = into.get(stampKey(element));
    if (stamp && !stamp.ids.includes(element.id)) stamp.ids.push(element.id);
  }
}

/**
 * The stamps `ids` make up, or null when they hold anything that isn't a
 * stamp. The toolbar only shows for a selection of stamps alone.
 */
export async function stampsAmong(ids: string[]): Promise<Stamp[] | null> {
  if (ids.length === 0) return null;
  const res = await command("command:scene:get-drawdy-elements", {
    properties: ["meta", "groupId"],
    drawdyElementIds: ids,
  });
  if (!res || res.drawdyElements.length === 0) return null;
  if (!res.drawdyElements.every(isStamp)) return null;

  const stamps = new Map<string, Stamp>();
  for (const element of res.drawdyElements) {
    const key = stampKey(element);
    if (!stamps.has(key)) {
      const meta = element.meta?.[META_KEY] as { v?: unknown } | undefined;
      stamps.set(key, { ids: [], style: sanitizeStyle(meta), legacy: meta?.v === 1 });
    }
  }
  collect(res.drawdyElements, stamps);

  // A selection names every part of an old stamp's group, but look the rest
  // up if not, so redrawing it leaves nothing behind.
  if (res.drawdyElements.some((e) => e.groupId)) {
    const all = await command("command:scene:get-drawdy-elements", {
      properties: ["meta", "groupId"],
    });
    if (all) collect(all.drawdyElements, stamps);
  }
  return [...stamps.values()];
}

/** Every element of the stamps, for selecting them or drawing around them. */
export const idsOf = (stamps: Stamp[]): string[] => stamps.flatMap((s) => s.ids);

/**
 * Gives every stamp the settings in `change`, keeping the rest of its own.
 * An image can't be redrawn in place, so each stamp is swapped for a new one
 * at its top-left, and the new ones are selected. A stamp keeps the size the
 * user resized it to; one from 0.1.0 starts at the new stamps' size.
 */
export async function restamp(stamps: Stamp[], change: Partial<StampStyle>): Promise<Stamp[]> {
  const { generateId } = session();
  const rects = await Promise.all(
    stamps.map((s) => command("command:scene:query-combined-rect", { drawdyElementIds: s.ids })),
  );
  const next: Stamp[] = [];
  const elements = stamps.flatMap((stamp, i) => {
    const rect = rects[i]?.rect;
    if (!rect) return [];
    const style = { ...stamp.style, ...change };
    const id = generateId();
    next.push({ ids: [id], style });
    const scale = stamp.legacy ? 1 : rect.width / stampSvg(stamp.style).width;
    return [stampElement(id, rect, style, scale)];
  });
  if (elements.length === 0) throw new StampError("Couldn't find the stamp on the board.");
  // Adding answers with nothing, so only null means it failed.
  if ((await command("command:scene:add-drawdy-elements", { elements })) === null) {
    throw new StampError("Drawdy didn't take the change.");
  }
  // The new stamps are selected before the old ones go, so the selection is
  // never empty and the bar doesn't drop out and come back.
  await command("command:scene:set-selection", { drawdyElementIds: idsOf(next) });
  await command("command:scene:remove-drawdy-elements", {
    drawdyElementIds: stamps.filter((_, i) => rects[i]?.rect).flatMap((s) => s.ids),
  });
  return next;
}

/** Adds a stamp in the middle of the view, selected. */
export async function addStamp(style: StampStyle): Promise<void> {
  const view = await command("command:camera:get-viewport-rect");
  if (!view) throw new StampError("Couldn't find the middle of the board.");
  const id = session().generateId();
  const element = stampElement(id, { x: 0, y: 0 }, style);
  if (element.type !== "image") return;
  element.x = view.rect.x + (view.rect.width - element.width) / 2;
  element.y = view.rect.y + (view.rect.height - element.height) / 2;
  if ((await command("command:scene:add-drawdy-elements", { elements: [element] })) === null) {
    throw new StampError("Drawdy didn't take the stamp.");
  }
  await command("command:scene:set-selection", { drawdyElementIds: [id] });
}
