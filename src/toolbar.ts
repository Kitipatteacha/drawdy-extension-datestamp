import { DomElementSchema } from "@drawdy/driver-protocol";

import { command, session } from "./drawdy-bridge/session";
import { Rect } from "./stamp/draw";
import { idsOf, Stamp } from "./stamp/scene";
import {
  Color,
  colorOf,
  COLORS,
  formatDate,
  FORMAT_GROUPS,
  FORMAT_LABELS,
  FORMATS,
  LANGUAGES,
  languageOf,
  StampStyle,
  STATUSES,
  statusOf,
  svgDataUri,
  swatchStops,
} from "./stamp/style";

/**
 * The bar above selected stamps, in the board's theme: menus for the colour,
 * the status and the format, the date and the tilt, and a menu for the
 * language. A menu opens under the bar, in the same floating element, and
 * shuts once something in it is picked.
 */
export type Menu = "color" | "status" | "format" | "language";

export type ToolbarAction =
  | { type: "pick-date" }
  | { type: "menu"; menu: Menu }
  | { type: "set"; change: Partial<StampStyle> }
  | { type: "tilt" };

/* ------------------------------------------------------------------ */
/* Look                                                                 */
/* ------------------------------------------------------------------ */

/** The board's theme, as the bar paints it. */
type Theme = {
  surface: string;
  edge: string;
  text: string;
  muted: string;
  hover: string;
  chosen: string;
};

function theme(): Theme {
  const { styling } = session();
  const t = (name: string, fallback: string): string =>
    (styling.tokens as Record<string, string> | undefined)?.[name] ?? fallback;
  return {
    surface: t("--dd-surface-elevated", styling.background),
    edge: t("--dd-border-subtle", styling.border),
    text: t("--dd-text-primary", styling.foreground),
    muted: t("--dd-text-secondary", styling.mutedForeground),
    hover: t("--dd-interaction-hover", "rgba(127, 127, 127, 0.12)"),
    chosen: t("--dd-interaction-active", "rgba(127, 127, 127, 0.2)"),
  };
}

const HEIGHT = 42;
const PAD = 4;
const GAP = 4;
/** Between the bar and the stamps, the bar and the window's edges, and the bar and its menu. */
const OFFSET = 12;
const MARGIN = 8;
const MENU_GAP = 6;
const SWATCH = 16;

/** Each piece of the bar, in order, with its width. */
const SEGMENTS = [
  { name: "color", width: 48 },
  { name: "divider", width: 1 },
  { name: "status", width: 128 },
  { name: "format", width: 150 },
  { name: "divider", width: 1 },
  { name: "date", width: 32 },
  { name: "tilt", width: 32 },
  { name: "divider", width: 1 },
  { name: "language", width: 58 },
] as const;

const WIDTH =
  PAD * 2 + 2 + SEGMENTS.reduce((sum, s) => sum + s.width, 0) + GAP * (SEGMENTS.length - 1);

/** Where a segment starts, from the bar's left edge. */
function offsetOf(name: string): number {
  let x = PAD + 1;
  for (const segment of SEGMENTS) {
    if (segment.name === name) return x;
    x += segment.width + GAP;
  }
  return x;
}

const glyph = (paths: string, color: string, size = 16): DomElementSchema => ({
  type: "image",
  child: svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
      `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
  ),
  styles: { width: [size, "px"], height: [size, "px"], pointerEvents: "none" },
});

const CHEVRON = '<path d="m7 10 5 5 5-5"/>';
/** An empty dot, for stamps in different colours. */
const MIXED = '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>';
const CALENDAR = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>';
/** A label leaning over a level line. */
const TILT = '<path d="M4 20h16"/><rect x="5" y="6" width="13" height="8" rx="1.5" transform="rotate(-12 11.5 10)"/>';

const words = (text: string, color: string, size = 12, weight: "medium" | "semibold" = "medium"): DomElementSchema => ({
  type: "text",
  child: text,
  styles: { color, fontSize: [size, "px"], fontWeight: weight, pointerEvents: "none" },
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

/* ------------------------------------------------------------------ */
/* Buttons                                                              */
/* ------------------------------------------------------------------ */

const domId = (): string => `${session().manifest.driverId}:toolbar`;
const buttonId = (name: string): string => `${domId()}:${name}`;

const BUTTONS: { name: string; action: ToolbarAction }[] = [
  { name: "date", action: { type: "pick-date" } },
  { name: "tilt", action: { type: "tilt" } },
  ...(["color", "status", "format", "language"] as const).map((menu) => ({
    name: `menu:${menu}`,
    action: { type: "menu", menu } as const,
  })),
  ...COLORS.map((c) => ({ name: `color:${c.key}`, action: { type: "set", change: { color: c.key } } as const })),
  ...STATUSES.map((s) => ({ name: `status:${s.key}`, action: { type: "set", change: { status: s.key } } as const })),
  ...FORMATS.map((f) => ({ name: `format:${f}`, action: { type: "set", change: { format: f } } as const })),
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

function button(th: Theme, name: string, width: number, children: DomElementSchema[], chosen = false): DomElementSchema {
  return {
    type: "button",
    domId: buttonId(name),
    styles: {
      width: [width, "px"],
      height: [32, "px"],
      padding: [7, "px"],
      borderRadius: [8, "px"],
      backgroundColor: chosen ? th.chosen : "transparent",
      cursor: "pointer",
      hover: { backgroundColor: chosen ? th.chosen : th.hover },
    },
    children,
  };
}

function dropdown(th: Theme, menu: Menu, width: number, open: boolean, content: DomElementSchema[]): DomElementSchema {
  return button(th, `menu:${menu}`, width, [row(6, [row(6, content), glyph(CHEVRON, th.muted, 14)], true)], open);
}

const divider = (th: Theme): DomElementSchema => ({
  type: "box",
  styles: { width: [1, "px"], height: [20, "px"], backgroundColor: th.edge },
});

/**
 * A colour's swatch, a rounded square drawn as an image: Drawdy sets
 * `backgroundColor` as CSS `background-color`, which can't hold Gold's or
 * Rainbow's gradient. A faint grey edge keeps Black from vanishing on a dark
 * bar, and pale inks on a light one.
 */
function colorSwatch(color: Color, size: number): DomElementSchema {
  const stops = swatchStops(color);
  const paint =
    stops.length > 1
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("") +
        `</linearGradient></defs>`
      : "";
  return {
    type: "image",
    child: svgDataUri(
      // Drawn at its own pixel size, its 1px edge on the half pixel, so the
      // edge lands on whole pixels instead of blurring across two.
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paint}` +
        `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${Math.round(size / 4)}" ` +
        `fill="${stops.length > 1 ? "url(#g)" : stops[0]}" stroke="rgba(127, 127, 127, 0.45)" stroke-width="1"/></svg>`,
    ),
    styles: { width: [size, "px"], height: [size, "px"], pointerEvents: "none" },
  };
}

function bar(th: Theme, shown: Shown, open: Menu | null): DomElementSchema {
  const color = shown.color ? colorSwatch(colorOf(shown.color), SWATCH) : glyph(MIXED, th.muted, SWATCH);
  const status = shown.status ? statusOf(shown.status) : null;
  const format = shown.format ? FORMAT_LABELS[shown.format] : "Format";
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
      backgroundColor: th.surface,
      borderColor: th.edge,
      borderType: "solid",
      borderWidth: [1, "px"],
      borderRadius: [10, "px"],
      pointerEvents: "auto",
    },
    children: [
      dropdown(th, "color", 48, open === "color", [color]),
      divider(th),
      dropdown(th, "status", 128, open === "status", [
        ...(status ? [glyph(status.icon, th.text, 15)] : []),
        words(status ? status.label : "Status", th.text),
      ]),
      dropdown(th, "format", 150, open === "format", [words(format, th.text)]),
      divider(th),
      button(th, "date", 32, [glyph(CALENDAR, th.text)]),
      button(th, "tilt", 32, [glyph(TILT, shown.tilt ? th.text : th.muted)], shown.tilt === true),
      divider(th),
      dropdown(th, "language", 58, open === "language", [words(languageOf(shown.lang ?? "en").code, th.text)]),
    ],
  };
}

/**
 * One choice in a menu: its name, an icon before it (a glyph's paths, or an
 * element such as a colour's dot), and on the right a hint such as an example.
 */
function option(
  th: Theme,
  name: string,
  chosen: boolean,
  label: string,
  hint = "",
  icon: string | DomElementSchema = "",
): DomElementSchema {
  const lead = typeof icon === "string" ? (icon ? [glyph(icon, th.text, 15)] : []) : [icon];
  return {
    type: "button",
    domId: buttonId(name),
    styles: {
      width: [100, "%"],
      height: [30, "px"],
      padding: [8, "px"],
      borderRadius: [6, "px"],
      backgroundColor: chosen ? th.chosen : "transparent",
      cursor: "pointer",
      hover: { backgroundColor: chosen ? th.chosen : th.hover },
    },
    children: [
      row(
        12,
        [
          row(8, [...lead, words(label, th.text, 12, chosen ? "semibold" : "medium")]),
          ...(hint ? [words(hint, th.muted, 11)] : []),
        ],
        true,
      ),
    ],
  };
}

/** A group's name in a menu. */
const heading = (th: Theme, text: string): DomElementSchema => ({
  type: "text",
  child: text.toUpperCase(),
  styles: { color: th.muted, fontSize: [10, "px"], fontWeight: "semibold", padding: [6, "px"], pointerEvents: "none" },
});

/** The colour menu's grid: its columns, a swatch's size, and the gap between them. */
const COLOR_COLUMNS = 5;
const COLOR_TILE = 26;
const COLOR_GAP = 6;

function menuOf(th: Theme, menu: Menu, shown: Shown): DomElementSchema {
  const panel = (children: DomElementSchema[], width: number): DomElementSchema => ({
    type: "column",
    styles: {
      width: [width, "px"],
      padding: [4, "px"],
      gap: 1,
      backgroundColor: th.surface,
      borderColor: th.edge,
      borderType: "solid",
      borderWidth: [1, "px"],
      borderRadius: [10, "px"],
      pointerEvents: "auto",
    },
    children,
  });
  switch (menu) {
    case "color":
      // Swatches alone, five to a row, the chosen one ringed in the text colour.
      return panel(
        [
          {
            type: "grid",
            styles: { columns: COLOR_COLUMNS, gap: COLOR_GAP },
            children: COLORS.map((c) => ({
              type: "button",
              domId: buttonId(`color:${c.key}`),
              styles: {
                padding: [2, "px"],
                borderRadius: [9, "px"],
                borderType: "solid",
                borderWidth: [2, "px"],
                borderColor: c.key === shown.color ? th.text : "transparent",
                backgroundColor: "transparent",
                cursor: "pointer",
                hover: { borderColor: c.key === shown.color ? th.text : th.edge },
              },
              children: [colorSwatch(c, COLOR_TILE)],
            })),
          },
        ],
        // Each tile with its ring, the gaps between them, the padding and the edge.
        COLOR_COLUMNS * (COLOR_TILE + 8) + (COLOR_COLUMNS - 1) * COLOR_GAP + 10,
      );
    case "status":
      return panel(
        STATUSES.map((s) => option(th, `status:${s.key}`, s.key === shown.status, s.label, "", s.icon)),
        160,
      );
    case "format":
      // Each format with what it writes for the stamp's own date.
      return panel(
        FORMAT_GROUPS.flatMap((group) => [
          heading(th, group.label),
          ...group.formats.map((f) =>
            option(
              th,
              `format:${f}`,
              f === shown.format,
              FORMAT_LABELS[f],
              formatDate(shown.date ?? "", f, shown.lang ?? "en"),
            ),
          ),
        ]),
        280,
      );
    case "language":
      return panel(
        LANGUAGES.map((l) => option(th, `lang:${l.key}`, l.key === shown.lang, l.label, l.code)),
        150,
      );
  }
}

/**
 * The bar, with the open menu under it. The tree keeps one shape whether a
 * menu is open or not: Drawdy renders it with React, and a change of shape
 * would rebuild the bar and make its icons blink.
 */
function schema(shown: Shown, open: Menu | null): DomElementSchema {
  const th = theme();
  const menu: DomElementSchema[] = open
    ? [
        {
          type: "row",
          domId: `${domId()}:menu`,
          styles: { pointerEvents: "none" },
          children: [
            { type: "box", styles: { width: [offsetOf(open), "px"], height: [1, "px"], pointerEvents: "none" } },
            menuOf(th, open, shown),
          ],
        },
      ]
    : [];
  // Lets clicks through around the bar and the menu.
  return {
    type: "column",
    styles: { gap: MENU_GAP, crossAxisAlignment: "start", pointerEvents: "none" },
    children: [bar(th, shown, open), ...menu],
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

/** Redraws the bar in the board's new theme, if it's up. */
export const restyleToolbar = (): Promise<void> => draw();

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
