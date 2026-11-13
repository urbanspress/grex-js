import test from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  hydrate,
  applyTokens,
  compileTokenCss,
  createPreviewBridge,
  PREVIEW_CHANNEL,
  GrexSecurityError,
} from "../src/index.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("compileTokenCss generates deterministic /static/grex/ CSS with breakpoints and blocks CSS injection", () => {
  const css = compileTokenCss({
    root: {
      "--grex-bg": "#f8fafc",
      accent: "#0d9488",
    },
    selectors: {
      ".hero": {
        base: { "--grex-pad": "48px" },
        tablet: { "--grex-pad": "32px" },
        mobile: { "--grex-pad": "16px" },
      },
    },
  });

  assert.match(css, /:root \{\n  --grex-bg: #f8fafc;\n  --grex-accent: #0d9488;\n\}/);
  assert.match(css, /\.hero \{\n  --grex-pad: 48px;\n\}/);
  assert.match(css, /@media \(max-width: 1024px\) \{/);
  assert.match(css, /@media \(max-width: 640px\) \{/);

  assert.throws(
    () => compileTokenCss({ root: { "--grex-bg": "red; background: url(evil)" } }),
    GrexSecurityError
  );
  assert.throws(
    () => compileTokenCss({ selectors: { ".hero { color: red }": { base: { "--grex-a": "1" } } } }),
    GrexSecurityError
  );
});

test("GrexPreviewBridge rejects missing, empty, or wildcard allowedOrigins", () => {
  assert.throws(() => createPreviewBridge({}), GrexSecurityError);
  assert.throws(() => createPreviewBridge({ allowedOrigins: [] }), GrexSecurityError);
  assert.throws(() => createPreviewBridge({ allowedOrigins: ["*"] }), GrexSecurityError);
});

test("GrexPreviewBridge validates origin & payload and patches signals, tokens, attrs, and text in browser memory", () => {
  const { document, window, body } = createTestEnv();

  const section = document.createElement("section");
  section.setAttribute("data-grex-id", "hero");
  const title = document.createElement("h1");
  title.setAttribute("data-grex-id", "hero-title");
  title.setAttribute("data-grex-text", "title");
  const price = document.createElement("p");
  price.setAttribute("data-grex-id", "hero-price");
  price.setAttribute("data-grex-text", "price");
  const link = document.createElement("a");
  link.setAttribute("data-grex-id", "hero-link");
  link.setAttribute("href", "/shop");

  section.appendChild(title);
  section.appendChild(price);
  section.appendChild(link);
  body.appendChild(section);

  const signals = {
    title: signal("Initial"),
    price: signal("19.95"),
  };

  const ctx = hydrate(body, { signals });
  const errors = [];
  const bridge = createPreviewBridge({
    allowedOrigins: ["http://127.0.0.1:8080"],
    targetWindow: window,
    root: body,
    signals,
    elements: ctx.elements,
    onError: (err) => errors.push(err),
  });

  bridge.start();
  assert.equal(window.listenerCount("message"), 1);

  // 1. Untrusted origin rejected fail-closed
  window.postMessage(
    { channel: PREVIEW_CHANNEL, type: "patch-signal", key: "title", value: "Hacked" },
    "https://evil.example"
  );
  assert.equal(title.textContent, "Initial");
  assert.equal(errors.length, 1);

  // 2. Wrong channel rejected
  window.postMessage(
    { channel: "other-channel", type: "patch-signal", key: "title", value: "Ignored" },
    "http://127.0.0.1:8080"
  );
  assert.equal(title.textContent, "Initial");

  // 3. Trusted origin live batch update (zero Grisp restarts, exact decimal preserved)
  window.postMessage(
    {
      channel: PREVIEW_CHANNEL,
      type: "batch",
      ops: [
        { type: "patch-signal", key: "title", value: "Winter Launch" },
        { type: "patch-signal", key: "price", value: "24.95" },
        { type: "patch-token", targetId: "hero", token: "--grex-bg", value: "#0f172a" },
        { type: "patch-attr", targetId: "hero-link", attr: "href", value: "/winter" },
        { type: "patch-text", targetId: "hero-link", value: "Explore Winter" },
      ],
    },
    "http://127.0.0.1:8080"
  );

  assert.equal(title.textContent, "Winter Launch");
  assert.equal(price.textContent, "24.95");
  assert.equal(section.style.getPropertyValue("--grex-bg"), "#0f172a");
  assert.equal(link.getAttribute("href"), "/winter");
  assert.equal(link.textContent, "Explore Winter");

  // 4. XSS payload via trusted bridge is still blocked fail-closed
  const blockedUrl = bridge.handleMessage({
    origin: "http://127.0.0.1:8080",
    data: {
      channel: PREVIEW_CHANNEL,
      type: "patch-attr",
      targetId: "hero-link",
      attr: "href",
      value: "javascript:alert(1)",
    },
  });
  assert.equal(blockedUrl, false);
  assert.equal(link.getAttribute("href"), "/winter");

  const blockedToken = bridge.handleMessage({
    origin: "http://127.0.0.1:8080",
    data: {
      channel: PREVIEW_CHANNEL,
      type: "patch-token",
      targetId: "hero",
      token: "--grex-bg",
      value: "#fff; }</style><script>alert(1)</script>",
    },
  });
  assert.equal(blockedToken, false);
  assert.equal(section.style.getPropertyValue("--grex-bg"), "#0f172a");

  applyTokens(section, { "--grex-gap": "24px" });
  assert.equal(section.style.getPropertyValue("--grex-gap"), "24px");

  bridge.dispose();
  ctx.dispose();
  assert.equal(window.listenerCount("message"), 0);
});
