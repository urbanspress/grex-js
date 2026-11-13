/**
 * Grex JS v0.4 / v1.0.0 Global Theme & Reusable Class Manager.
 * Compiles deterministic CSS to /static/grex/ (--read-only Docker + server.asset compatible)
 * and supports instant browser-memory --grex-* token updates.
 */

import { GrexSecurityError } from "./security.js";
import {
  DEFAULT_BREAKPOINTS,
  applyTokens,
  normalizeStyleProperty,
  normalizeTokenName,
  validateTokenValue,
} from "./tokens.js";

const DEFAULT_FOCUS_RING = "2px solid #0284c7";

function flattenThemeTokens(spec = {}) {
  const out = {};
  const categories = ["tokens", "colors", "typography", "spacing", "radii", "shadows"];
  for (const cat of categories) {
    const group = spec[cat];
    if (group && typeof group === "object") {
      for (const [k, v] of Object.entries(group)) {
        out[normalizeTokenName(k)] = validateTokenValue(v);
      }
    }
  }
  if (spec.focusRing !== undefined) {
    out["--grex-focus-ring"] = validateTokenValue(spec.focusRing);
  }
  return out;
}

function formatThemeBlock(selector, tokenMap, indent = "  ") {
  const entries = Object.entries(tokenMap);
  if (entries.length === 0) {
    return "";
  }
  const lines = entries.map(([k, v]) => `${indent}${k}: ${v};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/**
 * Create a global theme manager with light/dark --grex-* tokens and built-in
 * :focus-visible keyboard focus-ring guardrails.
 *
 * @param {{
 *   colors?: Record<string, string>,
 *   typography?: Record<string, string>,
 *   spacing?: Record<string, string>,
 *   radii?: Record<string, string>,
 *   shadows?: Record<string, string>,
 *   tokens?: Record<string, string>,
 *   focusRing?: string,
 *   modes?: Record<string, Record<string, unknown>>,
 *   prefersColorScheme?: boolean
 * }} [config]
 */
export function createTheme(config = {}) {
  const baseTokens = flattenThemeTokens(config);
  if (!("--grex-focus-ring" in baseTokens)) {
    baseTokens["--grex-focus-ring"] = DEFAULT_FOCUS_RING;
  }

  const modeTokens = {};
  if (config.modes && typeof config.modes === "object") {
    for (const [modeName, modeSpec] of Object.entries(config.modes)) {
      if (!/^[a-z0-9_-]+$/i.test(modeName)) {
        throw new GrexSecurityError(`Invalid theme mode name "${modeName}".`);
      }
      const flat =
        modeSpec &&
        typeof modeSpec === "object" &&
        ("colors" in modeSpec || "tokens" in modeSpec || "spacing" in modeSpec)
          ? flattenThemeTokens(modeSpec)
          : flattenThemeTokens({ tokens: modeSpec });
      modeTokens[modeName.toLowerCase()] = flat;
    }
  }

  const prefersColorScheme = Boolean(config.prefersColorScheme);

  function compileCss() {
    const chunks = [];
    const rootBlock = formatThemeBlock(":root", baseTokens);
    if (rootBlock) {
      chunks.push(rootBlock);
    }

    for (const [modeName, tokens] of Object.entries(modeTokens)) {
      const modeBlock = formatThemeBlock(`[data-grex-theme="${modeName}"]`, tokens);
      if (modeBlock) {
        chunks.push(modeBlock);
      }
      if (prefersColorScheme && modeName === "dark") {
        const inner = formatThemeBlock("  :root", tokens, "    ");
        if (inner) {
          chunks.push(`@media (prefers-color-scheme: dark) {\n${inner}\n}`);
        }
      }
    }

    chunks.push(
      `:focus-visible {\n  outline: var(--grex-focus-ring, ${DEFAULT_FOCUS_RING});\n  outline-offset: 2px;\n}`
    );

    return chunks.join("\n\n") + "\n";
  }

  function applyTo(element, mode = null) {
    if (!element || !element.style) {
      throw new TypeError("theme.applyTo(element, mode?) requires a DOM element with .style.");
    }
    applyTokens(element, baseTokens);
    if (mode && modeTokens[String(mode).toLowerCase()]) {
      const cleanMode = String(mode).toLowerCase();
      if (typeof element.setAttribute === "function") {
        element.setAttribute("data-grex-theme", cleanMode);
      }
      applyTokens(element, modeTokens[cleanMode]);
    } else if (mode === null && typeof element.removeAttribute === "function") {
      element.removeAttribute("data-grex-theme");
    }
  }

  return {
    baseTokens: Object.freeze({ ...baseTokens }),
    modeTokens: Object.freeze({ ...modeTokens }),
    compileCss,
    applyTo,
  };
}

function normalizeClassStylesInput(styles) {
  if (!styles || typeof styles !== "object") {
    throw new TypeError("registerClass(name, styles) requires a styles object.");
  }
  const hasBreakpoints = "base" in styles || "tablet" in styles || "mobile" in styles;
  const normalized = {};
  const source = hasBreakpoints ? styles : { base: styles };

  for (const [bp, propMap] of Object.entries(source)) {
    if (!propMap || typeof propMap !== "object") {
      continue;
    }
    const cleanMap = {};
    for (const [prop, val] of Object.entries(propMap)) {
      const cleanProp = normalizeStyleProperty(prop);
      const cleanVal = validateTokenValue(val);
      cleanMap[cleanProp] = cleanVal;
    }
    normalized[bp] = cleanMap;
  }
  return normalized;
}

/**
 * Create a reusable Bricks-style CSS class manager compiling deterministically
 * across base, tablet, and mobile breakpoints for /static/grex/.
 */
export function createClassManager(options = {}) {
  const prefix = options.prefix || "grex-c-";
  const classes = new Map();

  function assertValidClassName(name) {
    if (typeof name !== "string" || !/^[a-z][a-z0-9_-]*$/i.test(name.trim())) {
      throw new GrexSecurityError(`Invalid class name "${String(name)}".`);
    }
    return name.trim();
  }

  function registerClass(name, styles) {
    const clean = assertValidClassName(name);
    const normalized = normalizeClassStylesInput(styles);
    classes.set(clean, normalized);
    return `${prefix}${clean}`;
  }

  function getClassName(name) {
    const clean = assertValidClassName(name);
    if (!classes.has(clean)) {
      throw new Error(`Unregistered Grex class "${clean}".`);
    }
    return `${prefix}${clean}`;
  }

  function hasClass(name) {
    return typeof name === "string" && classes.has(name.trim());
  }

  function unregisterClass(name) {
    return typeof name === "string" ? classes.delete(name.trim()) : false;
  }

  function listClasses() {
    return Array.from(classes.keys());
  }

  function compileCss(compileOpts = {}) {
    const breakpoints = { ...DEFAULT_BREAKPOINTS, ...(compileOpts.breakpoints || {}) };
    const chunks = [];
    const mediaBuckets = new Map();

    for (const [name, deviceMap] of classes.entries()) {
      const selector = `.${prefix}${name}`;
      for (const [bp, propMap] of Object.entries(deviceMap)) {
        if (!(bp in breakpoints)) {
          throw new GrexSecurityError(`Unknown breakpoint "${bp}" in class "${name}".`);
        }
        const entries = Object.entries(propMap);
        if (entries.length === 0) {
          continue;
        }
        const decls = entries.map(([k, v]) => `  ${k}: ${v};`);
        const query = breakpoints[bp];
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

  return {
    registerClass,
    getClassName,
    hasClass,
    unregisterClass,
    listClasses,
    compileCss,
  };
}
