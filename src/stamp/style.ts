// What a stamp says and how it looks. Shared by the driver and the panel.

/** A status is the icon on the stamp. */
export type Status = {
  key: string;
  label: string;
  /** The icon's drawing: strokes in a 24 × 24 box. */
  icon: string;
};

export const STATUSES = [
  {
    key: "updated",
    label: "Date",
    icon: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  },
  {
    key: "approved",
    label: "Approved",
    icon: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  },
  {
    key: "done",
    label: "Done",
    icon: '<circle cx="12" cy="12" r="9.5"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  },
  {
    key: "review",
    label: "In review",
    icon: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  },
  {
    key: "draft",
    label: "Draft",
    icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  },
  {
    key: "rejected",
    label: "Flagged",
    icon: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  },
] as const satisfies readonly Status[];

export type StatusKey = (typeof STATUSES)[number]["key"];

export type Color = {
  key: string;
  label: string;
  /** The badge, with the first words of the date in white on it. */
  ink: string;
  /** The icon and the rest of the date, a light tint of the ink. */
  tint: string;
  /** A gradient rim in place of the white one. */
  rim?: readonly string[];
  /** A gradient across the badge, left to right, in place of the ink. */
  fill?: readonly string[];
  /** A metallic gradient, top to bottom, for the icon and the rest of the date. */
  shine?: readonly string[];
};

// Fixed colours, like a sticker's: a stamp reads the same on a light or a dark
// board. White keeps above 5:1 on every ink, and every tint above 3:1, as the
// stamp's words are large and bold.
export const COLORS = [
  { key: "black", label: "Black", ink: "#262626", tint: "#a3a3a3" },
  { key: "blue", label: "Blue", ink: "#2d5db1", tint: "#bcd0f5" },
  { key: "green", label: "Green", ink: "#2b6a3c", tint: "#b4e2c0" },
  { key: "red", label: "Red", ink: "#a2352d", tint: "#f8c9c2" },
  { key: "purple", label: "Purple", ink: "#6c3bc4", tint: "#dccbfb" },
  { key: "orange", label: "Orange", ink: "#b8420f", tint: "#fed7aa" },
  {
    key: "gold",
    label: "Gold",
    ink: "#1c1c1c",
    tint: "#e7c27a",
    rim: ["#f6e2a8", "#b8862f", "#fbeec6", "#9c6b1f", "#f3d68f"],
    shine: ["#fff1c1", "#f0cf7f", "#c9963a", "#e9c46f"],
  },
  // Deep enough at every stop for white words, so it skips a bright yellow.
  {
    key: "rainbow",
    label: "Rainbow",
    ink: "#2e7d32",
    tint: "#fff1c2",
    fill: ["#c62828", "#c2410c", "#a16207", "#2e7d32", "#1565c0", "#6a1b9a"],
  },
] as const satisfies readonly Color[];

export type ColorKey = (typeof COLORS)[number]["key"];

export const LANGUAGES = [
  { key: "en", label: "English" },
  { key: "th", label: "ไทย" },
  { key: "ja", label: "日本語" },
  { key: "zh", label: "中文" },
  { key: "ko", label: "한국어" },
  { key: "es", label: "Español" },
  { key: "fr", label: "Français" },
  { key: "de", label: "Deutsch" },
] as const;

export type LanguageKey = (typeof LANGUAGES)[number]["key"];

/** The formats by name, then the ones that write the whole date in numbers or short. */
export const FORMATS = [
  "weekday-mmm-d",
  "weekday",
  "long",
  "mmmm",
  "mmmm-yyyy",
  "q",
  "quarter",
  "yyyy",
  "d-mmm-yyyy",
  "mmm-d-yyyy",
  "dd/mm/yyyy",
  "mm/dd/yyyy",
  "yyyy-mm-dd",
] as const;

export type FormatKey = (typeof FORMATS)[number];

/** Where the second group of formats starts. */
export const FIRST_EXACT_FORMAT: FormatKey = "d-mmm-yyyy";

/** What each format writes, the way FigJam names them: a Day is a weekday, a Date a day of the month. */
export const FORMAT_LABELS: Record<FormatKey, string> = {
  "weekday-mmm-d": "Day+Date",
  weekday: "Day",
  long: "Day+Month+Year",
  mmmm: "Month",
  "mmmm-yyyy": "Month+Year",
  q: "Quarter",
  quarter: "Quarter+Year",
  yyyy: "Year",
  "d-mmm-yyyy": "Date+Month+Year",
  "mmm-d-yyyy": "Month+Date+Year",
  "dd/mm/yyyy": "DD/MM/YYYY",
  "mm/dd/yyyy": "MM/DD/YYYY",
  "yyyy-mm-dd": "YYYY-MM-DD",
};

/** A stamp's settings. `date` is a calendar day, `yyyy-mm-dd`. */
export type StampStyle = {
  status: StatusKey;
  color: ColorKey;
  date: string;
  format: FormatKey;
  /** Leans the stamp a little, like a sticker slapped on. */
  tilt: boolean;
  lang: LanguageKey;
};

export const statusOf = (key: StatusKey): Status =>
  STATUSES.find((s) => s.key === key) ?? STATUSES[0];

export const colorOf = (key: ColorKey): Color => COLORS.find((c) => c.key === key) ?? COLORS[0];

/** A colour as a CSS background for the panel: the badge's gradient, the rim's, or the ink. */
export function swatchCss(color: Color): string {
  const stops = color.fill ?? color.rim;
  return stops ? `linear-gradient(135deg, ${stops.join(", ")})` : color.ink;
}

export const languageOf = (key: LanguageKey): (typeof LANGUAGES)[number] =>
  LANGUAGES.find((l) => l.key === key) ?? LANGUAGES[0];

/** A status's icon as an svg document, stroked in `color`. */
export const iconSvg = (key: StatusKey, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
  `stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${statusOf(key).icon}</svg>`;

export const svgDataUri = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number): string => String(n).padStart(2, "0");

/** Today on this device's clock, as `yyyy-mm-dd`. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The day `iso` names, or null when it isn't a real `yyyy-mm-dd` day. */
export function parseIso(iso: unknown): Date | null {
  if (typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d
    ? date
    : null;
}

/** `iso` moved by `days`, or today moved when there's no date to move. */
export function shiftIso(iso: string, days: number): string {
  const date = parseIso(iso) ?? new Date();
  date.setDate(date.getDate() + days);
  return todayIso(date);
}

/**
 * How other languages write each format. They put the parts in their own
 * order, so the two orders of day and month become one. Numeric formats and
 * the quarter are written the same everywhere.
 */
const INTL: Partial<Record<FormatKey, Intl.DateTimeFormatOptions>> = {
  "weekday-mmm-d": { weekday: "long", month: "short", day: "numeric" },
  "d-mmm-yyyy": { day: "numeric", month: "short", year: "numeric" },
  "mmm-d-yyyy": { day: "numeric", month: "short", year: "numeric" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  weekday: { weekday: "long" },
  mmmm: { month: "long" },
  "mmmm-yyyy": { month: "long", year: "numeric" },
  yyyy: { year: "numeric" },
};

/** Splits a date written by Intl into its lead and the rest, as `datePhrases` does. */
function splitParts(parts: Intl.DateTimeFormatPart[]): [string, string] {
  const text = (from: number, to = parts.length): string =>
    parts.slice(from, to).map((p) => p.value).join("");
  if (parts[0]?.type === "weekday" && parts.length > 2) return [text(0, 2).trimEnd(), " " + text(2).trimStart()];
  const last = parts.length - 1;
  if (parts[last]?.type === "year" && last >= 2) return [text(0, last - 1), text(last - 1)];
  return [text(0), ""];
}

/**
 * The date as the stamp writes it, in two phrases: the lead, in white, and
 * the rest, in the colour's tint, as in "Saturday," and " Oct 24".
 */
export function datePhrases(iso: string, format: FormatKey, lang: LanguageKey = "en"): [string, string] {
  const date = parseIso(iso) ?? new Date();
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  const month = MONTHS[m];
  const options = INTL[format];
  if (lang !== "en" && options) {
    try {
      return splitParts(new Intl.DateTimeFormat(lang, options).formatToParts(date));
    } catch {
      // A language the device can't write falls back to English.
    }
  }
  switch (format) {
    case "weekday-mmm-d":
      return [`${DAYS[date.getDay()]},`, ` ${month.slice(0, 3)} ${d}`];
    case "d-mmm-yyyy":
      return [`${d} ${month.slice(0, 3)}`, ` ${y}`];
    case "mmm-d-yyyy":
      return [`${month.slice(0, 3)} ${d},`, ` ${y}`];
    case "long":
      return [`${DAYS[date.getDay()]},`, ` ${d} ${month} ${y}`];
    case "dd/mm/yyyy":
      return [`${pad(d)}/${pad(m + 1)}/`, `${y}`];
    case "mm/dd/yyyy":
      return [`${pad(m + 1)}/${pad(d)}/`, `${y}`];
    case "yyyy-mm-dd":
      return [`${y}-${pad(m + 1)}-${pad(d)}`, ""];
    case "weekday":
      return [DAYS[date.getDay()], ""];
    case "mmmm":
      return [month, ""];
    case "mmmm-yyyy":
      return [month, ` ${y}`];
    case "q":
      return [`Q${Math.floor(m / 3) + 1}`, ""];
    case "quarter":
      return [`Q${Math.floor(m / 3) + 1}`, ` ${y}`];
    case "yyyy":
      return [`${y}`, ""];
  }
}

export const formatDate = (iso: string, format: FormatKey, lang: LanguageKey = "en"): string =>
  datePhrases(iso, format, lang).join("");

export const defaultStyle = (): StampStyle => ({
  status: "updated",
  color: "black",
  date: todayIso(),
  format: "weekday-mmm-d",
  tilt: true,
  lang: "en",
});

/** `value` when it's one of the keys in `list`, else `fallback`. */
const keyIn = <T extends string>(list: readonly { key: T }[], value: unknown, fallback: T): T =>
  list.some((item) => item.key === value) ? (value as T) : fallback;

/** The colour stamps from 0.1.0 got from their status. */
const LEGACY_COLORS: Record<string, ColorKey> = {
  updated: "blue",
  draft: "black",
  review: "orange",
  approved: "green",
  rejected: "red",
};

/** A style from anything, such as a stamp's meta or a panel message. */
export function sanitizeStyle(value: unknown): StampStyle {
  const fallback = defaultStyle();
  if (typeof value !== "object" || value === null) return fallback;
  const v = value as Record<string, unknown>;
  const legacyColor = typeof v.status === "string" ? LEGACY_COLORS[v.status] : undefined;
  return {
    status: keyIn<StatusKey>(STATUSES, v.status, fallback.status),
    color: keyIn<ColorKey>(COLORS, v.color, legacyColor ?? fallback.color),
    date: parseIso(v.date) ? (v.date as string) : fallback.date,
    format: FORMATS.includes(v.format as FormatKey) ? (v.format as FormatKey) : fallback.format,
    tilt: typeof v.tilt === "boolean" ? v.tilt : v.v === 1 ? false : fallback.tilt,
    lang: keyIn<LanguageKey>(LANGUAGES, v.lang, fallback.lang),
  };
}
