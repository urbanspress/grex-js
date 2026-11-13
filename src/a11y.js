/**
 * Grex JS v0.4 / v1.0.0 Built-In Accessibility Audit & WCAG AA Guardrails.
 * Zero external dependencies. Validates contrast ratios, Image alt text,
 * form <label> associations, heading hierarchy, and focus indicators.
 */

/**
 * Parse a hex (#RGB, #RRGGBB) or rgb()/rgba() color into { r, g, b } (0..255).
 * Returns null for CSS variables or unsupported strings.
 * @param {unknown} color
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function parseCssColor(color) {
  if (typeof color !== "string") {
    return null;
  }
  const s = color.trim();
  const hex3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (hex3) {
    const [r, g, b] = hex3[1].split("").map((ch) => Number.parseInt(ch + ch, 16));
    return { r, g, b };
  }
  const hex6 = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex6) {
    const h = hex6[1];
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
    };
  }
  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(s);
  if (rgbMatch) {
    const r = Math.min(255, Number(rgbMatch[1]));
    const g = Math.min(255, Number(rgbMatch[2]));
    const b = Math.min(255, Number(rgbMatch[3]));
    return { r, g, b };
  }
  return null;
}

function linearizeChannel(val255) {
  const c = val255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/**
 * Compute WCAG 2.1 contrast ratio between two CSS colors (returns 1..21, or null if unparseable).
 * @param {string} fgColor
 * @param {string} bgColor
 * @returns {number | null}
 */
export function computeContrastRatio(fgColor, bgColor) {
  const fg = parseCssColor(fgColor);
  const bg = parseCssColor(bgColor);
  if (!fg || !bg) {
    return null;
  }
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function isLargeTextStyle(baseStyle = {}) {
  const sizeMatch = /^(\d+(?:\.\d+)?)px$/i.exec(String(baseStyle.fontSize || baseStyle["font-size"] || ""));
  if (!sizeMatch) {
    return false;
  }
  const px = Number(sizeMatch[1]);
  const weight = baseStyle.fontWeight || baseStyle["font-weight"];
  const isBold = weight === "bold" || Number(weight) >= 700;
  return px >= 24 || (isBold && px >= 18.66);
}

function getTreeNodeText(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  const props = node.props || {};
  if (typeof props.text === "string") {
    return props.text;
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (typeof props.label === "string") {
    return props.label;
  }
  if (node.attrs && typeof node.attrs["aria-label"] === "string") {
    return node.attrs["aria-label"];
  }
  if (Array.isArray(node.children)) {
    return node.children
      .map((c) => (typeof c === "string" ? c : getTreeNodeText(c)))
      .join("")
      .trim();
  }
  return "";
}

/**
 * Audit a declarative GrexElementNode JSON tree for WCAG AA contrast,
 * Image alt text, form labels, heading hierarchy, and focus indicators.
 *
 * @param {object | Array<object>} tree
 * @param {{ defaultBg?: string }} [options]
 * @returns {{ ok: boolean, issues: Array<{ severity: "error" | "warning", code: string, nodeId?: string, message: string }> }}
 */
export function auditAccessibility(tree, options = {}) {
  const issues = [];
  const list = Array.isArray(tree) ? tree : [tree];
  let lastHeadingLevel = 0;
  let h1Count = 0;

  const visit = (node, inheritedBg) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const nodeId = typeof node.id === "string" ? node.id : undefined;
    const props = node.props || {};
    const attrs = node.attrs || {};
    const baseStyle = (node.styles && (node.styles.base || node.styles)) || {};

    const bgColor = baseStyle.backgroundColor || baseStyle["background-color"] || baseStyle.background || inheritedBg;
    const fgColor = baseStyle.color;

    if (fgColor && bgColor) {
      const ratio = computeContrastRatio(fgColor, bgColor);
      if (ratio !== null) {
        const minRatio = isLargeTextStyle(baseStyle) ? 3.0 : 4.5;
        if (ratio < minRatio) {
          issues.push({
            severity: "error",
            code: "GREX-A11Y-001",
            nodeId,
            message: `Contrast ratio ${ratio}:1 (${fgColor} on ${bgColor}) is below WCAG AA minimum ${minRatio}:1.`,
          });
        }
      }
    }

    if (baseStyle.outline === "none" || baseStyle.outline === 0 || baseStyle.outline === "0") {
      issues.push({
        severity: "error",
        code: "GREX-A11Y-005",
        nodeId,
        message: "Removing focus outline without a replacement focus indicator violates keyboard accessibility.",
      });
    }

    if (node.type === "Image") {
      const hasAlt = typeof props.alt === "string" && props.alt.trim() !== "";
      if (!hasAlt && props.decorative !== true) {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-002",
          nodeId,
          message: "Image must provide descriptive alt text or set decorative: true.",
        });
      }
    }

    if (node.type === "Input" || node.type === "Select") {
      const isHidden = String(props.type || "").toLowerCase() === "hidden";
      const hasLabel =
        (typeof props.label === "string" && props.label.trim() !== "") ||
        (typeof attrs["aria-label"] === "string" && attrs["aria-label"].trim() !== "") ||
        (typeof attrs["aria-labelledby"] === "string" && attrs["aria-labelledby"].trim() !== "");
      if (!isHidden && !hasLabel) {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-003",
          nodeId,
          message: `${node.type} must provide a label, aria-label, or aria-labelledby.`,
        });
      }
    }

    if (node.type === "Heading") {
      const level = props.level === undefined ? 2 : Number(props.level);
      if (level === 1) {
        h1Count += 1;
        if (h1Count > 1) {
          issues.push({
            severity: "warning",
            code: "GREX-A11Y-004",
            nodeId,
            message: "Multiple <h1> headings detected; prefer a single primary <h1> per page.",
          });
        }
      }
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-004",
          nodeId,
          message: `Skipped heading level from <h${lastHeadingLevel}> to <h${level}>.`,
        });
      }
      if (level >= 1 && level <= 6) {
        lastHeadingLevel = level;
      }
    }

    if (node.type === "Button" || node.type === "Link") {
      const accessibleName = getTreeNodeText(node);
      if (accessibleName === "") {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-005",
          nodeId,
          message: `${node.type} must have visible text or an aria-label.`,
        });
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child, bgColor);
      }
    }
    if (Array.isArray(props.tabs)) {
      for (const tab of props.tabs) {
        if (tab && tab.content) {
          const contentArr = Array.isArray(tab.content) ? tab.content : [tab.content];
          contentArr.forEach((c) => visit(c, bgColor));
        }
      }
    }
    if (Array.isArray(props.items)) {
      for (const item of props.items) {
        if (item && item.content) {
          const contentArr = Array.isArray(item.content) ? item.content : [item.content];
          contentArr.forEach((c) => visit(c, bgColor));
        }
      }
    }
  };

  for (const rootNode of list) {
    visit(rootNode, options.defaultBg || null);
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues,
  };
}

function hasWrappingLabel(el) {
  let curr = el.parentNode;
  while (curr) {
    if (curr.localName === "label") {
      return true;
    }
    curr = curr.parentNode;
  }
  return false;
}

/**
 * Audit a rendered DOM tree for accessibility compliance (alt text, form labels,
 * heading hierarchy, and interactive accessible names).
 *
 * @param {Document | Element} root
 * @returns {{ ok: boolean, issues: Array<{ severity: "error" | "warning", code: string, nodeId?: string, message: string }> }}
 */
export function auditDom(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    throw new TypeError("auditDom(root) requires a DOM Document or Element.");
  }

  const issues = [];
  const allNodes = Array.from(root.querySelectorAll("*"));
  let lastHeadingLevel = 0;
  let h1Count = 0;

  for (const el of allNodes) {
    const tag = el.localName || (el.tagName && el.tagName.toLowerCase()) || "";
    const nodeId = el.getAttribute("data-grex-id") || el.getAttribute("id") || undefined;

    if (tag === "img") {
      const alt = el.getAttribute("alt");
      const hidden = el.getAttribute("aria-hidden") === "true";
      if ((alt === null || alt.trim() === "") && !hidden) {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-002",
          nodeId,
          message: "<img> element must have descriptive alt text or aria-hidden=\"true\".",
        });
      }
    }

    if (tag === "input" || tag === "select" || tag === "textarea") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type !== "hidden") {
        const id = el.getAttribute("id");
        const hasForLabel = id ? Boolean(root.querySelector(`label[for="${id}"]`)) : false;
        const hasAria =
          Boolean(el.getAttribute("aria-label")) || Boolean(el.getAttribute("aria-labelledby"));
        if (!hasForLabel && !hasWrappingLabel(el) && !hasAria) {
          issues.push({
            severity: "error",
            code: "GREX-A11Y-003",
            nodeId,
            message: `<${tag}> element is missing an associated <label> or aria-label.`,
          });
        }
      }
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      if (level === 1) {
        h1Count += 1;
        if (h1Count > 1) {
          issues.push({
            severity: "warning",
            code: "GREX-A11Y-004",
            nodeId,
            message: "Multiple <h1> headings detected in DOM.",
          });
        }
      }
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-004",
          nodeId,
          message: `Skipped heading level from <h${lastHeadingLevel}> to <h${level}>.`,
        });
      }
      lastHeadingLevel = level;
    }

    if (tag === "button" || tag === "a") {
      const text = (el.textContent || "").trim();
      const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      const labelledChild = el.querySelector("[aria-label], img[alt]");
      if (!text && !ariaLabel && !labelledChild) {
        issues.push({
          severity: "error",
          code: "GREX-A11Y-005",
          nodeId,
          message: `<${tag}> element has no accessible name.`,
        });
      }
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues,
  };
}
