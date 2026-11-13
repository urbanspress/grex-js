/**
 * Grex JS v0.1 Zero-Wrapper-Div Semantic DOM Engine & Selective Hydration (ADR-018).
 */

import { effect } from "./signals.js";
import {
  assertSafeTag,
  sanitizeAttributeValue,
  setSafeText,
} from "./security.js";
import { normalizeTokenName, validateTokenValue } from "./tokens.js";

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
