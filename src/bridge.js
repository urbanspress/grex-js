/**
 * Grex JS v0.1 Origin-Checked Split-Screen Preview Bridge (GrexPreviewBridge).
 * Patches in-memory signals, attributes, text, and --grex-* CSS custom properties
 * with zero Grisp restarts and strict postMessage origin & schema validation.
 */

import { batch } from "./signals.js";
import { GrexSecurityError, sanitizeAttributeValue, setSafeText } from "./security.js";
import { normalizeStyleProperty, normalizeTokenName, validateTokenValue } from "./tokens.js";

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
