import type {
  DriverToWebview,
  Selection,
  WebviewToDriver,
} from "../src/panel/messages";
import { stampUrl } from "../src/stamp/draw";
import {
  colorOf,
  COLORS,
  defaultStyle,
  formatDate,
  FORMAT_GROUPS,
  FORMAT_LABELS,
  LANGUAGES,
  languageOf,
  parseIso,
  shiftIso,
  StampStyle,
  STATUSES,
  swatchCss,
  todayIso,
} from "../src/stamp/style";

type Menu = "color" | "status" | "format" | "language";

const api = acquireDrawdyApi();
const send = (message: WebviewToDriver): void => api.postMessage(message);

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */

type Props = Record<string, string | boolean | EventListener | undefined>;

function h(
  tag: string,
  props: Props = {},
  ...children: (Node | string | null)[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children) if (child !== null) el.append(child);
  return el;
}

/* ------------------------------------------------------------------ */
/* State                                                                */
/* ------------------------------------------------------------------ */

const state = {
  /**
   * The next new stamp: the date picked here, in the look the last stamp was
   * given on the board.
   */
  draft: defaultStyle(),
  /** The stamps selected on the board, which the panel edits instead. */
  selection: { count: 0, style: {} } as Selection,
  /** Waiting to hear the stamp was added, so a double click adds one. */
  adding: false,
  /** The bar's menu that's open, if any. */
  menu: null as Menu | null,
  /** The month the calendar shows: its year, and its month from 0. */
  view: { year: 0, month: 0 },
};

const editing = (): boolean => state.selection.count > 0;

/** True when the selected stamps aren't all on one day. */
const mixedDates = (): boolean =>
  editing() && state.selection.style.date === undefined;

/** What the panel shows: the selection's settings, or the draft's. */
const shown = (): StampStyle =>
  editing() ? { ...state.draft, ...state.selection.style } : state.draft;

/** Turns the calendar to the month `iso` is in. */
function showMonth(iso: string): void {
  const date = parseIso(iso) ?? new Date();
  state.view = { year: date.getFullYear(), month: date.getMonth() };
}
showMonth(state.draft.date);

/** Changes the selected stamps, or the next new one when none are. */
function set(change: Partial<StampStyle>): void {
  if (editing()) {
    state.selection = {
      ...state.selection,
      style: { ...state.selection.style, ...change },
    };
    send({ type: "edit", change });
  } else {
    state.draft = { ...state.draft, ...change };
  }
  render();
}

function pick(date: string): void {
  showMonth(date);
  set({ date });
}

/* ------------------------------------------------------------------ */
/* Frame                                                                */
/* ------------------------------------------------------------------ */

const main = h("main");
const toastEl = h("div", {
  class: "toast",
  role: "status",
  "aria-live": "polite",
});
document.getElementById("app")!.append(main, toastEl);

let toastTimer = 0;
function toast(text: string, error = false): void {
  toastEl.textContent = text;
  toastEl.classList.toggle("error", error);
  toastEl.classList.add("shown");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => toastEl.classList.remove("shown"),
    error ? 4000 : 2400,
  );
}

/* ------------------------------------------------------------------ */
/* Views                                                                */
/* ------------------------------------------------------------------ */

/** The stamp as it lands on the board, on a patch of dotted board. */
function preview(style: StampStyle): HTMLElement {
  return h(
    "div",
    { class: "preview" },
    h("img", {
      class: "stamp",
      src: stampUrl(style),
      alt: mixedDates()
        ? "Preview: stamps on different days"
        : `Preview: ${formatDate(style.date, style.format, style.lang)}`,
    }),
  );
}

/**
 * A setting as the panel shows it chosen: the selection's when stamps are
 * selected, where a setting they don't share is left unchosen, or the draft's.
 */
const current = <K extends keyof StampStyle>(key: K): StampStyle[K] | undefined =>
  editing() ? state.selection.style[key] : state.draft[key];

/** A glyph's paths in a 24 × 24 box, stroked in the text's colour. */
function glyph(paths: string, size = 16): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

// The toolbar's glyphs.
const CHEVRON = '<path d="m7 10 5 5 5-5"/>';
/** An empty dot, for stamps in different colours. */
const MIXED = '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/>';
/** A label leaning over a level line. */
const TILT = '<path d="M4 20h16"/><rect x="5" y="6" width="13" height="8" rx="1.5" transform="rotate(-12 11.5 10)"/>';

/** A colour's rounded square, gradient and all. */
function swatch(key: StampStyle["color"]): HTMLElement {
  const el = h("span", { class: "swatch", "aria-hidden": "true" });
  el.style.background = swatchCss(colorOf(key));
  return el;
}

/** Picks a setting from a menu, and shuts it. */
function choose(change: Partial<StampStyle>): void {
  state.menu = null;
  set(change);
}

/**
 * A button in the bar that opens `menu`, showing what's chosen. Only the
 * format has the toolbar's chevron: the panel is narrower than the bar, and
 * the format's name needs the room.
 */
function dropdown(menu: Menu, label: string, ...content: (Node | string)[]): HTMLElement {
  const open = state.menu === menu;
  return h(
    "button",
    {
      class: `tool ${menu}`,
      type: "button",
      "aria-label": label,
      title: label,
      "aria-haspopup": "menu",
      "aria-expanded": String(open),
      "data-focus": `menu:${menu}`,
      onclick: () => {
        state.menu = open ? null : menu;
        render();
      },
    },
    h("span", { class: "tool-content" }, ...content),
    menu === "format" ? glyph(CHEVRON, 14) : null,
  );
}

/** One choice in a menu: an icon before its name, and a hint such as an example after. */
function option(
  key: string,
  chosen: boolean,
  label: string,
  change: Partial<StampStyle>,
  hint = "",
  icon: Node | null = null,
): HTMLElement {
  return h(
    "button",
    {
      class: "option",
      type: "button",
      role: "menuitemradio",
      "aria-checked": String(chosen),
      "data-focus": `option:${key}`,
      onclick: () => choose(change),
    },
    h("span", { class: "tool-content" }, icon, label),
    hint ? h("span", { class: "hint" }, hint) : null,
  );
}

function menuOf(menu: Menu, style: StampStyle): HTMLElement {
  const list = (cls: string, ...children: HTMLElement[]): HTMLElement =>
    h("div", { class: `menu ${cls}`, role: "menu" }, ...children);
  switch (menu) {
    case "color":
      // Swatches alone, five to a row, the chosen one ringed.
      return list(
        "colors",
        ...COLORS.map((c) =>
          h(
            "button",
            {
              class: "tile",
              type: "button",
              role: "menuitemradio",
              title: c.label,
              "aria-label": c.label,
              "aria-checked": String(c.key === current("color")),
              "data-focus": `option:color:${c.key}`,
              onclick: () => choose({ color: c.key }),
            },
            swatch(c.key),
          ),
        ),
      );
    case "status":
      return list(
        "statuses",
        ...STATUSES.map((s) =>
          option(`status:${s.key}`, s.key === current("status"), s.label, { status: s.key }, "", glyph(s.icon, 15)),
        ),
      );
    case "format":
      // Each format with what it writes for the stamp's own date.
      return list(
        "formats",
        ...FORMAT_GROUPS.flatMap((group) => [
          h("div", { class: "heading" }, group.label),
          ...group.formats.map((f) =>
            option(
              `format:${f}`,
              f === current("format"),
              FORMAT_LABELS[f],
              { format: f },
              formatDate(style.date, f, style.lang),
            ),
          ),
        ]),
      );
    case "language":
      return list(
        "languages",
        ...LANGUAGES.map((l) => option(`lang:${l.key}`, l.key === current("lang"), l.label, { lang: l.key }, l.code)),
      );
  }
}

/** The toolbar's bar: colour, status, format, tilt and language, with the open menu under it. */
function styleControls(style: StampStyle): HTMLElement {
  const color = current("color");
  const status = STATUSES.find((s) => s.key === current("status"));
  const format = current("format");
  const tilt = current("tilt");
  const divider = (): HTMLElement => h("span", { class: "divider", "aria-hidden": "true" });
  return h(
    "section",
    { class: "style", "aria-label": "Style" },
    h(
      "div",
      { class: "bar" },
      dropdown("color", "Colour", color ? swatch(color) : glyph(MIXED)),
      divider(),
      // The icon alone says the status: the panel is narrower than the bar.
      dropdown("status", status ? `Status: ${status.label}` : "Status", status ? glyph(status.icon, 15) : glyph(MIXED)),
      dropdown("format", format ? `Format: ${FORMAT_LABELS[format]}` : "Format", format ? FORMAT_LABELS[format] : "Format"),
      divider(),
      h(
        "button",
        {
          class: "tool tilt",
          type: "button",
          title: "Tilt",
          "aria-label": "Tilt",
          "aria-pressed": tilt === undefined ? "mixed" : String(tilt),
          "data-focus": "tilt",
          // Mixed stamps all lean, as the bar does it.
          onclick: () => choose({ tilt: tilt !== true }),
        },
        glyph(TILT),
      ),
      divider(),
      dropdown("language", `Language: ${languageOf(style.lang).label}`, languageOf(style.lang).code),
    ),
    state.menu ? menuOf(state.menu, style) : null,
  );
}

/** Names in the stamp's language, so the calendar reads like the stamp. */
function names(lang: string): {
  title: string;
  weekdays: string[];
} {
  const { year, month } = state.view;
  const first = new Date(year, month, 1);
  const say = (options: Intl.DateTimeFormatOptions, date: Date): string => {
    try {
      return new Intl.DateTimeFormat(lang, options).format(date);
    } catch {
      return new Intl.DateTimeFormat("en", options).format(date);
    }
  };
  // 4 Jan 2026 is a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    say({ weekday: "narrow" }, new Date(2026, 0, 4 + i)),
  );
  return { title: say({ month: "long", year: "numeric" }, first), weekdays };
}

const isoOf = (date: Date): string => todayIso(date);

/** Where focus goes after the next redraw, when a key moved it to another day. */
let focusNext: string | null = null;

function onGridKey(e: KeyboardEvent): void {
  const from = (e.target as HTMLElement).dataset.day;
  if (!from) return;
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  let to: string | null = null;
  if (e.key in steps) to = shiftIso(from, steps[e.key]);
  else if (e.key === "PageUp" || e.key === "PageDown") {
    const date = parseIso(from)!;
    date.setMonth(date.getMonth() + (e.key === "PageUp" ? -1 : 1));
    to = isoOf(date);
  }
  if (!to) return;
  e.preventDefault();
  focusNext = `day:${to}`;
  pick(to);
}

function calendar(style: StampStyle): HTMLElement {
  const { year, month } = state.view;
  const { title, weekdays } = names(style.lang);
  const today = todayIso();
  const chosen = mixedDates() ? null : style.date;
  const turn = (by: number): void => {
    const date = new Date(year, month + by, 1);
    state.view = { year: date.getFullYear(), month: date.getMonth() };
    render();
  };

  // One day in the grid takes Tab: the chosen one when it's in this month,
  // or else the 1st. The arrow keys move between days from there.
  const first = isoOf(new Date(year, month, 1));
  const tabDay =
    chosen && chosen.slice(0, 7) === first.slice(0, 7) ? chosen : first;

  // Six weeks from the Sunday on or before the 1st, so every month fits.
  const start = new Date(year, month, 1);
  start.setDate(1 - start.getDay());
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
    const iso = isoOf(date);
    const classes = ["day"];
    if (date.getMonth() !== month) classes.push("outside");
    if (iso === today) classes.push("today");
    const isChosen = iso === chosen;
    if (isChosen) classes.push("chosen");
    const label = date.toLocaleDateString("en", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return h(
      "button",
      {
        class: classes.join(" "),
        type: "button",
        role: "gridcell",
        "data-day": iso,
        "data-focus": `day:${iso}`,
        "aria-label": iso === today ? `${label}, today` : label,
        "aria-selected": String(isChosen),
        tabindex: iso === tabDay ? "0" : "-1",
        onclick: () => pick(iso),
      },
      String(date.getDate()),
    );
  });

  /** A day picked by name, lit up when it's the chosen one. */
  const chip = (label: string, date: string): HTMLElement =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        "data-focus": `chip:${label}`,
        "aria-pressed": String(date === chosen),
        onclick: () => pick(date),
      },
      label,
    );

  const weeks: HTMLElement[] = [];
  for (let w = 0; w < 6; w++)
    weeks.push(
      h("div", { class: "week", role: "row" }, ...days.slice(w * 7, w * 7 + 7)),
    );

  const nav = (label: string, by: number, glyph: string): HTMLElement =>
    h(
      "button",
      {
        class: "nav",
        type: "button",
        "aria-label": label,
        "data-focus": `nav:${by}`,
        onclick: () => turn(by),
      },
      glyph,
    );

  const card = h(
    "section",
    { class: "calendar", "aria-label": "Date" },
    h(
      "div",
      { class: "month" },
      h("h2", { "aria-live": "polite" }, title),
      h("div", { class: "navs" }, nav("Previous month", -1, "‹"), nav("Next month", 1, "›")),
    ),
    h(
      "div",
      { class: "chips" },
      chip("Today", today),
      chip("Tomorrow", shiftIso(today, 1)),
      chip("In a week", shiftIso(today, 7)),
    ),
    h(
      "div",
      { class: "weekdays", "aria-hidden": "true" },
      ...weekdays.map((d) => h("span", {}, d)),
    ),
    h(
      "div",
      { class: "grid", role: "grid", onkeydown: onGridKey as EventListener },
      ...weeks,
    ),
  );
  // The chosen day is marked in the stamp's ink, gradient and all.
  const color = colorOf(style.color);
  card.style.setProperty("--ink", swatchCss(color));
  card.style.setProperty("--on-ink", color.text);
  return card;
}

function add(): void {
  if (state.adding) return;
  state.adding = true;
  send({ type: "add", style: shown() });
  render();
}

function footer(): HTMLElement {
  const button = h(
    "button",
    {
      class: editing() ? "btn wide" : "btn primary wide",
      type: "button",
      "data-focus": "add",
      disabled: state.adding,
      onclick: add,
    },
    state.adding ? "Adding…" : editing() ? "Add as a new stamp" : "Add stamp",
    state.adding
      ? null
      : h("kbd", {}, navigator.platform.startsWith("Mac") ? "⌘↵" : "Ctrl ↵"),
  );
  return h("footer", {}, button);
}

function render(): void {
  const style = shown();
  // Puts focus back where it was, as every redraw makes new controls.
  const focused =
    focusNext ?? (document.activeElement as HTMLElement | null)?.dataset?.focus;
  focusNext = null;
  main.replaceChildren(preview(style), styleControls(style), calendar(style), footer());
  fitMenu();
  if (focused)
    main.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus();
}

/** Lifts the open menu when it would run off the bottom of the panel, as the format's does. */
function fitMenu(): void {
  const menu = main.querySelector<HTMLElement>(".menu");
  if (!menu) return;
  const rect = menu.getBoundingClientRect();
  const bottom = window.innerHeight - 8;
  if (rect.bottom <= bottom) return;
  const top = Math.max(8, bottom - rect.height);
  menu.style.top = `${menu.offsetTop + top - rect.top}px`;
}

// A click outside the open menu, or Escape, shuts it.
document.addEventListener("click", (e) => {
  if (state.menu && !(e.target as HTMLElement).closest?.(".style")) {
    state.menu = null;
    render();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.menu) {
    focusNext = `menu:${state.menu}`;
    state.menu = null;
    render();
    return;
  }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    add();
  }
});

/* ------------------------------------------------------------------ */
/* Driver                                                               */
/* ------------------------------------------------------------------ */

/** The last look the driver said the last stamp was given. */
let lastRecent = "";

api.onMessage((raw) => {
  const message = raw as DriverToWebview;
  switch (message.type) {
    case "styling": {
      document.getElementById("styling")!.textContent = `:root{${message.css}}`;
      document.documentElement.dataset.theme = message.theme;
      return;
    }
    case "selection": {
      const before = state.selection.style.date;
      state.selection = message.selection;
      // Takes up a look given on the board, but keeps one picked here until then.
      const recent = JSON.stringify(message.recent);
      if (recent !== lastRecent) {
        lastRecent = recent;
        state.draft = { ...message.recent, date: state.draft.date };
      }
      // Follows a newly selected stamp to its month.
      const date = message.selection.style.date;
      if (date && date !== before) showMonth(date);
      render();
      return;
    }
    case "done": {
      if (state.adding) {
        state.adding = false;
        render();
      }
      // The stamp landing on the board says it worked; only a failure needs words.
      if (!message.ok) toast(message.text, true);
      return;
    }
  }
});

render();
send({ type: "ready" });
