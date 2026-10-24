import type { DrawdyElementSchema } from "@drawdy/driver-protocol";

import { colorOf, datePhrases, StampStyle, statusOf, svgDataUri } from "./style";

/**
 * A stamp is one image, drawn here as an svg like a sticker: a white rim and
 * a soft shadow around a badge in the colour's ink, with the status's icon
 * and the date on it, leaning a little when tilted. The image carries the
 * stamp's settings in its meta, so a new look redraws it from them. Shared by
 * the driver and the panel, whose preview is this same picture.
 */
export const META_KEY = "datestamp";
export type StampMeta = StampStyle & { v: 2 };

export type Rect = { x: number; y: number; width: number; height: number };

const FONT = 21;
const FONT_FAMILY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const ICON = 24;
/** Room around the badge for its shadow. */
const MARGIN = 7;
/** The white rim, and the badge inside it. */
const RIM = 4;
const BADGE_HEIGHT = 46;
const RADIUS = 11;
/** Rim to icon, icon to date, and date to rim. */
const PAD_LEFT = 14;
const ICON_GAP = 11;
const PAD_RIGHT = 18;
/** How far a tilted stamp leans, clockwise. */
const TILT_DEGREES = 2.5;

let canvas: OffscreenCanvasRenderingContext2D | null | undefined;

/** How wide `text` is in the stamp's bold font, measured when the canvas allows. */
function measure(text: string): number {
  if (canvas === undefined) {
    try {
      canvas = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
    } catch {
      canvas = null;
    }
  }
  if (canvas) {
    canvas.font = `700 ${FONT}px ${FONT_FAMILY}`;
    return Math.ceil(canvas.measureText(text).width);
  }
  // Rough widths of a bold sans, as fractions of the font size.
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.27;
    else if (/[,./\-:]/.test(ch)) em += 0.32;
    else if (/[0-9]/.test(ch)) em += 0.62;
    else if (/[A-Z]/.test(ch)) em += 0.7;
    else em += 0.58;
  }
  return Math.ceil(em * FONT);
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The stamp's picture, at its own size. */
export function stampSvg(style: StampStyle): { svg: string; width: number; height: number } {
  const status = statusOf(style.status);
  const color = colorOf(style.color);
  const [lead, rest] = datePhrases(style.date, style.format, style.lang);
  const leadWidth = measure(lead);
  const restWidth = rest ? measure(rest) : 0;

  // The sticker, before it leans.
  const badgeWidth = PAD_LEFT + ICON + ICON_GAP + leadWidth + restWidth + PAD_RIGHT;
  const w = badgeWidth + RIM * 2 + MARGIN * 2;
  const h = BADGE_HEIGHT + RIM * 2 + MARGIN * 2;
  // Its bounds once it leans.
  const angle = style.tilt ? (TILT_DEGREES * Math.PI) / 180 : 0;
  const width = Math.ceil(w * Math.cos(angle) + h * Math.sin(angle));
  const height = Math.ceil(w * Math.sin(angle) + h * Math.cos(angle));

  const left = MARGIN + RIM;
  const middle = h / 2;
  const iconX = left + PAD_LEFT;
  const leadX = iconX + ICON + ICON_GAP;
  const restX = leadX + leadWidth;
  // Gradients are laid out in the space of what they paint, so an icon's
  // straight strokes, which have no width or height, are painted too.
  const gradient = (id: string, stops: readonly string[] | undefined, x1: number, y1: number, x2: number, y2: number): string =>
    stops
      ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("") +
        `</linearGradient>`
      : "";
  const outer = { x: MARGIN, y: MARGIN, width: badgeWidth + RIM * 2, height: BADGE_HEIGHT + RIM * 2 };
  const gradients =
    gradient("rim", color.rim, outer.x, outer.y, outer.x + outer.width, outer.y + outer.height) +
    gradient("fill", color.fill, left, 0, left + badgeWidth, 0) +
    gradient("shine-icon", color.shine, 0, 2, 0, 22) +
    gradient("shine-text", color.shine, 0, middle - FONT / 2, 0, middle + FONT / 2);
  const tint = (id: string): string => (color.shine ? `url(#${id})` : color.tint);
  // Every machine draws the words in its own font, so they're held to the
  // widths the badge was sized for.
  const text = (x: number, length: number, fill: string, words: string): string =>
    `<text x="${x}" y="${middle}" textLength="${length}" lengthAdjust="spacingAndGlyphs" ` +
    `fill="${fill}" dominant-baseline="central" xml:space="preserve">${escapeXml(words)}</text>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>` +
    `<filter id="shadow" x="-10%" y="-30%" width="120%" height="160%">` +
    `<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.28"/>` +
    `</filter>` +
    `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0.16"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
    `</linearGradient>` +
    gradients +
    `</defs>` +
    `<g transform="translate(${width / 2} ${height / 2}) rotate(${style.tilt ? TILT_DEGREES : 0}) translate(${-w / 2} ${-h / 2})">` +
    `<rect x="${outer.x}" y="${outer.y}" width="${outer.width}" height="${outer.height}" ` +
    `rx="${RADIUS + RIM}" fill="${color.rim ? "url(#rim)" : "#fff"}" filter="url(#shadow)"/>` +
    `<rect x="${left}" y="${left}" width="${badgeWidth}" height="${BADGE_HEIGHT}" rx="${RADIUS}" ` +
    `fill="${color.fill ? "url(#fill)" : color.ink}"/>` +
    `<rect x="${left}" y="${left}" width="${badgeWidth}" height="${BADGE_HEIGHT}" rx="${RADIUS}" fill="url(#sheen)"/>` +
    `<g transform="translate(${iconX} ${middle - ICON / 2}) scale(${ICON / 24})" fill="none" ` +
    `stroke="${tint("shine-icon")}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${status.icon}</g>` +
    `<g font-family="${FONT_FAMILY}" font-size="${FONT}" font-weight="700" letter-spacing="-0.2">` +
    text(leadX, leadWidth, "#fff", lead) +
    (rest ? text(restX, restWidth, tint("shine-text"), rest) : "") +
    `</g>` +
    `</g>` +
    `</svg>`;
  return { svg, width, height };
}

export const stampUrl = (style: StampStyle): string => svgDataUri(stampSvg(style).svg);

/**
 * A stamp as an element, with its top-left at `at`. `scale` keeps the size
 * the user resized it to.
 */
export function stampElement(
  id: string,
  at: { x: number; y: number },
  style: StampStyle,
  scale = 1,
): DrawdyElementSchema {
  const { svg, width, height } = stampSvg(style);
  return {
    type: "image",
    drawdyElementId: id,
    x: at.x,
    y: at.y,
    width: width * scale,
    height: height * scale,
    url: svgDataUri(svg),
    // A stamp is redrawn from its settings, so there's nothing to crop or replace.
    isEditable: false,
    meta: { [META_KEY]: { v: 2, ...style } satisfies StampMeta },
  };
}
