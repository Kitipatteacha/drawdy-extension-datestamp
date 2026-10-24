// Builds the panel first and writes it into src/webview-html.ts as
// `WEBVIEW_HTML`, then builds the driver, which imports it. Drawdy's build
// service builds src/ without bundler plugins, so the generated file is
// committed alongside the code it comes from.

import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const CSS_PATH = join(root, "webview", "styles.css");
const JS_PATH = join(root, "dist", "webview.js");
const HTML_MODULE_PATH = join(root, "src", "webview-html.ts");

/** Writes the built panel, with its styles, into src/webview-html.ts. */
function webviewHtml() {
    return {
        name: "webview-html",
        buildStart() {
            this.addWatchFile(CSS_PATH);
        },
        writeBundle() {
            const css = readFileSync(CSS_PATH, "utf8");
            const js = readFileSync(JS_PATH, "utf8").replaceAll(
                "</script",
                "<\\/script"
            );
            const html =
                `<!doctype html><html><head><meta charset="utf-8"/>` +
                `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
                `<style id="styling">:root{/*__DRAWDY_STYLING__*/}</style>` +
                `<style>${css}</style></head><body><div id="app"></div>` +
                `<script>${js}</script></body></html>`;
            const source =
                `// Generated from webview/ by \`pnpm build\`: the panel as one html string.\n` +
                `// Committed because Drawdy's build service can't run bundler plugins.\n` +
                `// Don't edit it by hand.\n\n` +
                `export const WEBVIEW_HTML = ${JSON.stringify(html)};\n`;
            // Only a change is written, so the dev server's rebuild on save
            // doesn't set off another one.
            if (
                !existsSync(HTML_MODULE_PATH) ||
                readFileSync(HTML_MODULE_PATH, "utf8") !== source
            ) {
                writeFileSync(HTML_MODULE_PATH, source);
            }
        },
    };
}

/** The panel, for the sandboxed iframe. */
const webview = {
    input: join(root, "webview", "index.ts"),
    output: {
        file: JS_PATH,
        format: "iife",
    },
    plugins: [
        typescript({ tsconfig: join(root, "tsconfig.json") }),
        terser(),
        webviewHtml(),
    ],
};

const driver = {
    input: join(root, "src", "index.ts"),
    output: {
        file: join(root, "dist", "main.js"),
        format: "cjs",
        exports: "named",
    },
    plugins: [typescript({ tsconfig: join(root, "tsconfig.json") })],
};

export default [webview, driver];
