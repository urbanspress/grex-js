import test from "node:test";
import assert from "node:assert/strict";
import {
  signal,
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
  renderNode,
  compileElementStyles,
  createPreviewBridge,
  PREVIEW_CHANNEL,
  GrexSecurityError,
} from "../src/index.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("all 12 core v0.2 elements render semantic HTML5 tags with zero wrapper <div> nodes", () => {
  const { document, body } = createTestEnv();
  const count = signal(0);
  const price = signal("19.95");

  const tree = {
    type: "Section",
    id: "catalog-sec",
    props: { label: "Featured Catalog" },
    styles: {
      base: { paddingBlock: "48px" },
      tablet: { paddingBlock: "32px" },
      mobile: { paddingBlock: "16px" },
    },
    children: [
      {
        type: "Container",
        id: "catalog-wrap",
        props: { maxWidth: "1120px" },
        children: [
          {
            type: "Grid",
            id: "product-grid",
            props: { columns: "repeat(3, 1fr)", gap: "24px" },
            children: [
              {
                type: "Card",
                id: "card-1",
                props: { elevated: true },
                children: [
                  {
                    type: "Stack",
                    id: "card-stack",
                    props: { direction: "column", gap: "12px" },
                    children: [
                      {
                        type: "Image",
                        id: "beanie-img",
                        props: {
                          src: "/static/grex/beanie.jpg",
                          srcset: "/static/grex/beanie-400.jpg 400w, /static/grex/beanie-800.jpg 800w",
                          alt: "Merino Wool Beanie",
                          width: 400,
                          height: 400,
                        },
                      },
                      { type: "Heading", id: "beanie-h", props: { level: 3, text: "Merino Beanie" } },
                      { type: "Text", id: "beanie-price", props: { text: price } },
                      {
                        type: "RichText",
                        id: "beanie-desc",
                        props: {
                          nodes: [
                            "Warm ",
                            { tag: "strong", text: "100% merino" },
                            " knit. ",
                            { tag: "a", text: "Care guide", attrs: { href: "https://example.com/care" } },
                          ],
                        },
                      },
                      {
                        type: "Link",
                        id: "beanie-link",
                        props: { href: "https://example.com/beanie", target: "_blank", text: "View Details" },
                      },
                      {
                        type: "Button",
                        id: "beanie-btn",
                        props: {
                          text: () => `Add (${count.get()})`,
                          onClick: () => count.set((c) => c + 1),
                        },
                      },
                      {
                        type: "Icon",
                        id: "beanie-check",
                        props: {
                          label: "In stock",
                          paths: [{ tag: "path", attrs: { d: "M5 13l4 4L19 7", stroke: "currentColor" } }],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const rendered = renderNode(tree, { document });
  body.appendChild(rendered.element);

  // Zero wrapper <div> bloat anywhere in the entire tree
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(rendered.element.localName, "section");
  assert.equal(rendered.element.getAttribute("aria-label"), "Featured Catalog");
  assert.match(rendered.element.getAttribute("class"), /grex-section/);
  assert.match(rendered.element.getAttribute("class"), /grex-el-catalog-sec/);

  // Check semantic tags & exact GRAB decimal wire string
  assert.equal(body.querySelector("article").localName, "article");
  assert.equal(body.querySelector("h3").textContent, "Merino Beanie");
  assert.equal(body.querySelector("p").textContent, "19.95");

  // Check Button default type="button" and reactive click
  const btn = body.querySelector("button");
  assert.equal(btn.getAttribute("type"), "button");
  assert.equal(btn.textContent, "Add (0)");
  btn.dispatchEvent({ type: "click" });
  assert.equal(btn.textContent, "Add (1)");

  // Check Link rel="noopener noreferrer" enforcement
  const links = body.querySelectorAll("a");
  assert.equal(links.length, 2);
  for (const a of links) {
    assert.match(a.getAttribute("rel"), /noopener/);
    assert.match(a.getAttribute("rel"), /noreferrer/);
  }

  // Check Image CLS + lazy loading defaults
  const img = body.querySelector("img");
  assert.equal(img.getAttribute("loading"), "lazy");
  assert.equal(img.getAttribute("decoding"), "async");
  assert.equal(img.getAttribute("width"), "400");
  assert.equal(img.getAttribute("height"), "400");

  // Check Icon SVG namespace and accessibility
  const svg = body.querySelector("svg");
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(svg.getAttribute("role"), "img");
  assert.equal(svg.getAttribute("aria-label"), "In stock");

  rendered.dispose();
  assert.equal(btn.listenerCount("click"), 0);
});

test("layout and typography elements enforce allowed tag overrides and Heading levels", () => {
  const { document } = createTestEnv();

  const header = Section({ tag: "header", props: { label: "Site Header" } }, { document });
  assert.equal(header.element.localName, "header");
  header.dispose();

  const navStack = Stack({ tag: "nav", props: { direction: "row", gap: "16px" } }, { document });
  assert.equal(navStack.element.localName, "nav");
  assert.equal(navStack.element.style.getPropertyValue("--grex-stack-dir"), "row");
  navStack.dispose();

  const timeText = Text({ tag: "time", props: { text: "Nov 13", dateTime: "2026-11-13" } }, { document });
  assert.equal(timeText.element.localName, "time");
  assert.equal(timeText.element.getAttribute("datetime"), "2026-11-13");
  timeText.dispose();

  assert.throws(() => Section({ tag: "div" }, { document }), GrexSecurityError);
  assert.throws(() => Card({ tag: "script" }, { document }), GrexSecurityError);
  assert.throws(() => Heading({ props: { level: 0, text: "Bad" } }, { document }), GrexSecurityError);
  assert.throws(() => Heading({ props: { level: 7, text: "Bad" } }, { document }), GrexSecurityError);
  assert.throws(() => Button({ props: { type: "invalid" } }, { document }), GrexSecurityError);
});

test("RichText strips/blocks XSS payloads without ever touching innerHTML", () => {
  const { document } = createTestEnv();
  const dirtyHtml = signal(
    `<div class="evil">Hello <strong>Grex</strong></div><script>alert(1)</script><style>body{display:none}</style><a href="javascript:alert(2)" onclick="steal()">Bad Link</a> and <a href="https://grab.dev" target="_blank">Safe Link</a>`
  );

  const rt = RichText({ props: { html: dirtyHtml } }, { document });
  assert.equal(rt.element.innerHTMLWriteCount, 0);
  assert.equal(rt.element.querySelectorAll("script").length, 0);
  assert.equal(rt.element.querySelectorAll("style").length, 0);
  assert.equal(rt.element.querySelectorAll("div").length, 0);
  assert.equal(rt.element.querySelector("strong").textContent, "Grex");

  const anchors = rt.element.querySelectorAll("a");
  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].getAttribute("href"), null); // javascript: stripped
  assert.equal(anchors[0].getAttribute("onclick"), null);
  assert.equal(anchors[1].getAttribute("href"), "https://grab.dev");
  assert.match(anchors[1].getAttribute("rel"), /noopener/);
  assert.match(anchors[1].getAttribute("rel"), /noreferrer/);
  assert.equal(rt.element.textContent.includes("alert(1)"), false);

  // Reactive update re-sanitizes cleanly
  dirtyHtml.set(`<em>Updated</em><iframe src="https://evil.test">nope</iframe>`);
  assert.equal(rt.element.querySelectorAll("iframe").length, 0);
  assert.equal(rt.element.querySelector("em").textContent, "Updated");
  rt.dispose();

  // Structured nodes fail closed on disallowed tags or unsafe URLs
  assert.throws(
    () => RichText({ props: { nodes: [{ tag: "script", text: "alert(1)" }] } }, { document }),
    GrexSecurityError
  );
  assert.throws(
    () => RichText({ props: { nodes: [{ tag: "a", text: "X", attrs: { href: "data:text/html,xss" } }] } }, { document }),
    GrexSecurityError
  );
});

test("Image and Icon enforce accessibility, URL/srcset validation, and SVG allowlists", () => {
  const { document } = createTestEnv();

  // Decorative image gets alt="" + aria-hidden="true"
  const deco = Image({ props: { src: "/static/grex/bg.png", decorative: true } }, { document });
  assert.equal(deco.element.getAttribute("alt"), "");
  assert.equal(deco.element.getAttribute("aria-hidden"), "true");
  deco.dispose();

  // Missing alt without decorative throws
  assert.throws(() => Image({ props: { src: "/static/grex/bg.png" } }, { document }), GrexSecurityError);
  // Unsafe srcset URL blocked
  assert.throws(
    () =>
      Image(
        {
          props: {
            src: "/static/grex/ok.png",
            alt: "Ok",
            srcset: "/static/grex/ok.png 1x, javascript:alert(1) 2x",
          },
        },
        { document }
      ),
    GrexSecurityError
  );

  // Icon safe symbolId + decorative default
  const symIcon = Icon({ props: { symbolId: "#icon-cart", size: 20 } }, { document });
  assert.equal(symIcon.element.getAttribute("aria-hidden"), "true");
  assert.equal(symIcon.element.querySelector("use").getAttribute("href"), "#icon-cart");
  symIcon.dispose();

  // Icon rejects rawSvg, unsafe tags, onclick, and external <use> hrefs
  assert.throws(() => Icon({ props: { rawSvg: "<svg><script></script></svg>" } }, { document }), GrexSecurityError);
  assert.throws(
    () => Icon({ props: { paths: [{ tag: "script", attrs: {} }] } }, { document }),
    GrexSecurityError
  );
  assert.throws(
    () => Icon({ props: { paths: [{ tag: "path", attrs: { d: "M0 0", onload: "alert(1)" } }] } }, { document }),
    GrexSecurityError
  );
  assert.throws(
    () => Icon({ props: { symbolId: "https://evil.example/sprite.svg#x" } }, { document }),
    GrexSecurityError
  );
});

test("compileElementStyles compiles deterministic /static/grex/ CSS and GrexPreviewBridge live-patches styles", () => {
  const { document, window, body } = createTestEnv();

  const node = {
    type: "Section",
    id: "hero-sec",
    styles: {
      base: { paddingBlock: "48px", backgroundColor: "var(--grex-surface)" },
      tablet: { paddingBlock: "32px" },
      mobile: { paddingBlock: "16px", gap: "12px" },
    },
    children: [
      {
        type: "Heading",
        id: "hero-h1",
        props: { level: 1, text: "Hello Grex" },
        styles: {
          base: { fontSize: "40px" },
          mobile: { fontSize: "28px" },
        },
      },
    ],
  };

  const css = compileElementStyles(node, {
    root: { "--grex-surface": "#ffffff" },
  });

  assert.match(css, /:root \{\n  --grex-surface: #ffffff;\n\}/);
  assert.match(css, /\.grex-el-hero-sec \{\n  padding-block: 48px;\n  background-color: var\(--grex-surface\);\n\}/);
  assert.match(css, /@media \(max-width: 1024px\) \{\n  \.grex-el-hero-sec \{\n    padding-block: 32px;\n  \}\n\}/);
  assert.match(css, /@media \(max-width: 640px\) \{/);

  // Disallowed CSS property & CSS injection blocked
  assert.throws(
    () =>
      compileElementStyles({
        type: "Section",
        id: "bad-sec",
        styles: { base: { behavior: "url(xss.htc)" } },
      }),
    GrexSecurityError
  );
  assert.throws(
    () =>
      compileElementStyles({
        type: "Section",
        id: "bad-sec-2",
        styles: { base: { color: "red; } </style><script>alert(1)</script>" } },
      }),
    GrexSecurityError
  );

  // Live split-screen GrexPreviewBridge patch-style
  const rendered = renderNode(node, { document });
  body.appendChild(rendered.element);
  const bridge = createPreviewBridge({
    allowedOrigins: ["http://127.0.0.1:8080"],
    targetWindow: window,
    root: body,
  });

  const ok = bridge.handleMessage({
    origin: "http://127.0.0.1:8080",
    data: {
      channel: PREVIEW_CHANNEL,
      type: "patch-style",
      targetId: "hero-sec",
      prop: "paddingBlock",
      value: "64px",
    },
  });
  assert.equal(ok, true);
  assert.equal(rendered.element.style.getPropertyValue("padding-block"), "64px");

  const blocked = bridge.handleMessage({
    origin: "http://127.0.0.1:8080",
    data: {
      channel: PREVIEW_CHANNEL,
      type: "patch-style",
      targetId: "hero-sec",
      prop: "behavior",
      value: "url(bad)",
    },
  });
  assert.equal(blocked, false);

  rendered.dispose();
  bridge.dispose();
});
