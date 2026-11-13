/**
 * Grex JS v0.1 / v0.2 Responsive --grex-* Design Tokens & /static/grex/ CSS Compiler (ADR-027b).
 */

import { GrexSecurityError } from "./security.js";

export const DEFAULT_BREAKPOINTS = Object.freeze({
  base: null,
  tablet: "(max-width: 1024px)",
  mobile: "(max-width: 640px)",
});

export const ALLOWED_STYLE_PROPERTIES = Object.freeze({
  padding: "padding",
  paddingBlock: "padding-block",
  "padding-block": "padding-block",
  paddingInline: "padding-inline",
  "padding-inline": "padding-inline",
  margin: "margin",
  marginBlock: "margin-block",
  "margin-block": "margin-block",
  marginInline: "margin-inline",
  "margin-inline": "margin-inline",
  maxWidth: "max-width",
  "max-width": "max-width",
  width: "width",
  height: "height",
  minHeight: "min-height",
  "min-height": "min-height",
  display: "display",
  gridTemplateColumns: "grid-template-columns",
  "grid-template-columns": "grid-template-columns",
  flexDirection: "flex-direction",
  "flex-direction": "flex-direction",
  flexWrap: "flex-wrap",
  "flex-wrap": "flex-wrap",
  gap: "gap",
  rowGap: "row-gap",
  "row-gap": "row-gap",
  columnGap: "column-gap",
  "column-gap": "column-gap",
  alignItems: "align-items",
  "align-items": "align-items",
  justifyContent: "justify-content",
  "justify-content": "justify-content",
  fontSize: "font-size",
  "font-size": "font-size",
  fontWeight: "font-weight",
  "font-weight": "font-weight",
  lineHeight: "line-height",
  "line-height": "line-height",
  textAlign: "text-align",
  "text-align": "text-align",
  color: "color",
  background: "background",
  backgroundColor: "background-color",
  "background-color": "background-color",
  border: "border",
  borderRadius: "border-radius",
  "border-radius": "border-radius",
  boxShadow: "box-shadow",
  "box-shadow": "box-shadow",
});

const UNSAFE_CSS_VALUE_PATTERN = /[;{}]|<\/style|expression\s*\(|javascript:|@import/i;

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
 * Validate and normalize either a --grex-* custom property or an allowlisted CSS property.
 * @param {string} prop
 * @returns {string}
 */
export function normalizeStyleProperty(prop) {
  if (typeof prop !== "string" || prop.trim() === "") {
    throw new GrexSecurityError("Style property name must be a non-empty string.");
  }
  const trimmed = prop.trim();
  if (trimmed.startsWith("--")) {
    return normalizeTokenName(trimmed);
  }
  const mapped = ALLOWED_STYLE_PROPERTIES[trimmed];
  if (!mapped) {
    throw new GrexSecurityError(`Disallowed CSS style property "${trimmed}" blocked by Grex CSS policy.`);
  }
  return mapped;
}

/**
 * Validate a CSS token/style value to prevent style-block injection.
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

function formatDeclBlock(indent, propMap, allowCssProps = false) {
  const entries = Object.entries(propMap || {});
  if (entries.length === 0) {
    return [];
  }
  return entries.map(([k, v]) => {
    const key = allowCssProps ? normalizeStyleProperty(k) : normalizeTokenName(k);
    return `${indent}${key}: ${validateTokenValue(v)};`;
  });
}

function assertSafeSelector(selector) {
  if (typeof selector !== "string" || selector.trim() === "" || /[{}<>]/.test(selector)) {
    throw new GrexSecurityError(`Unsafe CSS selector blocked: "${String(selector)}".`);
  }
  return selector.trim();
}

function compileSelectorRules(selectors, breakpoints, allowCssProps) {
  const chunks = [];
  const mediaBuckets = new Map();

  for (const [rawSelector, deviceMap] of Object.entries(selectors || {})) {
    const selector = assertSafeSelector(rawSelector);
    if (!deviceMap || typeof deviceMap !== "object") {
      continue;
    }

    for (const [bpName, propMap] of Object.entries(deviceMap)) {
      if (!(bpName in breakpoints)) {
        throw new GrexSecurityError(`Unknown breakpoint "${bpName}" in CSS compiler.`);
      }
      const decls = formatDeclBlock("  ", propMap, allowCssProps);
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
  return chunks;
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
    const decls = formatDeclBlock("  ", config.root, false);
    chunks.push(`:root {\n${decls.join("\n")}\n}`);
  }

  chunks.push(...compileSelectorRules(config.selectors, breakpoints, false));

  return chunks.join("\n\n") + (chunks.length > 0 ? "\n" : "");
}

function hashStringHex(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hasAnyStyleDeclarations(styles) {
  if (!styles || typeof styles !== "object") {
    return false;
  }
  return Object.values(styles).some((bpMap) => bpMap && typeof bpMap === "object" && Object.keys(bpMap).length > 0);
}

/**
 * Compute deterministic CSS class name for a GrexElementNode that declares `styles`.
 * Returns null if the node has no style declarations.
 * @param {{ id?: string, styles?: Record<string, unknown> }} node
 * @returns {string | null}
 */
export function getElementStyleClass(node) {
  if (!node || !hasAnyStyleDeclarations(node.styles)) {
    return null;
  }
  if (typeof node.id === "string" && node.id.trim() !== "") {
    const cleanId = node.id.trim();
    if (!/^[a-z0-9_-]+$/i.test(cleanId)) {
      throw new GrexSecurityError(`Invalid element id "${node.id}" for CSS class generation.`);
    }
    return `grex-el-${cleanId}`;
  }
  return `grex-s-${hashStringHex(JSON.stringify(node.styles))}`;
}

/**
 * Compile per-element `styles` (`base`, `tablet`, `mobile`) and optional `root` tokens
 * across one or more GrexElementNodes into deterministic CSS for `/static/grex/`.
 *
 * @param {object | Array<object>} nodes
 * @param {{ root?: Record<string, unknown>, breakpoints?: Record<string, string | null> }} [options]
 * @returns {string}
 */
export function compileElementStyles(nodes, options = {}) {
  const breakpoints = { ...DEFAULT_BREAKPOINTS, ...(options.breakpoints || {}) };
  const list = Array.isArray(nodes) ? nodes : [nodes];
  const selectors = {};

  const visit = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const cls = getElementStyleClass(node);
    if (cls) {
      selectors[`.${cls}`] = node.styles;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (child && typeof child === "object" && ("type" in child || "tag" in child)) {
          visit(child);
        }
      }
    }
  };

  for (const node of list) {
    visit(node);
  }

  const chunks = [];
  if (options.root && Object.keys(options.root).length > 0) {
    const decls = formatDeclBlock("  ", options.root, false);
    chunks.push(`:root {\n${decls.join("\n")}\n}`);
  }
  chunks.push(...compileSelectorRules(selectors, breakpoints, true));

  return chunks.join("\n\n") + (chunks.length > 0 ? "\n" : "");
}
