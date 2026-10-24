import type { DrawdyElementSchema } from "@drawdy/driver-protocol";

import { colorOf, datePhrases, StampStyle, statusOf, svgDataUri } from "./style";

/**
 * A stamp is one image, drawn here as an svg like a sticker: a white rim and
 * a soft shadow around a rounded badge in the colour's ink, with the status's
 * icon in a disc on the left and the date beside it, its first words in full
 * and the rest softer. It leans a little when tilted. The image carries the
 * stamp's settings in its meta, so a new look redraws it from them. Shared by
 * the driver and the panel, whose preview is this same picture.
 */
export const META_KEY = "datestamp";
export type StampMeta = StampStyle & { v: 2 };

export type Rect = { x: number; y: number; width: number; height: number };

// Drawdy's brand face first, where the viewer has it.
const FAMILY =
  "'Google Sans Flex', 'Google Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DATE_FONT = 20;
/** The date's first words, and the rest. */
const LEAD_OPACITY = 0.95;
const REST_OPACITY = 0.6;
/** Room around the badge for its shadow. */
const MARGIN = 7;
/** The white rim, and the badge inside it. */
const RIM = 3.5;
const BADGE_HEIGHT = 46;
const RADIUS = 12;
/** The icon's disc, and the icon in it. */
const DISC = 32;
const ICON = 17;
/** Rim to disc, disc to date, and date to rim. */
const PAD_LEFT = 7;
const GAP = 11;
const PAD_RIGHT = 18;
/** How far a tilted stamp leans, anticlockwise. */
const TILT_DEGREES = -3;

let canvas: OffscreenCanvasRenderingContext2D | null | undefined;

/** How wide `text` is in `font`, measured when the canvas allows, else guessed from `em`. */
function measure(text: string, font: string, size: number, em: number): number {
  if (canvas === undefined) {
    try {
      canvas = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
    } catch {
      canvas = null;
    }
  }
  if (canvas) {
    canvas.font = font;
    return Math.ceil(canvas.measureText(text).width);
  }
  return Math.ceil([...text].length * em * size);
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The stamp's picture, at its own size. */
export function stampSvg(style: StampStyle): { svg: string; width: number; height: number } {
  const status = statusOf(style.status);
  const color = colorOf(style.color);
  const [lead, rest] = datePhrases(style.date, style.format, style.lang);
  const font = `700 ${DATE_FONT}px ${FAMILY}`;
  const leadWidth = measure(lead, font, DATE_FONT, 0.58);
  const restWidth = rest ? measure(rest, font, DATE_FONT, 0.58) : 0;

  // The sticker, before it leans.
  const badgeWidth = PAD_LEFT + DISC + GAP + leadWidth + restWidth + PAD_RIGHT;
  const outer = { x: MARGIN, y: MARGIN, width: badgeWidth + RIM * 2, height: BADGE_HEIGHT + RIM * 2 };
  const w = outer.width + MARGIN * 2;
  const h = outer.height + MARGIN * 2;
  // Its bounds once it leans.
  const angle = style.tilt ? (Math.abs(TILT_DEGREES) * Math.PI) / 180 : 0;
  const width = Math.ceil(w * Math.cos(angle) + h * Math.sin(angle));
  const height = Math.ceil(w * Math.sin(angle) + h * Math.cos(angle));

  const left = MARGIN + RIM;
  const middle = h / 2;
  const disc = { x: left + PAD_LEFT + DISC / 2, y: middle };
  const textX = left + PAD_LEFT + DISC + GAP;
  // Gradients are laid out in the space of what they paint.
  const gradient = (id: string, stops: readonly string[] | undefined, x1: number, y1: number, x2: number, y2: number): string =>
    stops
      ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
        stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("") +
        `</linearGradient>`
      : "";
  const gradients =
    gradient("rim", color.rim, outer.x, outer.y, outer.x + outer.width, outer.y + outer.height) +
    gradient("badge", color.gradient, left, 0, left + badgeWidth, 0) +
    gradient("shine", color.shine, 0, middle - DISC / 2, 0, middle + DISC / 2);
  // Every machine draws the date in its own font, so each phrase is held to
  // the width the badge was sized for.
  const text = (x: number, length: number, opacity: number, words: string): string =>
    `<text x="${x}" y="${middle}" textLength="${length}" lengthAdjust="spacingAndGlyphs" fill-opacity="${opacity}" ` +
    `dominant-baseline="central" xml:space="preserve">${escapeXml(words)}</text>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>` +
    `<filter id="shadow" x="-10%" y="-30%" width="120%" height="160%">` +
    `<feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#000" flood-opacity="0.26"/>` +
    `</filter>` +
    `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0.18"/>` +
    `<stop offset="0.55" stop-color="#fff" stop-opacity="0"/>` +
    `</linearGradient>` +
    gradients +
    `</defs>` +
    `<g transform="translate(${width / 2} ${height / 2}) rotate(${style.tilt ? TILT_DEGREES : 0}) translate(${-w / 2} ${-h / 2})">` +
    `<rect x="${outer.x}" y="${outer.y}" width="${outer.width}" height="${outer.height}" rx="${RADIUS + RIM}" ` +
    `fill="${color.rim ? "url(#rim)" : "#fff"}" filter="url(#shadow)"/>` +
    `<rect x="${left}" y="${left}" width="${badgeWidth}" height="${BADGE_HEIGHT}" rx="${RADIUS}" ` +
    `fill="${color.gradient ? "url(#badge)" : color.ink}"/>` +
    `<rect x="${left}" y="${left}" width="${badgeWidth}" height="${BADGE_HEIGHT}" rx="${RADIUS}" fill="url(#sheen)"/>` +
    `<circle cx="${disc.x}" cy="${disc.y}" r="${DISC / 2}" fill="${color.shine ? "url(#shine)" : color.disc}"/>` +
    `<g transform="translate(${disc.x - ICON / 2} ${disc.y - ICON / 2}) scale(${ICON / 24})" fill="none" ` +
    `stroke="${color.icon}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${status.icon}</g>` +
    `<g fill="${color.text}" font-family="${FAMILY}" font-size="${DATE_FONT}" font-weight="700" letter-spacing="-0.2">` +
    text(textX, leadWidth, LEAD_OPACITY, lead) +
    (rest ? text(textX + leadWidth, restWidth, REST_OPACITY, rest) : "") +
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
