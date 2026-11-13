/**
 * Grex JS v0.1 Responsive --grex-* Design Tokens & /static/grex/ CSS Compiler (ADR-027b).
 */

import { GrexSecurityError } from "./security.js";

export const DEFAULT_BREAKPOINTS = Object.freeze({
  base: null,
  tablet: "(max-width: 1024px)",
  mobile: "(max-width: 640px)",
});

const UNSAFE_CSS_VALUE_PATTERN = /[;{}]|<\/style|expression\s*\(|javascript:/i;

/**
 * Normalize and validate a --grex-* CSS custom property name.
 * @param {string} name
 * @returns {string}
 */
export function normalizeTokenName(name) {
  if (typeof name !== "string") {
    throw new GrexSecurityError("Token name must be a string.");
  }
  const trimmed = name.trim();
  const normalized = trimmed.startsWith("--grex-")
    ? trimmed
    : trimmed.startsWith("--")
      ? `--grex-${trimmed.slice(2)}`
      : `--grex-${trimmed}`;

  if (!/^--grex-[a-z0-9-]+$/i.test(normalized)) {
    throw new GrexSecurityError(`Invalid --grex-* token name: "${name}".`);
  }
  return normalized.toLowerCase();
}

/**
 * Validate a CSS token value to prevent style-block injection.
 * @param {unknown} value
 * @returns {string}
 */
export function validateTokenValue(value) {
  if (value == null) {
    return "";
  }
  const str = String(value).trim();
  if (UNSAFE_CSS_VALUE_PATTERN.test(str)) {
    throw new GrexSecurityError(`Unsafe CSS token value blocked: "${str}".`);
  }
  return str;
}

/**
 * Apply --grex-* CSS custom properties directly onto a DOM element (no wrapper divs).
 * @param {Element} element
 * @param {Record<string, unknown>} tokens
 */
export function applyTokens(element, tokens) {
  if (!element || !element.style) {
    throw new TypeError("applyTokens(element, tokens) requires a DOM element with .style.");
  }
  if (!tokens || typeof tokens !== "object") {
    return;
  }
  for (const [rawName, rawValue] of Object.entries(tokens)) {
    const name = normalizeTokenName(rawName);
    const val = validateTokenValue(rawValue);
    if (val === "") {
      element.style.removeProperty(name);
    } else {
      element.style.setProperty(name, val);
    }
  }
}

function formatDeclBlock(indent, tokenMap) {
  const entries = Object.entries(tokenMap || {});
  if (entries.length === 0) {
    return [];
  }
  return entries.map(([k, v]) => `${indent}${normalizeTokenName(k)}: ${validateTokenValue(v)};`);
}

function assertSafeSelector(selector) {
  if (typeof selector !== "string" || selector.trim() === "" || /[{}<>]/.test(selector)) {
    throw new GrexSecurityError(`Unsafe CSS selector blocked: "${String(selector)}".`);
  }
  return selector.trim();
}

/**
 * Compile responsive --grex-* tokens into deterministic CSS suitable for /static/grex/*.css
 * on --read-only Docker containers served via GRAB server.asset.
 *
 * @param {{
 *   root?: Record<string, unknown>,
 *   selectors?: Record<string, Record<string, Record<string, unknown>>>,
 *   breakpoints?: Record<string, string | null>
 * }} config
 * @returns {string}
 */
export function compileTokenCss(config = {}) {
  const breakpoints = { ...DEFAULT_BREAKPOINTS, ...(config.breakpoints || {}) };
  const chunks = [];

  if (config.root && Object.keys(config.root).length > 0) {
    const decls = formatDeclBlock("  ", config.root);
    chunks.push(`:root {\n${decls.join("\n")}\n}`);
  }

  const selectors = config.selectors || {};
  const mediaBuckets = new Map();

  for (const [rawSelector, deviceTokens] of Object.entries(selectors)) {
    const selector = assertSafeSelector(rawSelector);
    if (!deviceTokens || typeof deviceTokens !== "object") {
      continue;
    }

    for (const [bpName, tokenMap] of Object.entries(deviceTokens)) {
      if (!(bpName in breakpoints)) {
        throw new GrexSecurityError(`Unknown breakpoint "${bpName}" in compileTokenCss.`);
      }
      const decls = formatDeclBlock("  ", tokenMap);
      if (decls.length === 0) {
        continue;
      }
      const query = breakpoints[bpName];
      if (!query) {
        chunks.push(`${selector} {\n${decls.join("\n")}\n}`);
      } else {
        if (!mediaBuckets.has(query)) {
          mediaBuckets.set(query, []);
        }
        const indented = decls.map((line) => `  ${line}`);
        mediaBuckets.get(query).push(`  ${selector} {\n${indented.join("\n")}\n  }`);
      }
    }
  }

  for (const [query, rules] of mediaBuckets.entries()) {
    chunks.push(`@media ${query} {\n${rules.join("\n")}\n}`);
  }

  return chunks.join("\n\n") + (chunks.length > 0 ? "\n" : "");
}
