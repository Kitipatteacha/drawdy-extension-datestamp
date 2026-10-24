import { DomElementSchema } from "@drawdy/driver-protocol";

import { command, session } from "./drawdy-bridge/session";
import { Rect } from "./stamp/draw";
import { idsOf, Stamp } from "./stamp/scene";
import {
  Color,
  COLORS,
  FIRST_EXACT_FORMAT,
  FORMAT_LABELS,
  FORMATS,
  LANGUAGES,
  StampStyle,
  STATUSES,
  statusOf,
  svgDataUri,
} from "./stamp/style";

/**
 * The bar above selected stamps, the way a FigJam widget shows its property
 * menu: the date, then menus for the format, status and colour, the tilt,
 * and a menu for the language. A menu opens under the bar, in the same floating
 * element, and shuts once something in it is picked.
 */
export type Menu = "format" | "status" | "color" | "language";

export type ToolbarAction =
  | { type: "pick-date" }
  | { type: "menu"; menu: Menu }
  | { type: "set"; change: Partial<StampStyle> }
  | { type: "tilt" };

/* ------------------------------------------------------------------ */
/* Look                                                                 */
/* ------------------------------------------------------------------ */

// Dark on any board, like FigJam's widget bar, so the stamps' colours read
// the same next to it.
const SURFACE = "#1e1e1e";
const EDGE = "#ffffff1f";
const TEXT = "#f5f5f5";
const MUTED = "#a3a3a3";
const HOVER = "#ffffff14";
const CHOSEN = "#ffffff24";

const HEIGHT = 44;
const PAD = 5;
const GAP = 4;
/** Between the bar and the stamps, the bar and the window's edges, and the bar and its menu. */
const OFFSET = 12;
const MARGIN = 8;
const MENU_GAP = 6;
const MENU_WIDTH = 220;

/** Each piece of the bar, in order, with its width. */
const SEGMENTS = [
  { name: "date", width: 34 },
  { name: "divider", width: 1 },
  { name: "format", width: 116 },
  { name: "divider", width: 1 },
  { name: "status", width: 134 },
  { name: "divider", width: 1 },
  { name: "color", width: 50 },
  { name: "divider", width: 1 },
  { name: "tilt", width: 34 },
  { name: "divider", width: 1 },
  { name: "language", width: 116 },
] as const;

const WIDTH = PAD * 2 + 2 + SEGMENTS.reduce((sum, s) => sum + s.width, 0) + GAP * (SEGMENTS.length - 1);

/** Where a segment starts, from the bar's left edge. */
function offsetOf(name: string): number {
  let x = PAD + 1;
  for (const segment of SEGMENTS) {
    if (segment.name === name) return x;
    x += segment.width + GAP;
  }
  return x;
}

const glyph = (paths: string, color: string, size = 16, stroke = 2): DomElementSchema => ({
  type: "image",
  child: svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
      `stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
  ),
  styles: { width: [size, "px"], height: [size, "px"], pointerEvents: "none" },
});

const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const TILT = '<rect x="3.5" y="8" width="17" height="8" rx="2.5" transform="rotate(-14 12 12)"/>';

const label = (words: string, color = TEXT): DomElementSchema => ({
  type: "text",
  child: words,
  styles: { color, fontSize: [13, "px"], fontWeight: "medium", pointerEvents: "none" },
});

/** A row of content, or with `between`, one that fills its button and pushes its ends apart. */
const row = (gap: number, children: DomElementSchema[], between = false): DomElementSchema => ({
  type: "row",
  styles: {
    ...(between ? { width: [100, "%"] as const } : {}),
    gap,
    crossAxisAlignment: "center",
    mainAxisAlignment: between ? "between" : "start",
    pointerEvents: "none",
  },
  children,
});

const divider: DomElementSchema = {
  type: "box",
  styles: { width: [1, "px"], height: [22, "px"], backgroundColor: EDGE },
};

/** A line between groups in a menu. */
const menuDivider: DomElementSchema = {
  type: "box",
  styles: { width: [100, "%"], height: [1, "px"], backgroundColor: EDGE },
};

/* ------------------------------------------------------------------ */
/* Buttons                                                              */
/* ------------------------------------------------------------------ */

const domId = (): string => `${session().manifest.driverId}:toolbar`;
const buttonId = (name: string): string => `${domId()}:${name}`;

const BUTTONS: { name: string; action: ToolbarAction }[] = [
  { name: "date", action: { type: "pick-date" } },
  { name: "tilt", action: { type: "tilt" } },
  ...(["format", "status", "color", "language"] as const).map((menu) => ({
    name: `menu:${menu}`,
    action: { type: "menu", menu } as const,
  })),
  ...FORMATS.map((f) => ({ name: `format:${f}`, action: { type: "set", change: { format: f } } as const })),
  ...STATUSES.map((s) => ({ name: `status:${s.key}`, action: { type: "set", change: { status: s.key } } as const })),
  ...COLORS.map((c) => ({ name: `color:${c.key}`, action: { type: "set", change: { color: c.key } } as const })),
  ...LANGUAGES.map((l) => ({ name: `lang:${l.key}`, action: { type: "set", change: { lang: l.key } } as const })),
];

export const toolbarButtonIds = (): string[] => BUTTONS.map((b) => buttonId(b.name));

export const toolbarAction = (domElementId: string): ToolbarAction | null =>
  BUTTONS.find((b) => buttonId(b.name) === domElementId)?.action ?? null;

/* ------------------------------------------------------------------ */
/* Schema                                                               */
/* ------------------------------------------------------------------ */

/** The stamps' settings where they all agree, for the bar to show as chosen. */
type Shown = { [K in keyof StampStyle]: StampStyle[K] | null };

function shownOf(stamps: Stamp[]): Shown {
  const first = stamps[0].style;
  const common = <K extends keyof StampStyle>(key: K): StampStyle[K] | null =>
    stamps.every((s) => s.style[key] === first[key]) ? first[key] : null;
  return {
    status: common("status"),
    color: common("color"),
    date: common("date") ?? first.date,
    format: common("format"),
    tilt: common("tilt"),
    lang: common("lang") ?? first.lang,
  };
}

function button(
  name: string,
  width: number,
  children: DomElementSchema[],
  chosen = false,
  background = "transparent",
): DomElementSchema {
  return {
    type: "button",
    domId: buttonId(name),
    styles: {
      width: [width, "px"],
      height: [34, "px"],
      padding: [8, "px"],
      borderRadius: [8, "px"],
      backgroundColor: chosen ? CHOSEN : background,
      cursor: "pointer",
      hover: { backgroundColor: chosen ? CHOSEN : HOVER },
    },
    children,
  };
}

function dropdown(menu: Menu, width: number, open: boolean, content: DomElementSchema[]): DomElementSchema {
  return button(`menu:${menu}`, width, [row(8, [row(8, content), glyph(CHEVRON, MUTED, 14)], true)], open);
}

/**
 * A colour's dot, drawn as an image: Drawdy sets `backgroundColor` as CSS
 * `background-color`, which can't hold Gold's or Rainbow's gradient.
 * `rimmed` gives it the white rim the stamps have.
 */
function swatch(color: Color | undefined, size: number, rimmed = false): DomElementSchema {
  const stops = color?.fill ?? color?.rim ?? [color?.ink ?? "transparent"];
  const paint =
    stops.length > 1
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("") +
        `</linearGradient></defs>`
      : "";
  const fill = stops.length > 1 ? "url(#g)" : stops[0];
  const dot = rimmed
    ? `<circle cx="12" cy="12" r="10.5" fill="${fill}" stroke="#fff" stroke-width="3"/>`
    : `<circle cx="12" cy="12" r="12" fill="${fill}"/>`;
  return {
    type: "image",
    child: svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${paint}${dot}</svg>`,
    ),
    styles: { width: [size, "px"], height: [size, "px"], pointerEvents: "none" },
  };
}

function bar(shown: Shown, open: Menu | null): DomElementSchema {
  const status = shown.status ? statusOf(shown.status) : null;
  const color = COLORS.find((c) => c.key === shown.color);
  const language = LANGUAGES.find((l) => l.key === shown.lang);
  return {
    type: "row",
    // Drawdy keys its elements by id, so the bar is kept, not rebuilt, as
    // its menus open and shut.
    domId: `${domId()}:bar`,
    styles: {
      width: [WIDTH, "px"],
      height: [HEIGHT, "px"],
      padding: [PAD, "px"],
      gap: GAP,
      crossAxisAlignment: "center",
      backgroundColor: SURFACE,
      borderColor: EDGE,
      borderType: "solid",
      borderWidth: [1, "px"],
      borderRadius: [12, "px"],
      pointerEvents: "auto",
    },
    children: [
      button("date", 34, [glyph(STATUSES[0].icon, TEXT, 17)]),
      divider,
      dropdown("format", 116, open === "format", [label("Format")]),
      divider,
      dropdown("status", 134, open === "status", [
        ...(status ? [glyph(status.icon, TEXT, 15)] : []),
        label(status ? status.label : "Status"),
      ]),
      divider,
      dropdown("color", 50, open === "color", [swatch(color, 16, true)]),
      divider,
      button("tilt", 34, [glyph(TILT, shown.tilt ? TEXT : MUTED, 17)], shown.tilt === true),
      divider,
      dropdown("language", 116, open === "language", [label(language?.label ?? "Language")]),
    ],
  };
}

/** One choice in a menu, with a tick before the chosen one. */
function option(name: string, chosen: boolean, content: DomElementSchema[]): DomElementSchema {
  return {
    type: "button",
    domId: buttonId(name),
    styles: {
      width: [100, "%"],
      height: [32, "px"],
      padding: [8, "px"],
      borderRadius: [7, "px"],
      backgroundColor: chosen ? CHOSEN : "transparent",
      cursor: "pointer",
      hover: { backgroundColor: chosen ? CHOSEN : HOVER },
    },
    // The tick's place is kept on every line, so the words line up.
    children: [
      row(10, [
        chosen
          ? glyph(CHECK, TEXT, 14)
          : { type: "box", styles: { width: [14, "px"], height: [14, "px"], pointerEvents: "none" } },
        ...content,
      ]),
    ],
  };
}

function menuOf(menu: Menu, shown: Shown): DomElementSchema {
  const panel = (children: DomElementSchema[], width = MENU_WIDTH): DomElementSchema => ({
    type: "column",
    styles: {
      width: [width, "px"],
      padding: [5, "px"],
      gap: 2,
      backgroundColor: SURFACE,
      borderColor: EDGE,
      borderType: "solid",
      borderWidth: [1, "px"],
      borderRadius: [12, "px"],
      pointerEvents: "auto",
    },
    children,
  });
  switch (menu) {
    case "format":
      return panel(
        FORMATS.flatMap((f) => [
          ...(f === FIRST_EXACT_FORMAT ? [menuDivider] : []),
          option(`format:${f}`, f === shown.format, [label(FORMAT_LABELS[f])]),
        ]),
      );
    case "status":
      return panel(
        STATUSES.map((s) =>
          option(`status:${s.key}`, s.key === shown.status, [glyph(s.icon, TEXT, 15), label(s.label)]),
        ),
        180,
      );
    case "language":
      return panel(
        LANGUAGES.map((l) => option(`lang:${l.key}`, l.key === shown.lang, [label(l.label)])),
        160,
      );
    case "color":
      // A swatch with a gap between it and its ring, which shows the chosen one.
      return panel(
        [
          {
            type: "row",
            styles: { gap: 4, crossAxisAlignment: "center" },
            children: COLORS.map((c) => ({
              type: "button",
              domId: buttonId(`color:${c.key}`),
              styles: {
                padding: [3, "px"],
                borderRadius: [50, "%"],
                borderType: "solid",
                borderWidth: [2, "px"],
                borderColor: c.key === shown.color ? "#ffffff" : "transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                hover: { borderColor: c.key === shown.color ? "#ffffff" : MUTED },
              },
              children: [swatch(c, 22)],
            })),
          },
        ],
        // Each swatch is 32px with its ring, 4px apart, in 5px of padding and a 1px edge.
        COLORS.length * 36 - 4 + 12,
      );
  }
}

/**
 * The bar, with the open menu under it. The tree keeps one shape whether a
 * menu is open or not: Drawdy renders it with React, and a change of shape
 * would rebuild the bar and make its icons blink.
 */
function schema(shown: Shown, open: Menu | null): DomElementSchema {
  const menu: DomElementSchema[] = open
    ? [
        {
          type: "row",
          domId: `${domId()}:menu`,
          styles: { pointerEvents: "none" },
          children: [
            { type: "box", styles: { width: [offsetOf(open), "px"], height: [1, "px"], pointerEvents: "none" } },
            menuOf(open, shown),
          ],
        },
      ]
    : [];
  // Lets clicks through around the bar and the menu.
  return {
    type: "column",
    styles: { gap: MENU_GAP, crossAxisAlignment: "start", pointerEvents: "none" },
    children: [bar(shown, open), ...menu],
  };
}

/* ------------------------------------------------------------------ */
/* Showing and following                                                */
/* ------------------------------------------------------------------ */

/** The stamps' rect on the board while the bar is up, else null. */
let around: Rect | null = null;
let shown: Shown | null = null;
let open: Menu | null = null;

async function position(rect: Rect): Promise<{ x: number; y: number } | null> {
  const [topLeft, bottomRight, window] = await Promise.all([
    command("command:camera:canvas-to-screen", { x: rect.x, y: rect.y }),
    command("command:camera:canvas-to-screen", {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
    }),
    command("command:dom:window-size"),
  ]);
  if (!topLeft || !bottomRight) return null;
  const x = (topLeft.x + bottomRight.x) / 2 - WIDTH / 2;
  // Above the stamps, or below them when there's no room at the top.
  let y = topLeft.y - OFFSET - HEIGHT;
  if (y < MARGIN) y = bottomRight.y + OFFSET;
  const maxX = (window?.width ?? Infinity) - WIDTH - MARGIN;
  return { x: Math.max(MARGIN, Math.min(x, maxX)), y };
}

async function draw(): Promise<void> {
  if (around === null || shown === null) return;
  const at = await position(around);
  if (!at) return;
  await command("command:dom:upsert-floating-element", {
    domId: domId(),
    position: at,
    schema: schema(shown, open),
    asPopover: false,
  });
}

/** Shows the bar over `stamps`, or moves and refreshes it if it's up. */
export async function showToolbar(stamps: Stamp[]): Promise<void> {
  const res = await command("command:scene:query-combined-rect", {
    drawdyElementIds: idsOf(stamps),
  });
  if (!res?.rect) {
    await hideToolbar();
    return;
  }
  around = res.rect;
  shown = shownOf(stamps);
  await draw();
}

export async function hideToolbar(): Promise<void> {
  open = null;
  if (around === null) return;
  around = null;
  await command("command:dom:remove-floating-element", { domId: domId() });
}

/** Opens `menu` under the bar, or shuts it when it's the open one. */
export async function toggleMenu(menu: Menu): Promise<void> {
  open = open === menu ? null : menu;
  await draw();
}

/** Shuts the open menu, for the next redraw. */
export const closeMenu = (): void => {
  open = null;
};

/** Keeps the bar on its stamps as the board pans and zooms. */
export async function followCamera(): Promise<void> {
  if (around === null) return;
  const at = await position(around);
  if (at && around !== null) {
    await command("command:dom:move-floating-element", { domId: domId(), position: at });
  }
}
