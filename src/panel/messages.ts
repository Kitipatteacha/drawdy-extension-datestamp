import type { StampStyle } from "../stamp/style";

export type Theme = "light" | "dark";

export type WebviewToDriver =
  | { type: "ready" }
  | { type: "add"; style: StampStyle }
  | { type: "edit"; change: Partial<StampStyle> };

/**
 * The stamps that are selected: how many, and the settings they all share.
 * A setting they don't agree on is left out.
 */
export type Selection = { count: number; style: Partial<StampStyle> };

export type DriverToWebview =
  | { type: "styling"; css: string; theme: Theme }
  /** `recent` is the look the last stamp was given, which a new one starts from. */
  | { type: "selection"; selection: Selection; recent: StampStyle }
  | { type: "done"; ok: boolean; text: string };
