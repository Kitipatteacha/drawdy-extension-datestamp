import { DriverModule } from "@drawdy/driver-protocol";
import { WEBVIEW_HTML } from "virtual:webview-html";

import { enqueue } from "./drawdy-bridge/queue";
import {
  command,
  isOpen,
  open,
  post,
  session,
  stylingCss,
  updateStyling,
} from "./drawdy-bridge/session";
import { DATESTAMP_SVG } from "./panel/icon";
import { Selection, WebviewToDriver } from "./panel/messages";
import { addStamp, idsOf, restamp, Stamp, StampError, stampsAmong } from "./stamp/scene";
import { defaultStyle, sanitizeStyle, StampStyle } from "./stamp/style";
import {
  closeMenu,
  followCamera,
  hideToolbar,
  showToolbar,
  toggleMenu,
  toolbarAction,
  toolbarButtonIds,
  ToolbarAction,
} from "./toolbar";

const SUBSCRIPTIONS = [
  "subscription:dom:theme-changed",
  "subscription:scene:drawdy-element-selection",
  "subscription:scene:drawdy-elements-dragged",
  "subscription:camera:moved-rapid",
] as const;

export const activate: DriverModule["activate"] = async ({
  manifest,
  issueCommand,
  generateId,
  styling,
}) => {
  open({
    manifest,
    issueCommand,
    generateId,
    styling,
    actionButtonId: `${manifest.driverId}:action-button`,
    webviewId: `${manifest.driverId}:webview`,
  });

  const button = await command("command:dom:create-action-button", {
    domElementId: session().actionButtonId,
    svg: DATESTAMP_SVG,
  });
  if (!button?.created) return;

  for (const type of SUBSCRIPTIONS) await command(type);
  for (const domElementId of [session().actionButtonId, ...toolbarButtonIds()]) {
    await command("subscription:dom:element-clicked", { domElementId });
  }
  await command("subscription:webview:message", {
    webviewDomId: session().webviewId,
  });
};

/** What's selected on the board, as the last selection event said. */
let selected: string[] = [];
let following = false;
/** The look the last stamp was given, for the next new one. */
let recent: StampStyle = defaultStyle();

export const onEvent: DriverModule["onEvent"] = async (e) => {
  if (!isOpen()) return;
  switch (e.type) {
    case "subscription:dom:theme-changed": {
      // The bar is dark on any board, so only the panel follows the theme.
      updateStyling(e.body.styling);
      postStyling();
      return;
    }
    case "subscription:scene:drawdy-element-selection": {
      selected = e.body.drawdyElementIds;
      enqueue(refresh);
      return;
    }
    case "subscription:scene:drawdy-elements-dragged": {
      // The bar would trail behind the stamps, so it waits for the drop.
      if (e.body.type === "dragStart") enqueue(hideToolbar);
      else if (e.body.type === "dragEnd") enqueue(refresh);
      return;
    }
    case "subscription:camera:moved-rapid": {
      // One move at a time: the camera fires faster than the bar can follow.
      if (following) return;
      following = true;
      enqueue(async () => {
        following = false;
        await followCamera();
      });
      return;
    }
    case "subscription:dom:element-clicked": {
      const id = e.body.domElementId;
      if (id === session().actionButtonId) {
        await openPanel();
        return;
      }
      const action = toolbarAction(id);
      if (action) enqueue(() => act(action));
      return;
    }
    case "subscription:webview:message": {
      if (e.body.webviewDomId !== session().webviewId) return;
      const message = e.body.message;
      if (typeof message !== "object" || message === null) return;
      handleWebviewMessage(message as WebviewToDriver);
      return;
    }
    default:
      return;
  }
};

const postStyling = (): void =>
  post({
    type: "styling",
    css: stylingCss(session().styling),
    theme: session().styling.theme,
  });

async function openPanel(): Promise<void> {
  await command("command:webview:create", {
    webviewDomId: session().webviewId,
    htmlContent: WEBVIEW_HTML.replace("/*__DRAWDY_STYLING__*/", stylingCss(session().styling)),
    // Keeps the new stamp's settings while the panel is shut.
    keepStateWhenClosed: true,
  });
}

/** The settings every stamp shares, for the panel to show. */
function selectionOf(stamps: Stamp[]): Selection {
  const style: Partial<StampStyle> = {};
  if (stamps.length > 0) {
    for (const key of ["status", "color", "date", "format", "tilt", "lang"] as const) {
      const value = stamps[0].style[key];
      if (stamps.every((s) => s.style[key] === value)) Object.assign(style, { [key]: value });
    }
  }
  return { count: stamps.length, style };
}

const postSelection = (stamps: Stamp[]): void =>
  post({ type: "selection", selection: selectionOf(stamps), recent });

/** Shows the bar and the panel the stamps in the selection, if that's all it holds. */
async function refresh(): Promise<void> {
  const stamps = await stampsAmong(selected);
  closeMenu();
  if (stamps) await showToolbar(stamps);
  else await hideToolbar();
  postSelection(stamps ?? []);
}

/** Changes the selected stamps, and tells the panel when it goes wrong. */
async function edit(change: (stamps: Stamp[]) => Partial<StampStyle>): Promise<void> {
  const stamps = await stampsAmong(selected);
  if (!stamps) return;
  try {
    const next = await restamp(stamps, change(stamps));
    // The stamps were redrawn as new images: the next click is about these.
    selected = idsOf(next);
    recent = next[0].style;
    await showToolbar(next);
    postSelection(next);
  } catch (err) {
    post({
      type: "done",
      ok: false,
      text: err instanceof StampError ? err.message : "Couldn't change the stamp.",
    });
  }
}

async function act(action: ToolbarAction): Promise<void> {
  switch (action.type) {
    case "menu":
      return toggleMenu(action.menu);
    case "set":
      closeMenu();
      return edit(() => action.change);
    case "tilt":
      // Mixed stamps all lean; once they all do, they all straighten.
      return edit((stamps) => ({ tilt: !stamps.every((s) => s.style.tilt) }));
    case "pick-date":
      return openPanel();
  }
}

/** Only the settings in `change` that are valid. */
function sanitizeChange(change: unknown): Partial<StampStyle> {
  if (typeof change !== "object" || change === null) return {};
  const given = change as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(sanitizeStyle(change)).filter(([key, value]) => given[key] === value),
  );
}

function handleWebviewMessage(message: WebviewToDriver): void {
  switch (message.type) {
    case "ready": {
      postStyling();
      enqueue(refresh);
      return;
    }
    case "add": {
      const style = sanitizeStyle(message.style);
      enqueue(async () => {
        try {
          await addStamp(style);
          recent = style;
          post({ type: "done", ok: true, text: "Stamped the board." });
        } catch (err) {
          post({
            type: "done",
            ok: false,
            text: err instanceof StampError ? err.message : "Couldn't add the stamp.",
          });
        }
      });
      return;
    }
    case "edit": {
      const change = sanitizeChange(message.change);
      if (Object.keys(change).length === 0) return;
      enqueue(() => edit(() => change));
      return;
    }
  }
}
