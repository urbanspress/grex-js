/**
 * Zero-dependency release asset builder for Grex JS.
 * Produces a self-contained browser ES module bundle, compacted .min.js,
 * and compiled --grex-* stylesheet for /static/grex/ and GitHub Releases.
 */

import fs from "node:fs";
import path from "node:path";
import { compileElementStyles, compileTokenCss } from "../src/tokens.js";

const VERSION = "v0.2.0";
const ROOT = path.resolve(".");
const SRC_DIR = path.join(ROOT, "src");
const DIST_DIR = path.join(ROOT, "dist");
const EXAMPLE_GREX_DIR = path.join(ROOT, "examples", "grisp-basic", "public", "grex");

const MODULE_ORDER = [
  "signals.js",
  "security.js",
  "tokens.js",
  "dom.js",
  "elements.js",
  "bridge.js",
];

function stripLocalImports(source) {
  return source
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+"\.\/[^"]+";\r?\n?/gm, "")
    .replace(/^import\s+[^;]+;\r?\n?/gm, "")
    .trim();
}

function compactJs(source) {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"))
      .join("\n")
      .trim() + "\n"
  );
}

function buildBundle() {
  const parts = MODULE_ORDER.map((file) => {
    const raw = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
    return `// --- ${file} ---\n${stripLocalImports(raw)}`;
  });

  const banner = `/* Grex JS ${VERSION} | MIT License | Zero-build browser ES module */\n`;
  return `${banner}\n${parts.join("\n\n")}\n`;
}

function buildDefaultTokensCss() {
  const baseTokens = compileTokenCss({
    root: {
      "--grex-bg": "#f8fafc",
      "--grex-surface": "#ffffff",
      "--grex-ink": "#0f172a",
      "--grex-muted": "#475569",
      "--grex-accent": "#0d9488",
      "--grex-accent-ink": "#ffffff",
      "--grex-radius": "12px",
      "--grex-space-sm": "12px",
      "--grex-space-md": "24px",
      "--grex-space-lg": "48px",
      "--grex-max-width": "960px",
    },
    selectors: {
      ".grex-section": {
        base: { "--grex-pad": "48px" },
        tablet: { "--grex-pad": "32px" },
        mobile: { "--grex-pad": "20px" },
      },
    },
  });

  const elementCss = compileElementStyles({
    type: "Grid",
    id: "catalog-grid",
    styles: {
      base: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "24px" },
      tablet: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" },
      mobile: { gridTemplateColumns: "1fr", gap: "12px" },
    },
  });

  return `${baseTokens}\n${elementCss}`;
}

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(EXAMPLE_GREX_DIR, { recursive: true });

const bundle = buildBundle();
const minified = `/* Grex JS ${VERSION} | MIT */\n${compactJs(bundle)}`;
const tokensCss = buildDefaultTokensCss();

fs.writeFileSync(path.join(DIST_DIR, `grex-js-${VERSION}.js`), bundle, "utf8");
fs.writeFileSync(path.join(DIST_DIR, `grex-js-${VERSION}.min.js`), minified, "utf8");
fs.writeFileSync(path.join(DIST_DIR, `grex-tokens-${VERSION}.css`), tokensCss, "utf8");

fs.writeFileSync(path.join(EXAMPLE_GREX_DIR, "grex.js"), bundle, "utf8");
fs.writeFileSync(path.join(EXAMPLE_GREX_DIR, "tokens.css"), tokensCss, "utf8");

console.log(`Built Grex JS ${VERSION} assets in dist/ and examples/grisp-basic/public/grex/`);
