import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createTheme,
  createClassManager,
  parseCssColor,
  computeContrastRatio,
  auditAccessibility,
  auditDom,
  exportElementCatalog,
  validateElementNode,
  GrexSecurityError,
  renderNode,
  Image,
  Input,
  Heading,
  Button,
  Section,
} from "../src/index.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("createTheme compiles light/dark tokens, :focus-visible guardrail, applies live mode, and blocks CSS injection", () => {
  const theme = createTheme({
    colors: {
      accent: "#0284c7",
      surface: "#ffffff",
      text: "#0f172a",
    },
    spacing: {
      "card-gap": "1.25rem",
    },
    modes: {
      dark: {
        colors: {
          surface: "#0f172a",
          text: "#f8fafc",
        },
      },
    },
    prefersColorScheme: true,
  });

  const css = theme.compileCss();
  assert.match(css, /:root \{/);
  assert.match(css, /--grex-accent: #0284c7;/);
  assert.match(css, /--grex-card-gap: 1\.25rem;/);
  assert.match(css, /\[data-grex-theme="dark"\] \{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{/);
  assert.match(css, /:focus-visible \{/);
  assert.match(css, /outline: var\(--grex-focus-ring, 2px solid #0284c7\);/);

  const { document } = createTestEnv();
  const root = document.createElement("main");
  theme.applyTo(root, "dark");
  assert.equal(root.getAttribute("data-grex-theme"), "dark");
  assert.equal(root.style.getPropertyValue("--grex-surface"), "#0f172a");
  assert.equal(root.style.getPropertyValue("--grex-accent"), "#0284c7");

  theme.applyTo(root, null);
  assert.equal(root.getAttribute("data-grex-theme"), null);

  assert.throws(
    () => createTheme({ modes: { "bad;mode": { accent: "#000" } } }),
    GrexSecurityError
  );
  assert.throws(
    () => createTheme({ colors: { accent: "red; background: url(javascript:alert(1))" } }),
    GrexSecurityError
  );
});

test("createClassManager registers classes, compiles deterministic responsive CSS, and rejects unsafe input", () => {
  const manager = createClassManager();
  const cls = manager.registerClass("hero-banner", {
    base: {
      padding: "2rem",
      backgroundColor: "#0f172a",
      color: "#ffffff",
    },
    tablet: {
      padding: "1.5rem",
    },
    mobile: {
      padding: "1rem",
    },
  });

  assert.equal(cls, "grex-c-hero-banner");
  assert.equal(manager.hasClass("hero-banner"), true);
  assert.equal(manager.getClassName("hero-banner"), "grex-c-hero-banner");
  assert.deepEqual(manager.listClasses(), ["hero-banner"]);

  const css = manager.compileCss();
  assert.match(css, /\.grex-c-hero-banner \{\s*padding: 2rem;\s*background-color: #0f172a;\s*color: #ffffff;\s*\}/);
  assert.match(css, /@media \(max-width: 1024px\) \{[\s\S]*\.grex-c-hero-banner \{[\s\S]*padding: 1\.5rem;/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*\.grex-c-hero-banner \{[\s\S]*padding: 1rem;/);

  assert.equal(manager.unregisterClass("hero-banner"), true);
  assert.equal(manager.hasClass("hero-banner"), false);

  assert.throws(() => manager.registerClass("bad class!", { color: "#000" }), GrexSecurityError);
  assert.throws(
    () => manager.registerClass("unsafe-prop", { behavior: "url(xss.htc)" }),
    GrexSecurityError
  );
});

test("computeContrastRatio and auditAccessibility enforce GREX-A11Y-001 through GREX-A11Y-005", () => {
  assert.deepEqual(parseCssColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.equal(computeContrastRatio("#000000", "#ffffff"), 21);
  assert.equal(computeContrastRatio("#94a3b8", "#ffffff") < 4.5, true);

  const failingTree = {
    id: "page-root",
    type: "Section",
    styles: { base: { backgroundColor: "#ffffff" } },
    children: [
      { id: "h1-ok", type: "Heading", props: { level: 1, text: "Store" } },
      { id: "h3-skip", type: "Heading", props: { level: 3, text: "Skipped H2" } },
      {
        id: "low-contrast",
        type: "Text",
        props: { text: "Faint copy" },
        styles: { base: { color: "#94a3b8" } },
      },
      {
        id: "bad-img",
        type: "Image",
        props: { src: "/static/shirt.jpg", alt: "" },
      },
      {
        id: "unlabelled-input",
        type: "Input",
        props: { name: "email" },
      },
      {
        id: "no-focus-btn",
        type: "Button",
        props: {},
        styles: { base: { outline: "none" } },
      },
    ],
  };

  const failReport = auditAccessibility(failingTree);
  assert.equal(failReport.ok, false);
  const codes = new Set(failReport.issues.map((i) => i.code));
  assert.equal(codes.has("GREX-A11Y-001"), true);
  assert.equal(codes.has("GREX-A11Y-002"), true);
  assert.equal(codes.has("GREX-A11Y-003"), true);
  assert.equal(codes.has("GREX-A11Y-004"), true);
  assert.equal(codes.has("GREX-A11Y-005"), true);

  const passingTree = {
    id: "clean-page",
    type: "Section",
    styles: { base: { backgroundColor: "#ffffff" } },
    children: [
      { id: "h1", type: "Heading", props: { level: 1, text: "Store" } },
      { id: "h2", type: "Heading", props: { level: 2, text: "Catalog" } },
      {
        id: "good-contrast",
        type: "Text",
        props: { text: "Crisp readable copy" },
        styles: { base: { color: "#0f172a" } },
      },
      {
        id: "deco-img",
        type: "Image",
        props: { src: "/static/divider.svg", decorative: true },
      },
      {
        id: "email-input",
        type: "Input",
        props: { name: "email", label: "Email Address" },
      },
      {
        id: "buy-btn",
        type: "Button",
        props: { text: "Add to Cart" },
      },
    ],
  };

  const passReport = auditAccessibility(passingTree);
  assert.equal(passReport.ok, true);
  assert.equal(passReport.issues.length, 0);
});

test("auditDom validates rendered zero-wrapper-div Grex DOM output", () => {
  const { document } = createTestEnv();

  const cleanSection = Section(
    {
      children: [
        Heading({ props: { level: 1, text: "Welcome" } }, { document }),
        Heading({ props: { level: 2, text: "Profile" } }, { document }),
        Image({ props: { src: "/static/avatar.png", alt: "User avatar" } }, { document }),
        Input({ props: { id: "user-name", name: "name", label: "Full Name" } }, { document }),
        Button({ props: { text: "Save Profile" } }, { document }),
      ],
    },
    { document }
  );

  const cleanResult = auditDom(cleanSection.element);
  assert.equal(cleanResult.ok, true);
  assert.equal(cleanResult.issues.length, 0);
  cleanSection.dispose();

  const brokenWrap = document.createElement("main");
  const badHeading1 = document.createElement("h1");
  badHeading1.textContent = "Title";
  const badHeading4 = document.createElement("h4");
  badHeading4.textContent = "Jumped";
  const badImg = document.createElement("img");
  badImg.setAttribute("src", "/x.png");
  const badInput = document.createElement("input");
  badInput.setAttribute("type", "text");
  const emptyBtn = document.createElement("button");
  brokenWrap.appendChild(badHeading1);
  brokenWrap.appendChild(badHeading4);
  brokenWrap.appendChild(badImg);
  brokenWrap.appendChild(badInput);
  brokenWrap.appendChild(emptyBtn);

  const brokenResult = auditDom(brokenWrap);
  assert.equal(brokenResult.ok, false);
  const domCodes = new Set(brokenResult.issues.map((i) => i.code));
  assert.equal(domCodes.has("GREX-A11Y-002"), true);
  assert.equal(domCodes.has("GREX-A11Y-003"), true);
  assert.equal(domCodes.has("GREX-A11Y-004"), true);
  assert.equal(domCodes.has("GREX-A11Y-005"), true);
});

test("exportElementCatalog matches grex.elements.json (20 elements) and validateElementNode blocks invalid specs", () => {
  const catalog = exportElementCatalog();
  assert.equal(catalog.schemaVersion, "1.0.0");
  assert.equal(catalog.framework, "grex-js");
  assert.equal(catalog.elementCount, 20);
  assert.equal(Object.keys(catalog.elements).length, 20);

  const checkedIn = JSON.parse(fs.readFileSync(path.resolve("grex.elements.json"), "utf8"));
  assert.deepEqual(checkedIn, catalog);

  const validTree = {
    type: "Section",
    tag: "main",
    props: { label: "Checkout" },
    styles: {
      base: { display: "flex", gap: "1rem" },
      mobile: { padding: "1rem" },
    },
    children: [
      { type: "Heading", tag: "h1", props: { level: 1, text: "Order Summary" } },
      { type: "Text", props: { text: "19.95" } },
      { type: "Button", props: { text: "Pay Now", type: "submit" } },
    ],
  };

  assert.deepEqual(validateElementNode(validTree), { valid: true });

  const { document } = createTestEnv();
  const rendered = renderNode(validTree, { document });
  assert.equal(rendered.element.localName, "main");
  assert.equal(rendered.element.querySelectorAll("div").length, 0);
  rendered.dispose();

  assert.throws(
    () => validateElementNode({ type: "CarouselWidget", props: {} }),
    GrexSecurityError
  );
  assert.throws(
    () => validateElementNode({ type: "Section", tag: "div", props: {} }),
    GrexSecurityError
  );
  assert.throws(
    () => validateElementNode({ type: "Button", props: { hallucinatedProp: true } }),
    GrexSecurityError
  );
  assert.throws(
    () => validateElementNode({ type: "Link", props: { href: "javascript:alert(1)", text: "Click" } }),
    GrexSecurityError
  );
  assert.throws(
    () =>
      validateElementNode({
        type: "Text",
        props: { text: "Hi" },
        styles: { base: { position: "fixed" } },
      }),
    GrexSecurityError
  );
});
