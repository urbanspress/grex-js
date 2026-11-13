/**
 * Grex JS v0.2 Zero-Bloat Layout, Typography & Media Elements.
 * 12 native semantic HTML5 elements with zero wrapper <div>s,
 * strict XSS allowlists (zero innerHTML), and accessibility defaults.
 */

import { effect } from "./signals.js";
import {
  GrexSecurityError,
  isForbiddenAttribute,
  isSafeUrl,
  sanitizeAttributeValue,
  setSafeText,
} from "./security.js";
import { bindElement, renderElement } from "./dom.js";
import { getElementStyleClass } from "./tokens.js";

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
