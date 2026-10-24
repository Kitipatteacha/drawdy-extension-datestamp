import type {
  DriverToWebview,
  Selection,
  WebviewToDriver,
} from "../src/panel/messages";
import { stampUrl } from "../src/stamp/draw";
import {
  colorOf,
  defaultStyle,
  formatDate,
  parseIso,
  shiftIso,
  StampStyle,
  swatchCss,
  todayIso,
} from "../src/stamp/style";

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

function pick(date: string): void {
  if (editing()) {
    state.selection = {
      ...state.selection,
      style: { ...state.selection.style, date },
    };
    send({ type: "edit", change: { date } });
  } else {
    state.draft = { ...state.draft, date };
  }
  showMonth(date);
  render();
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

function header(): HTMLElement {
  const count = state.selection.count;
  return h(
    "header",
    { class: editing() ? "mode editing" : "mode" },
    h("span", { class: "mode-dot", "aria-hidden": "true" }),
    h(
      "span",
      { class: "mode-title" },
      editing()
        ? count === 1
          ? "Editing the selected stamp"
          : `Editing ${count} stamps`
        : "New stamp",
    ),
  );
}

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

/** Names in the stamp's language, so the calendar reads like the stamp. */
function names(lang: string): {
  month: string;
  year: string;
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
    say({ weekday: "short" }, new Date(2026, 0, 4 + i)),
  );
  return {
    month: say({ month: "long" }, first),
    year: say({ year: "numeric" }, first),
    weekdays,
  };
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
  const { month: monthName, year: yearName, weekdays } = names(style.lang);
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

  const quick = (label: string, date: string, star = false): HTMLElement =>
    h(
      "button",
      {
        class: star ? "quick today" : "quick",
        type: "button",
        "data-focus": `quick:${label}`,
        "aria-pressed": String(date === chosen),
        onclick: () => pick(date),
      },
      star ? h("span", { class: "star", "aria-hidden": "true" }, "★") : null,
      label,
    );

  const weeks: HTMLElement[] = [];
  for (let w = 0; w < 6; w++)
    weeks.push(
      h("div", { class: "week", role: "row" }, ...days.slice(w * 7, w * 7 + 7)),
    );

  const card = h(
    "section",
    { class: "calendar", "aria-label": "Date" },
    h(
      "div",
      { class: "month" },
      h(
        "button",
        {
          class: "nav",
          type: "button",
          "aria-label": "Previous month",
          "data-focus": "prev",
          onclick: () => turn(-1),
        },
        "‹",
      ),
      h(
        "h2",
        { "aria-live": "polite" },
        h("span", {}, monthName),
        " ",
        h("span", { class: "year" }, yearName),
      ),
      h(
        "button",
        {
          class: "nav",
          type: "button",
          "aria-label": "Next month",
          "data-focus": "next",
          onclick: () => turn(1),
        },
        "›",
      ),
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
    h(
      "div",
      { class: "quicks" },
      quick("Yesterday", shiftIso(today, -1)),
      quick("Today", today, true),
      quick("Tomorrow", shiftIso(today, 1)),
    ),
  );
  // The chosen day wears the stamp's colour, gradient and all.
  const color = colorOf(style.color);
  card.style.setProperty("--ink", color.fill ? swatchCss(color) : color.ink);
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
  main.replaceChildren(header(), preview(style), calendar(style), footer());
  if (focused)
    main.querySelector<HTMLElement>(`[data-focus="${focused}"]`)?.focus();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    add();
  }
});

/* ------------------------------------------------------------------ */
/* Driver                                                               */
/* ------------------------------------------------------------------ */

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
      state.draft = { ...message.recent, date: state.draft.date };
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
