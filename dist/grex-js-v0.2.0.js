/* Grex JS v0.2.0 | MIT License | Zero-build browser ES module */

// --- signals.js ---
/**
 * Grex JS v0.1 Fine-Grained Reactive Engine & Exact GRAB Value Integrity.
 * Zero external dependencies, zero eval()/new Function(), deterministic disposal.
 */

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;

let activeObserver = null;
let batchDepth = 0;
let isFlushing = false;
const pendingEffects = new Set();

function cleanupObserverSources(observer) {
  for (const source of observer.sources) {
    source.subscribers.delete(observer);
  }
  observer.sources.clear();
}

function trackSource(source) {
  if (!activeObserver || activeObserver.disposed) {
    return;
  }
  if (!activeObserver.sources.has(source)) {
    activeObserver.sources.add(source);
    source.subscribers.add(activeObserver);
  }
}

function notifyDownstream(source, nextState) {
  for (const sub of source.subscribers) {
    if (sub.disposed) {
      continue;
    }
    if (sub.kind === "effect") {
      if (sub.state < nextState) {
        sub.state = nextState;
      }
      pendingEffects.add(sub);
    } else if (sub.kind === "computed") {
      const prevState = sub.state;
      if (prevState < nextState) {
        sub.state = nextState;
      }
      if (prevState === CLEAN) {
        notifyDownstream(sub, CHECK);
      }
    }
  }
}

function flushEffects() {
  if (batchDepth > 0 || isFlushing) {
    return;
  }
  isFlushing = true;
  let guard = 0;
  try {
    while (pendingEffects.size > 0) {
      if (++guard > 10000) {
        pendingEffects.clear();
        throw new Error("Grex reactive cycle detected: effect triggered more than 10,000 iterations.");
      }
      const queue = Array.from(pendingEffects);
      pendingEffects.clear();
      for (const eff of queue) {
        if (!eff.disposed && shouldUpdate(eff)) {
          runEffect(eff);
        }
      }
    }
  } finally {
    isFlushing = false;
  }
}

function shouldUpdate(node) {
  if (node.state === CLEAN) {
    return false;
  }
  if (node.state === DIRTY) {
    return true;
  }
  for (const source of node.sources) {
    if (source.kind === "computed") {
      evaluateComputed(source);
      if (node.state === DIRTY) {
        return true;
      }
    }
  }
  node.state = CLEAN;
  return false;
}

function evaluateComputed(comp) {
  if (comp.disposed) {
    return comp.value;
  }
  if (comp.state === CLEAN) {
    return comp.value;
  }
  if (!shouldUpdate(comp)) {
    return comp.value;
  }

  const prevObserver = activeObserver;
  cleanupObserverSources(comp);
  activeObserver = comp;
  let nextValue;
  try {
    nextValue = comp.fn();
  } finally {
    activeObserver = prevObserver;
  }

  const changed = !comp.initialized || !Object.is(comp.value, nextValue);
  comp.value = nextValue;
  comp.initialized = true;
  comp.state = CLEAN;

  if (changed) {
    for (const sub of comp.subscribers) {
      if (!sub.disposed && sub.state < DIRTY) {
        sub.state = DIRTY;
      }
    }
  }
  return comp.value;
}

function runEffect(eff) {
  if (eff.disposed) {
    return;
  }
  if (typeof eff.cleanup === "function") {
    const fn = eff.cleanup;
    eff.cleanup = null;
    fn();
  }
  cleanupObserverSources(eff);
  eff.state = CLEAN;

  const prevObserver = activeObserver;
  activeObserver = eff;
  try {
    const maybeCleanup = eff.fn();
    eff.cleanup = typeof maybeCleanup === "function" ? maybeCleanup : null;
  } finally {
    activeObserver = prevObserver;
  }
}

/**
 * Create a reactive signal holding a single value.
 * @template T
 * @param {T} initialValue
 * @returns {{ get(): T, set(nextValue: T | ((prev: T) => T)): T, peek(): T }}
 */
export function signal(initialValue) {
  const node = {
    kind: "signal",
    value: initialValue,
    subscribers: new Set(),
    disposed: false,
  };

  return {
    get() {
      trackSource(node);
      return node.value;
    },
    peek() {
      return node.value;
    },
    set(nextValue) {
      const resolved = typeof nextValue === "function" ? nextValue(node.value) : nextValue;
      if (Object.is(node.value, resolved)) {
        return node.value;
      }
      node.value = resolved;
      notifyDownstream(node, DIRTY);
      flushEffects();
      return node.value;
    },
  };
}

/**
 * Create a lazy, memoized derived signal.
 * @template T
 * @param {() => T} fn
 * @returns {{ get(): T, peek(): T, dispose(): void }}
 */
export function computed(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("computed(fn) requires a function.");
  }

  const node = {
    kind: "computed",
    fn,
    value: undefined,
    initialized: false,
    state: DIRTY,
    sources: new Set(),
    subscribers: new Set(),
    disposed: false,
  };

  return {
    get() {
      if (node.disposed) {
        return node.value;
      }
      evaluateComputed(node);
      trackSource(node);
      return node.value;
    },
    peek() {
      if (node.disposed) {
        return node.value;
      }
      return evaluateComputed(node);
    },
    dispose() {
      if (node.disposed) {
        return;
      }
      node.disposed = true;
      cleanupObserverSources(node);
      node.subscribers.clear();
    },
  };
}

/**
 * Run a reactive side effect immediately and re-run when tracked signals change.
 * @param {() => (void | (() => void))} fn
 * @returns {() => void} dispose callback
 */
export function effect(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("effect(fn) requires a function.");
  }

  const eff = {
    kind: "effect",
    fn,
    cleanup: null,
    state: DIRTY,
    sources: new Set(),
    disposed: false,
  };

  runEffect(eff);

  return function dispose() {
    if (eff.disposed) {
      return;
    }
    eff.disposed = true;
    pendingEffects.delete(eff);
    cleanupObserverSources(eff);
    if (typeof eff.cleanup === "function") {
      const cleanupFn = eff.cleanup;
      eff.cleanup = null;
      cleanupFn();
    }
  };
}

/**
 * Coalesce multiple signal updates so downstream effects run once at the end.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function batch(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("batch(fn) requires a function.");
  }
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) {
      flushEffects();
    }
  }
}

/**
 * Execute a function without tracking any signal reads inside the current observer.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function untrack(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("untrack(fn) requires a function.");
  }
  const prevObserver = activeObserver;
  activeObserver = null;
  try {
    return fn();
  } finally {
    activeObserver = prevObserver;
  }
}

/**
 * Check whether a value is an exact GRAB base-10 integer or decimal wire string.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isExactGrabWireString(value) {
  return typeof value === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
}

/**
 * Format a GRAB base-10 integer or decimal wire string (e.g. "19.95") for display
 * using pure string manipulation—never coercing to IEEE-754 floating-point math.
 *
 * @param {string | number} value
 * @param {{ prefix?: string, suffix?: string, decimals?: number | null, groupSeparator?: string }} [options]
 * @returns {string}
 */
export function formatGrabDecimal(value, options = {}) {
  const {
    prefix = "",
    suffix = "",
    decimals = null,
    groupSeparator = ",",
  } = options;

  const raw = typeof value === "string" ? value.trim() : String(value);
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    throw new TypeError(`Expected exact base-10 decimal string, received: ${String(value)}`);
  }

  const sign = match[1] === "-" ? "-" : "";
  let intPart = match[2].replace(/^0+(?=\d)/, "");
  let fracPart = match[3] || "";

  if (typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0) {
    if (fracPart.length < decimals) {
      fracPart = fracPart.padEnd(decimals, "0");
    } else if (fracPart.length > decimals) {
      fracPart = fracPart.slice(0, decimals);
    }
  }

  if (groupSeparator) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  }

  const numeric = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  return `${sign}${prefix}${numeric}${suffix}`;
}

// --- security.js ---
/**
 * Grex JS v0.1 Strict CSP & XSS Security Guards (ADR-014, ADR-017).
 * Blocks unsafe tags, javascript:/data: URLs, and inline on* event handlers.
 */

export class GrexSecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = "GrexSecurityError";
  }
}

const FORBIDDEN_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "meta",
  "link",
]);

const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "poster",
  "cite",
]);

const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Validate that a tag name is a safe semantic HTML5 tag.
 * @param {string} tag
 * @returns {string} normalized lowercase tag name
 */
export function assertSafeTag(tag) {
  if (typeof tag !== "string") {
    throw new GrexSecurityError("Element tag must be a non-empty string.");
  }
  const normalized = tag.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(normalized)) {
    throw new GrexSecurityError(`Invalid HTML tag name: "${tag}".`);
  }
  if (FORBIDDEN_TAGS.has(normalized)) {
    throw new GrexSecurityError(`Forbidden HTML tag "${normalized}" blocked by Grex CSP policy.`);
  }
  return normalized;
}

/**
 * Check whether an attribute name is forbidden (e.g., inline on* handlers or srcdoc).
 * @param {string} attrName
 * @returns {boolean}
 */
export function isForbiddenAttribute(attrName) {
  if (typeof attrName !== "string") {
    return true;
  }
  const normalized = attrName.trim().toLowerCase();
  if (!normalized || !/^[a-z_:][a-z0-9_.:-]*$/.test(normalized)) {
    return true;
  }
  return normalized.startsWith("on") || normalized === "srcdoc";
}

/**
 * Validate a URL string, blocking javascript:, data:, vbscript:, and file: protocols.
 * Strips ASCII control characters and whitespace before inspecting the scheme.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (typeof url !== "string") {
    return false;
  }
  // Remove ASCII control chars & whitespace attackers insert inside schemes (e.g. java\tscript:).
  const cleaned = url.replace(/[\u0000-\u0020\u007f]+/g, "");
  if (cleaned === "" || cleaned.startsWith("/") || cleaned.startsWith("./") || cleaned.startsWith("../") || cleaned.startsWith("#") || cleaned.startsWith("?")) {
    return true;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(cleaned);
  if (!schemeMatch) {
    // Relative path without explicit scheme (e.g. "products/hat")
    return true;
  }

  const scheme = schemeMatch[1].toLowerCase();
  return ALLOWED_URL_SCHEMES.has(scheme);
}

/**
 * Validate an attribute name + value pair and return the safe string value.
 * Throws GrexSecurityError for forbidden attributes or unsafe URLs.
 * @param {string} attrName
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeAttributeValue(attrName, value) {
  if (isForbiddenAttribute(attrName)) {
    throw new GrexSecurityError(`Forbidden attribute "${String(attrName)}" blocked by Grex XSS policy.`);
  }
  const normalized = attrName.trim().toLowerCase();
  const strValue = value == null ? "" : String(value);

  if (URL_ATTRIBUTES.has(normalized) && !isSafeUrl(strValue)) {
    throw new GrexSecurityError(`Unsafe URL protocol blocked on "${normalized}" attribute.`);
  }

  return strValue;
}

/**
 * Safely assign text content to a DOM node using textContent (never innerHTML).
 * Preserves exact string representations (including GRAB decimal wire strings).
 * @param {Node} node
 * @param {unknown} value
 */
export function setSafeText(node, value) {
  const safeText = value == null ? "" : String(value);
  if (node.nodeType === 3) {
    node.nodeValue = safeText;
  } else {
    node.textContent = safeText;
  }
}

// --- tokens.js ---
/**
 * Grex JS v0.1 / v0.2 Responsive --grex-* Design Tokens & /static/grex/ CSS Compiler (ADR-027b).
 */


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

// --- dom.js ---
/**
 * Grex JS v0.1 Zero-Wrapper-Div Semantic DOM Engine & Selective Hydration (ADR-018).
 */


function isReactiveValue(val) {
  return Boolean(val && typeof val === "object" && typeof val.get === "function");
}

function resolveMaybeReactive(val) {
  if (isReactiveValue(val)) {
    return val.get();
  }
  if (typeof val === "function") {
    return val();
  }
  return val;
}

function applySafeAttribute(element, attrName, value) {
  if (value === false || value == null) {
    sanitizeAttributeValue(attrName, "");
    element.removeAttribute(attrName);
    return;
  }
  const finalValue = value === true ? "" : sanitizeAttributeValue(attrName, value);
  element.setAttribute(attrName, finalValue);
}

/**
 * Bind reactive text, attributes, --grex-* tokens, and event listeners directly
 * to an existing semantic DOM element without inserting any wrapper <div>s.
 *
 * @param {Element} element
 * @param {{
 *   text?: unknown,
 *   attrs?: Record<string, unknown>,
 *   tokens?: Record<string, unknown>,
 *   on?: Record<string, EventListener>
 * }} [bindings]
 * @returns {{ element: Element, dispose(): void }}
 */
export function bindElement(element, bindings = {}) {
  const disposers = [];
  const listeners = [];

  if ("text" in bindings && bindings.text !== undefined) {
    if (isReactiveValue(bindings.text) || typeof bindings.text === "function") {
      disposers.push(
        effect(() => {
          setSafeText(element, resolveMaybeReactive(bindings.text));
        })
      );
    } else {
      setSafeText(element, bindings.text);
    }
  }

  if (bindings.attrs && typeof bindings.attrs === "object") {
    for (const [attrName, attrValue] of Object.entries(bindings.attrs)) {
      if (isReactiveValue(attrValue) || typeof attrValue === "function") {
        disposers.push(
          effect(() => {
            applySafeAttribute(element, attrName, resolveMaybeReactive(attrValue));
          })
        );
      } else {
        applySafeAttribute(element, attrName, attrValue);
      }
    }
  }

  if (bindings.tokens && typeof bindings.tokens === "object") {
    for (const [rawToken, tokenValue] of Object.entries(bindings.tokens)) {
      const tokenName = normalizeTokenName(rawToken);
      if (isReactiveValue(tokenValue) || typeof tokenValue === "function") {
        disposers.push(
          effect(() => {
            const val = validateTokenValue(resolveMaybeReactive(tokenValue));
            if (val === "") {
              element.style.removeProperty(tokenName);
            } else {
              element.style.setProperty(tokenName, val);
            }
          })
        );
      } else {
        const val = validateTokenValue(tokenValue);
        if (val === "") {
          element.style.removeProperty(tokenName);
        } else {
          element.style.setProperty(tokenName, val);
        }
      }
    }
  }

  if (bindings.on && typeof bindings.on === "object") {
    for (const [eventName, handler] of Object.entries(bindings.on)) {
      if (typeof handler !== "function") {
        throw new TypeError(`Event handler for "${eventName}" must be a function.`);
      }
      const cleanEvent = eventName.trim().toLowerCase();
      element.addEventListener(cleanEvent, handler);
      listeners.push([cleanEvent, handler]);
    }
  }

  return {
    element,
    dispose() {
      for (const disposeFn of disposers) {
        disposeFn();
      }
      disposers.length = 0;
      for (const [cleanEvent, handler] of listeners) {
        element.removeEventListener(cleanEvent, handler);
      }
      listeners.length = 0;
    },
  };
}

/**
 * Render a semantic HTML5 element directly with zero wrapper <div> nodes.
 *
 * @param {{
 *   tag: string,
 *   text?: unknown,
 *   attrs?: Record<string, unknown>,
 *   tokens?: Record<string, unknown>,
 *   on?: Record<string, EventListener>,
 *   children?: Array<unknown>
 * }} spec
 * @param {{ document?: Document }} [options]
 * @returns {{ element: Element, dispose(): void }}
 */
export function renderElement(spec, options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("renderElement requires a DOM document.");
  }
  if (!spec || typeof spec !== "object") {
    throw new TypeError("renderElement(spec) requires a specification object.");
  }

  const tag = assertSafeTag(spec.tag);
  const element = doc.createElement(tag);
  const childDisposers = [];

  const rootBinding = bindElement(element, {
    text: spec.text,
    attrs: spec.attrs,
    tokens: spec.tokens,
    on: spec.on,
  });

  if (Array.isArray(spec.children)) {
    for (const child of spec.children) {
      if (child == null || child === false) {
        continue;
      }
      if (isReactiveValue(child) || typeof child === "function") {
        const textNode = doc.createTextNode("");
        element.appendChild(textNode);
        childDisposers.push(
          effect(() => {
            setSafeText(textNode, resolveMaybeReactive(child));
          })
        );
      } else if (typeof child === "object" && "tag" in child) {
        const renderedChild = renderElement(child, { document: doc });
        element.appendChild(renderedChild.element);
        childDisposers.push(renderedChild.dispose);
      } else if (typeof child === "object" && child.nodeType) {
        element.appendChild(child);
      } else {
        const textNode = doc.createTextNode(String(child));
        element.appendChild(textNode);
      }
    }
  }

  return {
    element,
    dispose() {
      rootBinding.dispose();
      for (const disposeFn of childDisposers) {
        disposeFn();
      }
      childDisposers.length = 0;
    },
  };
}

/**
 * Selectively hydrate server-rendered .grab.html markup in place via data-grex-* attributes.
 * Never tears down existing DOM nodes and never inserts wrapper <div> elements.
 *
 * @param {Document | Element} root
 * @param {{
 *   signals?: Record<string, { get(): unknown, set?(v: unknown): void }>,
 *   actions?: Record<string, EventListener>
 * }} [registry]
 * @returns {{
 *   elements: Record<string, Element>,
 *   signals: Record<string, { get(): unknown, set?(v: unknown): void }>,
 *   dispose(): void
 * }}
 */
export function hydrate(root = globalThis.document, registry = {}) {
  if (!root || typeof root.querySelectorAll !== "function") {
    throw new Error("hydrate(root, registry) requires a DOM document or root element.");
  }

  const signals = registry.signals || {};
  const actions = registry.actions || {};
  const elements = {};
  const disposers = [];

  const candidates = Array.from(root.querySelectorAll("*"));
  if (typeof root.getAttribute === "function" && root.attributes) {
    candidates.unshift(root);
  }

  for (const el of candidates) {
    const grexId = el.getAttribute("data-grex-id");
    if (grexId) {
      elements[grexId] = el;
    }

    const attrsObj = el.attributes ? Array.from(el.attributes) : [];
    const bindings = { attrs: {}, tokens: {}, on: {} };
    let hasBindings = false;

    for (const attr of attrsObj) {
      const name = attr.name;
      const key = attr.value;

      if (name === "data-grex-text") {
        if (key in signals) {
          bindings.text = signals[key];
          hasBindings = true;
        }
      } else if (name.startsWith("data-grex-attr-")) {
        const targetAttr = name.slice("data-grex-attr-".length);
        if (key in signals) {
          bindings.attrs[targetAttr] = signals[key];
          hasBindings = true;
        }
      } else if (name.startsWith("data-grex-token-")) {
        const tokenSuffix = name.slice("data-grex-token-".length);
        if (key in signals) {
          bindings.tokens[tokenSuffix] = signals[key];
          hasBindings = true;
        }
      } else if (name.startsWith("data-grex-on-")) {
        const eventName = name.slice("data-grex-on-".length);
        if (typeof actions[key] === "function") {
          bindings.on[eventName] = actions[key];
          hasBindings = true;
        }
      }
    }

    if (hasBindings) {
      const bound = bindElement(el, bindings);
      disposers.push(bound.dispose);
    }
  }

  return {
    elements,
    signals,
    dispose() {
      for (const disposeFn of disposers) {
        disposeFn();
      }
      disposers.length = 0;
    },
  };
}

// --- elements.js ---
/**
 * Grex JS v0.2 Zero-Bloat Layout, Typography & Media Elements.
 * 12 native semantic HTML5 elements with zero wrapper <div>s,
 * strict XSS allowlists (zero innerHTML), and accessibility defaults.
 */


const SVG_NS = "http://www.w3.org/2000/svg";

const RICHTEXT_ALLOWED_TAGS = new Set([
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "mark",
  "small",
  "sup",
  "sub",
  "br",
  "a",
]);

const RICHTEXT_DROP_CONTENT_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "noscript",
  "template",
  "svg",
]);

const ALLOWED_SVG_TAGS = new Set([
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

const ALLOWED_SVG_ATTRS = new Set([
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "width",
  "height",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-rule",
  "clip-rule",
]);

const LAYOUT_TAGS = Object.freeze({
  Section: ["section", "header", "footer", "main", "aside"],
  Container: ["section", "article", "main", "header", "footer"],
  Grid: ["section", "ul", "ol", "article", "nav"],
  Stack: ["section", "header", "nav", "footer", "ul", "ol", "article"],
  Card: ["article", "section", "aside"],
  Text: ["p", "span", "small", "strong", "em", "blockquote", "time", "code"],
  RichText: ["p", "article", "section", "span"],
});

function isReactive(val) {
  return Boolean(val && typeof val === "object" && typeof val.get === "function");
}

function readVal(val) {
  if (isReactive(val)) {
    return val.get();
  }
  if (typeof val === "function") {
    return val();
  }
  return val;
}

function resolveTag(requested, defaultTag, allowedList) {
  if (requested == null || requested === "") {
    return defaultTag;
  }
  if (typeof requested !== "string") {
    throw new GrexSecurityError("Element tag must be a string.");
  }
  const clean = requested.trim().toLowerCase();
  if (!allowedList.includes(clean)) {
    throw new GrexSecurityError(
      `Disallowed tag "${clean}" (allowed: ${allowedList.join(", ")}).`
    );
  }
  return clean;
}

function joinClasses(...parts) {
  const tokens = [];
  for (const part of parts) {
    if (typeof part === "string" && part.trim() !== "") {
      tokens.push(part.trim());
    }
  }
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

function buildBaseSpec(baseClass, config = {}) {
  const styleClass = getElementStyleClass(config);
  const attrs = { ...(config.attrs || {}) };
  if (typeof config.id === "string" && config.id.trim() !== "") {
    attrs["data-grex-id"] = config.id.trim();
  }
  const mergedClass = joinClasses(baseClass, styleClass, attrs.class, config.className);
  if (mergedClass) {
    attrs.class = mergedClass;
  }
  return {
    attrs,
    tokens: { ...(config.tokens || {}) },
    on: { ...(config.on || {}) },
  };
}

function appendChildren(parentEl, children, doc, disposers) {
  if (!Array.isArray(children)) {
    return;
  }
  for (const child of children) {
    if (child == null || child === false) {
      continue;
    }
    if (isReactive(child) || typeof child === "function") {
      const textNode = doc.createTextNode("");
      parentEl.appendChild(textNode);
      disposers.push(
        effect(() => {
          setSafeText(textNode, readVal(child));
        })
      );
    } else if (typeof child === "object" && "type" in child) {
      const rendered = renderNode(child, { document: doc });
      parentEl.appendChild(rendered.element);
      disposers.push(rendered.dispose);
    } else if (typeof child === "object" && "tag" in child) {
      const rendered = renderElement(child, { document: doc });
      parentEl.appendChild(rendered.element);
      disposers.push(rendered.dispose);
    } else if (typeof child === "object" && child.nodeType) {
      parentEl.appendChild(child);
    } else {
      parentEl.appendChild(doc.createTextNode(String(child)));
    }
  }
}

function renderContainerElement(typeName, defaultTag, baseClass, config = {}, options = {}, extraTokens = {}) {
  const doc = options.document || globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error(`${typeName} requires a DOM document.`);
  }
  const props = config.props || {};
  const tag = resolveTag(config.tag, defaultTag, LAYOUT_TAGS[typeName]);
  const base = buildBaseSpec(baseClass, config);

  if (props.label != null) {
    base.attrs["aria-label"] = props.label;
  }
  if (props.labelledBy != null) {
    base.attrs["aria-labelledby"] = props.labelledBy;
  }
  Object.assign(base.tokens, extraTokens);

  const el = doc.createElement(tag);
  const disposers = [];
  const rootBinding = bindElement(el, base);
  disposers.push(rootBinding.dispose);
  appendChildren(el, config.children, doc, disposers);

  return {
    element: el,
    dispose() {
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 1-5: Layout Elements ---

export function Section(config = {}, options = {}) {
  return renderContainerElement("Section", "section", "grex-section", config, options);
}

export function Container(config = {}, options = {}) {
  const props = config.props || {};
  const extraTokens = {};
  if (props.maxWidth != null) {
    extraTokens["--grex-container-max-width"] = props.maxWidth;
  }
  return renderContainerElement("Container", "section", "grex-container", config, options, extraTokens);
}

export function Grid(config = {}, options = {}) {
  const props = config.props || {};
  const extraTokens = {};
  if (props.columns != null) {
    extraTokens["--grex-grid-cols"] = props.columns;
  }
  if (props.gap != null) {
    extraTokens["--grex-gap"] = props.gap;
  }
  if (props.align != null) {
    extraTokens["--grex-align"] = props.align;
  }
  if (props.justify != null) {
    extraTokens["--grex-justify"] = props.justify;
  }
  return renderContainerElement("Grid", "section", "grex-grid", config, options, extraTokens);
}

export function Stack(config = {}, options = {}) {
  const props = config.props || {};
  const extraTokens = {};
  if (props.direction != null) {
    extraTokens["--grex-stack-dir"] = props.direction;
  }
  if (props.wrap != null) {
    extraTokens["--grex-stack-wrap"] = props.wrap;
  }
  if (props.gap != null) {
    extraTokens["--grex-gap"] = props.gap;
  }
  if (props.align != null) {
    extraTokens["--grex-align"] = props.align;
  }
  if (props.justify != null) {
    extraTokens["--grex-justify"] = props.justify;
  }
  return renderContainerElement("Stack", "section", "grex-stack", config, options, extraTokens);
}

export function Card(config = {}, options = {}) {
  const props = config.props || {};
  const cls = props.elevated ? "grex-card grex-card-elevated" : "grex-card";
  return renderContainerElement("Card", "article", cls, config, options);
}

// --- 6-10: Typography & Action Elements ---

export function Heading(config = {}, options = {}) {
  const props = config.props || {};
  const level = props.level === undefined ? 2 : props.level;
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new GrexSecurityError(`Heading level must be an integer 1..6; received "${String(level)}".`);
  }
  const tag = `h${level}`;
  if (config.tag && config.tag.toLowerCase() !== tag) {
    throw new GrexSecurityError(`Heading tag "${config.tag}" does not match level ${level}.`);
  }
  const base = buildBaseSpec("grex-heading", config);
  return renderElement(
    {
      tag,
      text: props.text !== undefined ? props.text : config.text,
      attrs: base.attrs,
      tokens: base.tokens,
      on: base.on,
    },
    options
  );
}

export function Text(config = {}, options = {}) {
  const props = config.props || {};
  const tag = resolveTag(config.tag, "p", LAYOUT_TAGS.Text);
  const base = buildBaseSpec("grex-text", config);
  if (props.dateTime != null) {
    base.attrs.datetime = props.dateTime;
  }
  return renderElement(
    {
      tag,
      text: props.text !== undefined ? props.text : config.text,
      attrs: base.attrs,
      tokens: base.tokens,
      on: base.on,
    },
    options
  );
}

function mergeRelNoopener(existingRel) {
  const tokens = new Set(
    typeof existingRel === "string"
      ? existingRel.trim().split(/\s+/).filter(Boolean)
      : []
  );
  tokens.add("noopener");
  tokens.add("noreferrer");
  return Array.from(tokens).join(" ");
}

function isExternalHref(href) {
  return typeof href === "string" && /^(https?:)?\/\//i.test(href.trim());
}

function decodeHtmlEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos" || lower === "#39") return "'";
    if (lower === "nbsp") return "\u00a0";
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return full;
  });
}

function parseTagAttributes(rawAttrStr) {
  const attrs = {};
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(rawAttrStr)) !== null) {
    const name = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    if (!isForbiddenAttribute(name)) {
      attrs[name] = decodeHtmlEntities(val);
    }
  }
  return attrs;
}

function appendSafeRichHtml(container, html, doc) {
  const tokenRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g;
  const stack = [container];
  let lastIndex = 0;
  let dropDepth = 0;
  let dropTag = null;
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    const [fullMatch, rawTagName, rawAttrs] = match;
    const isClosing = fullMatch.startsWith("</");
    const tag = rawTagName.toLowerCase();

    if (match.index > lastIndex && dropDepth === 0) {
      const textChunk = decodeHtmlEntities(html.slice(lastIndex, match.index));
      if (textChunk) {
        stack[stack.length - 1].appendChild(doc.createTextNode(textChunk));
      }
    }
    lastIndex = tokenRegex.lastIndex;

    if (RICHTEXT_DROP_CONTENT_TAGS.has(tag)) {
      if (!isClosing && !fullMatch.endsWith("/>")) {
        if (dropDepth === 0) {
          dropTag = tag;
        }
        if (tag === dropTag) {
          dropDepth += 1;
        }
      } else if (isClosing && dropDepth > 0 && tag === dropTag) {
        dropDepth -= 1;
        if (dropDepth === 0) {
          dropTag = null;
        }
      }
      continue;
    }

    if (dropDepth > 0) {
      continue;
    }

    if (!RICHTEXT_ALLOWED_TAGS.has(tag)) {
      // Non-allowlisted tag (e.g. <div>, <img>) is stripped; inner text remains safe.
      continue;
    }

    if (isClosing) {
      for (let i = stack.length - 1; i >= 1; i -= 1) {
        if (stack[i].localName === tag || stack[i].tagName.toLowerCase() === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node = doc.createElement(tag);
    if (tag === "a") {
      const parsed = parseTagAttributes(rawAttrs);
      if (parsed.href && isSafeUrl(parsed.href)) {
        node.setAttribute("href", parsed.href);
      }
      if (parsed.target === "_blank") {
        node.setAttribute("target", "_blank");
      }
      if (parsed.target === "_blank" || (parsed.href && isExternalHref(parsed.href))) {
        node.setAttribute("rel", mergeRelNoopener(parsed.rel));
      } else if (parsed.rel) {
        node.setAttribute("rel", parsed.rel);
      }
      if (parsed.title) {
        node.setAttribute("title", parsed.title);
      }
    }

    stack[stack.length - 1].appendChild(node);
    if (tag !== "br" && !fullMatch.endsWith("/>")) {
      stack.push(node);
    }
  }

  if (lastIndex < html.length && dropDepth === 0) {
    const tail = decodeHtmlEntities(html.slice(lastIndex));
    if (tail) {
      stack[stack.length - 1].appendChild(doc.createTextNode(tail));
    }
  }
}

function appendStructuredRichNodes(container, nodes, doc, disposers) {
  for (const item of nodes) {
    if (item == null || item === false) {
      continue;
    }
    if (typeof item === "string" || typeof item === "number") {
      container.appendChild(doc.createTextNode(String(item)));
      continue;
    }
    if (isReactive(item) || typeof item === "function") {
      const textNode = doc.createTextNode("");
      container.appendChild(textNode);
      disposers.push(
        effect(() => {
          setSafeText(textNode, readVal(item));
        })
      );
      continue;
    }
    if (typeof item !== "object" || typeof item.tag !== "string") {
      throw new GrexSecurityError("Invalid RichText inline node.");
    }
    const tag = item.tag.trim().toLowerCase();
    if (!RICHTEXT_ALLOWED_TAGS.has(tag)) {
      throw new GrexSecurityError(`Disallowed RichText inline tag "${tag}".`);
    }
    const attrs = { ...(item.attrs || {}) };
    if (tag === "a") {
      const href = attrs.href;
      if (href != null && !isSafeUrl(String(href))) {
        throw new GrexSecurityError(`Unsafe URL blocked in RichText link: "${String(href)}".`);
      }
      if (attrs.target === "_blank" || isExternalHref(href)) {
        attrs.rel = mergeRelNoopener(attrs.rel);
      }
    }
    const childEl = doc.createElement(tag);
    const bound = bindElement(childEl, { text: item.text, attrs });
    disposers.push(bound.dispose);
    if (Array.isArray(item.children)) {
      appendStructuredRichNodes(childEl, item.children, doc, disposers);
    }
    container.appendChild(childEl);
  }
}

function clearElementChildren(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export function RichText(config = {}, options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("RichText requires a DOM document.");
  }
  const props = config.props || {};
  const tag = resolveTag(config.tag, "p", LAYOUT_TAGS.RichText);
  const base = buildBaseSpec("grex-richtext", config);
  const el = doc.createElement(tag);
  const disposers = [];

  const rootBinding = bindElement(el, base);
  disposers.push(rootBinding.dispose);

  if (Array.isArray(props.nodes)) {
    appendStructuredRichNodes(el, props.nodes, doc, disposers);
  } else if (props.html !== undefined) {
    if (isReactive(props.html) || typeof props.html === "function") {
      disposers.push(
        effect(() => {
          clearElementChildren(el);
          appendSafeRichHtml(el, String(readVal(props.html) ?? ""), doc);
        })
      );
    } else {
      appendSafeRichHtml(el, String(props.html ?? ""), doc);
    }
  } else if (props.text !== undefined) {
    setSafeText(el, readVal(props.text));
  }

  return {
    element: el,
    dispose() {
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

export function Link(config = {}, options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("Link requires a DOM document.");
  }
  const props = config.props || {};
  if (config.tag && config.tag.toLowerCase() !== "a") {
    throw new GrexSecurityError(`Link must render <a>; received "${config.tag}".`);
  }
  const base = buildBaseSpec("grex-link", config);
  const hrefProp = props.href !== undefined ? props.href : base.attrs.href;
  if (hrefProp === undefined) {
    throw new GrexSecurityError("Link requires an href prop.");
  }

  base.attrs.href = hrefProp;
  if (props.target != null) {
    base.attrs.target = props.target;
  }
  if (props.label != null) {
    base.attrs["aria-label"] = props.label;
  }

  const shouldEnforceNoopener =
    props.external === true ||
    props.target === "_blank" ||
    (!isReactive(hrefProp) && typeof hrefProp !== "function" && isExternalHref(hrefProp));

  if (isReactive(hrefProp) || typeof hrefProp === "function") {
    base.attrs.rel = () => {
      const currentHref = readVal(hrefProp);
      if (props.external === true || props.target === "_blank" || isExternalHref(currentHref)) {
        return mergeRelNoopener(props.rel || base.attrs.rel);
      }
      return props.rel || base.attrs.rel || false;
    };
  } else if (shouldEnforceNoopener) {
    base.attrs.rel = mergeRelNoopener(props.rel || base.attrs.rel);
  } else if (props.rel != null) {
    base.attrs.rel = props.rel;
  }

  const el = doc.createElement("a");
  const disposers = [];
  const binding = bindElement(el, {
    text: props.text !== undefined ? props.text : config.text,
    attrs: base.attrs,
    tokens: base.tokens,
    on: base.on,
  });
  disposers.push(binding.dispose);
  appendChildren(el, config.children, doc, disposers);

  return {
    element: el,
    dispose() {
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

const ALLOWED_BUTTON_TYPES = new Set(["button", "submit", "reset"]);

export function Button(config = {}, options = {}) {
  const props = config.props || {};
  if (config.tag && config.tag.toLowerCase() !== "button") {
    throw new GrexSecurityError(`Button must render <button>; received "${config.tag}".`);
  }
  const btnType = props.type === undefined ? "button" : String(props.type).trim().toLowerCase();
  if (!ALLOWED_BUTTON_TYPES.has(btnType)) {
    throw new GrexSecurityError(`Invalid Button type "${btnType}".`);
  }

  const base = buildBaseSpec("grex-button", config);
  base.attrs.type = btnType;
  if (props.disabled !== undefined) {
    base.attrs.disabled = props.disabled;
  }
  if (props.pressed !== undefined) {
    base.attrs["aria-pressed"] = props.pressed;
  }
  if (props.expanded !== undefined) {
    base.attrs["aria-expanded"] = props.expanded;
  }
  if (props.label != null) {
    base.attrs["aria-label"] = props.label;
  }
  if (typeof props.onClick === "function") {
    base.on.click = props.onClick;
  }

  return renderElement(
    {
      tag: "button",
      text: props.text !== undefined ? props.text : config.text,
      attrs: base.attrs,
      tokens: base.tokens,
      on: base.on,
    },
    options
  );
}

// --- 11-12: Media Elements ---

function validateSrcset(srcset) {
  const str = String(srcset).trim();
  if (str === "") {
    return "";
  }
  const candidates = str.split(",");
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const urlPart = trimmed.split(/\s+/)[0];
    if (!isSafeUrl(urlPart)) {
      throw new GrexSecurityError(`Unsafe URL blocked inside Image srcset: "${urlPart}".`);
    }
  }
  return str;
}

export function Image(config = {}, options = {}) {
  const props = config.props || {};
  if (config.tag && config.tag.toLowerCase() !== "img") {
    throw new GrexSecurityError(`Image must render <img>; received "${config.tag}".`);
  }
  if (props.src === undefined) {
    throw new GrexSecurityError("Image requires a src prop.");
  }

  const decorative = props.decorative === true;
  if (!decorative && typeof props.alt !== "string" && !isReactive(props.alt)) {
    throw new GrexSecurityError("Image requires an alt string (or decorative: true).");
  }

  const loading = props.loading === undefined ? "lazy" : String(props.loading).toLowerCase();
  if (loading !== "lazy" && loading !== "eager") {
    throw new GrexSecurityError(`Invalid Image loading mode "${loading}".`);
  }
  const decoding = props.decoding === undefined ? "async" : String(props.decoding).toLowerCase();
  if (decoding !== "async" && decoding !== "sync" && decoding !== "auto") {
    throw new GrexSecurityError(`Invalid Image decoding mode "${decoding}".`);
  }

  const base = buildBaseSpec("grex-image", config);
  base.attrs.src = props.src;
  base.attrs.loading = loading;
  base.attrs.decoding = decoding;

  if (decorative) {
    base.attrs.alt = "";
    base.attrs["aria-hidden"] = "true";
  } else {
    base.attrs.alt = props.alt;
  }

  if (props.width != null) {
    base.attrs.width = String(props.width);
  }
  if (props.height != null) {
    base.attrs.height = String(props.height);
  }
  if (props.sizes != null) {
    base.attrs.sizes = props.sizes;
  }
  if (props.srcset !== undefined) {
    if (isReactive(props.srcset) || typeof props.srcset === "function") {
      base.attrs.srcset = () => validateSrcset(readVal(props.srcset));
    } else {
      base.attrs.srcset = validateSrcset(props.srcset);
    }
  }

  return renderElement(
    {
      tag: "img",
      attrs: base.attrs,
      tokens: base.tokens,
      on: base.on,
    },
    options
  );
}

export function Icon(config = {}, options = {}) {
  const doc = options.document || globalThis.document;
  if (!doc || typeof doc.createElementNS !== "function") {
    throw new Error("Icon requires a DOM document with createElementNS().");
  }
  const props = config.props || {};
  if (config.tag && config.tag.toLowerCase() !== "svg") {
    throw new GrexSecurityError(`Icon must render <svg>; received "${config.tag}".`);
  }
  if ("rawSvg" in props || "html" in props) {
    throw new GrexSecurityError("Raw SVG markup is forbidden on Icon; use safe paths or symbolId.");
  }

  const viewBox = props.viewBox === undefined ? "0 0 24 24" : String(props.viewBox).trim();
  if (!/^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){3}$/.test(viewBox)) {
    throw new GrexSecurityError(`Invalid SVG viewBox "${viewBox}".`);
  }

  const size = props.size === undefined ? "24" : String(props.size).trim();
  const svg = doc.createElementNS(SVG_NS, "svg");
  const base = buildBaseSpec("grex-icon", config);
  base.attrs.viewBox = viewBox;
  base.attrs.width = size;
  base.attrs.height = size;
  base.attrs.fill = props.fill === undefined ? "none" : String(props.fill);

  if (props.label != null && String(props.label).trim() !== "") {
    base.attrs.role = "img";
    base.attrs["aria-label"] = String(props.label).trim();
  } else {
    base.attrs["aria-hidden"] = "true";
  }

  const binding = bindElement(svg, base);

  if (props.symbolId !== undefined) {
    const sym = String(props.symbolId).trim();
    if (!/^#[a-z0-9_-]+$/i.test(sym)) {
      throw new GrexSecurityError(`Unsafe Icon symbolId "${sym}"; must be a same-document #id.`);
    }
    const useEl = doc.createElementNS(SVG_NS, "use");
    useEl.setAttribute("href", sym);
    svg.appendChild(useEl);
  } else if (Array.isArray(props.paths)) {
    for (const shape of props.paths) {
      if (!shape || typeof shape !== "object" || typeof shape.tag !== "string") {
        throw new GrexSecurityError("Invalid Icon path descriptor.");
      }
      const shapeTag = shape.tag.trim().toLowerCase();
      if (!ALLOWED_SVG_TAGS.has(shapeTag)) {
        throw new GrexSecurityError(`Forbidden SVG tag "${shapeTag}" blocked by Icon allowlist.`);
      }
      const shapeEl = doc.createElementNS(SVG_NS, shapeTag);
      const shapeAttrs = shape.attrs || {};
      for (const [k, v] of Object.entries(shapeAttrs)) {
        const attrKey = k.trim().toLowerCase();
        if (isForbiddenAttribute(attrKey) || !ALLOWED_SVG_ATTRS.has(attrKey)) {
          throw new GrexSecurityError(`Forbidden SVG attribute "${k}" blocked by Icon allowlist.`);
        }
        shapeEl.setAttribute(attrKey, sanitizeAttributeValue(attrKey, v));
      }
      svg.appendChild(shapeEl);
    }
  } else {
    throw new GrexSecurityError("Icon requires either paths[] or symbolId.");
  }

  return {
    element: svg,
    dispose() {
      binding.dispose();
    },
  };
}

export const ELEMENT_REGISTRY = Object.freeze({
  Section,
  Container,
  Grid,
  Stack,
  Card,
  Heading,
  Text,
  RichText,
  Link,
  Button,
  Image,
  Icon,
});

/**
 * Render a declarative GrexElementNode JSON object (v0.2) or raw v0.1 spec.
 * @param {object} node
 * @param {{ document?: Document }} [options]
 */
export function renderNode(node, options = {}) {
  if (!node || typeof node !== "object") {
    throw new TypeError("renderNode(node) requires an object.");
  }
  if (typeof node.type === "string") {
    const factory = ELEMENT_REGISTRY[node.type];
    if (!factory) {
      throw new GrexSecurityError(`Unknown Grex element type "${node.type}".`);
    }
    return factory(node, options);
  }
  return renderElement(node, options);
}

// --- bridge.js ---
/**
 * Grex JS v0.1 Origin-Checked Split-Screen Preview Bridge (GrexPreviewBridge).
 * Patches in-memory signals, attributes, text, and --grex-* CSS custom properties
 * with zero Grisp restarts and strict postMessage origin & schema validation.
 */


export const PREVIEW_CHANNEL = "grex-preview-v1";

function normalizeAllowedOrigins(allowedOrigins) {
  if (!allowedOrigins) {
    throw new GrexSecurityError("GrexPreviewBridge requires a non-empty allowedOrigins allowlist.");
  }
  const list = Array.isArray(allowedOrigins) ? allowedOrigins : Array.from(allowedOrigins);
  if (list.length === 0) {
    throw new GrexSecurityError("GrexPreviewBridge allowedOrigins allowlist cannot be empty.");
  }
  const normalized = new Set();
  for (const origin of list) {
    if (typeof origin !== "string" || origin.trim() === "" || origin.trim() === "*") {
      throw new GrexSecurityError(`Invalid or wildcard origin "${String(origin)}" rejected by GrexPreviewBridge.`);
    }
    normalized.add(origin.trim());
  }
  return normalized;
}

function resolveTargetElement(targetId, elements, root) {
  if (!targetId) {
    return root && root.documentElement ? root.documentElement : root;
  }
  if (elements && elements[targetId]) {
    return elements[targetId];
  }
  if (root && typeof root.querySelector === "function") {
    const safeId = String(targetId).replace(/["\\]/g, "\\$&");
    return root.querySelector(`[data-grex-id="${safeId}"]`);
  }
  return null;
}

/**
 * Create an origin-checked GrexPreviewBridge instance.
 *
 * @param {{
 *   allowedOrigins: string[] | Set<string>,
 *   targetWindow?: Window,
 *   root?: Document | Element,
 *   signals?: Record<string, { set(v: unknown): void }>,
 *   elements?: Record<string, Element>,
 *   onError?: (err: Error, event: MessageEvent) => void
 * }} options
 */
export function createPreviewBridge(options) {
  if (!options || typeof options !== "object") {
    throw new TypeError("createPreviewBridge(options) requires an options object.");
  }

  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins);
  const targetWindow = options.targetWindow || globalThis.window;
  const root = options.root || globalThis.document;
  const signals = options.signals || {};
  const elements = options.elements || {};
  const onError = typeof options.onError === "function" ? options.onError : null;

  let listening = false;

  function applyOperation(op) {
    if (!op || typeof op !== "object") {
      throw new GrexSecurityError("Malformed preview bridge operation.");
    }

    switch (op.type) {
      case "patch-signal": {
        if (typeof op.key !== "string" || !(op.key in signals)) {
          throw new GrexSecurityError(`Unknown signal key "${String(op.key)}".`);
        }
        signals[op.key].set(op.value);
        return true;
      }

      case "patch-token": {
        const el = resolveTargetElement(op.targetId, elements, root);
        if (!el || !el.style) {
          throw new GrexSecurityError(`Target element "${String(op.targetId)}" not found for patch-token.`);
        }
        const tokenName = normalizeTokenName(op.token);
        const tokenValue = validateTokenValue(op.value);
        if (tokenValue === "") {
          el.style.removeProperty(tokenName);
        } else {
          el.style.setProperty(tokenName, tokenValue);
        }
        return true;
      }

      case "patch-style": {
        const el = resolveTargetElement(op.targetId, elements, root);
        if (!el || !el.style) {
          throw new GrexSecurityError(`Target element "${String(op.targetId)}" not found for patch-style.`);
        }
        const cssProp = normalizeStyleProperty(op.prop);
        const cssValue = validateTokenValue(op.value);
        if (cssValue === "") {
          el.style.removeProperty(cssProp);
        } else {
          el.style.setProperty(cssProp, cssValue);
        }
        return true;
      }

      case "patch-attr": {
        const el = resolveTargetElement(op.targetId, elements, root);
        if (!el) {
          throw new GrexSecurityError(`Target element "${String(op.targetId)}" not found for patch-attr.`);
        }
        if (op.value === false || op.value == null) {
          sanitizeAttributeValue(op.attr, "");
          el.removeAttribute(op.attr);
        } else {
          const safeVal = op.value === true ? "" : sanitizeAttributeValue(op.attr, op.value);
          el.setAttribute(op.attr, safeVal);
        }
        return true;
      }

      case "patch-text": {
        const el = resolveTargetElement(op.targetId, elements, root);
        if (!el) {
          throw new GrexSecurityError(`Target element "${String(op.targetId)}" not found for patch-text.`);
        }
        setSafeText(el, op.value);
        return true;
      }

      default:
        throw new GrexSecurityError(`Unsupported preview bridge operation type "${String(op.type)}".`);
    }
  }

  /**
   * Validate and process a postMessage event.
   * Returns true if applied, false if rejected (fail-closed).
   * @param {MessageEvent} event
   * @returns {boolean}
   */
  function handleMessage(event) {
    try {
      if (!event || typeof event.origin !== "string" || !allowedOrigins.has(event.origin)) {
        throw new GrexSecurityError(`Rejected preview message from untrusted origin "${String(event && event.origin)}".`);
      }

      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.channel !== PREVIEW_CHANNEL) {
        throw new GrexSecurityError("Rejected preview message with invalid channel or payload.");
      }

      if (payload.type === "batch") {
        if (!Array.isArray(payload.ops)) {
          throw new GrexSecurityError("Batch preview payload requires an ops array.");
        }
        batch(() => {
          for (const op of payload.ops) {
            applyOperation(op);
          }
        });
        return true;
      }

      return applyOperation(payload);
    } catch (err) {
      if (onError) {
        onError(err, event);
      }
      return false;
    }
  }

  function start() {
    if (listening || !targetWindow || typeof targetWindow.addEventListener !== "function") {
      return;
    }
    targetWindow.addEventListener("message", handleMessage);
    listening = true;
  }

  function stop() {
    if (!listening || !targetWindow || typeof targetWindow.removeEventListener !== "function") {
      return;
    }
    targetWindow.removeEventListener("message", handleMessage);
    listening = false;
  }

  return {
    handleMessage,
    start,
    stop,
    dispose: stop,
  };
}
