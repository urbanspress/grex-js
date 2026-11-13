import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  signal,
  renderElement,
  hydrate,
  isSafeUrl,
  isForbiddenAttribute,
  sanitizeAttributeValue,
  GrexSecurityError,
} from "../src/index.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("runtime source files contain zero eval() or new Function() calls (strict CSP script-src 'self')", () => {
  const srcDir = path.resolve("src");
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 5);

  for (const file of files) {
    const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
    const codeOnly = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.equal(/\beval\s*\(/.test(codeOnly), false, `Found eval() in ${file}`);
    assert.equal(/\bnew\s+Function\s*\(/.test(codeOnly), false, `Found new Function() in ${file}`);
    assert.equal(/\.innerHTML\b/.test(codeOnly), false, `Found .innerHTML in ${file}`);
  }
});

test("blocks dangerous HTML tags (<script>, <iframe>, <object>, <style>, etc.)", () => {
  const { document } = createTestEnv();
  for (const badTag of ["script", "SCRIPT", "iframe", "object", "embed", "style", "meta", "base"]) {
    assert.throws(() => renderElement({ tag: badTag }, { document }), GrexSecurityError);
  }
});

test("blocks javascript:, data:, vbscript:, and control-char obfuscated URLs while allowing safe URLs", () => {
  const unsafe = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "  \u0000javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "DATA:image/svg+xml,<svg onload=alert(1)>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ];
  for (const url of unsafe) {
    assert.equal(isSafeUrl(url), false, `Expected unsafe URL blocked: ${JSON.stringify(url)}`);
    assert.throws(() => sanitizeAttributeValue("href", url), GrexSecurityError);
    assert.throws(() => sanitizeAttributeValue("src", url), GrexSecurityError);
  }

  const safe = [
    "/static/grex/tokens.css?v=a1b2c3d4e5f6",
    "./catalog/item",
    "../home",
    "#section-2",
    "?sort=price",
    "products/wool-hat",
    "https://example.com/checkout",
    "http://127.0.0.1:8080/preview",
    "mailto:hello@example.com",
    "tel:+15550100",
  ];
  for (const url of safe) {
    assert.equal(isSafeUrl(url), true, `Expected safe URL allowed: ${url}`);
  }
});

test("forbids inline on* event handler attributes and srcdoc", () => {
  for (const attr of ["onclick", "ONLOAD", "onerror", "onmouseover", "srcdoc"]) {
    assert.equal(isForbiddenAttribute(attr), true);
    assert.throws(() => sanitizeAttributeValue(attr, "alert(1)"), GrexSecurityError);
  }
  assert.equal(isForbiddenAttribute("aria-label"), false);
  assert.equal(isForbiddenAttribute("data-grex-id"), false);
});

test("text bindings neutralize HTML/XSS payloads via textContent without innerHTML writes", () => {
  const { document } = createTestEnv();
  const payload = signal(`<img src=x onerror="alert(1)"><script>evil()</script>`);
  const rendered = renderElement({ tag: "p", text: payload }, { document });

  assert.equal(rendered.element.innerHTMLWriteCount, 0);
  assert.equal(rendered.element.querySelectorAll("img").length, 0);
  assert.equal(rendered.element.querySelectorAll("script").length, 0);
  assert.equal(rendered.element.textContent, `<img src=x onerror="alert(1)"><script>evil()</script>`);
  rendered.dispose();
});

test("selective hydration rejects unsafe href updates fail-closed", () => {
  const { document, body } = createTestEnv();
  const link = document.createElement("a");
  link.setAttribute("data-grex-attr-href", "linkUrl");
  body.appendChild(link);

  const linkUrl = signal("javascript:alert(1)");
  assert.throws(
    () => hydrate(body, { signals: { linkUrl } }),
    GrexSecurityError
  );
  assert.equal(link.getAttribute("href"), null);
});
