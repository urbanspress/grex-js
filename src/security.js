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
