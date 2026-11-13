import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as bundle from "../dist/grex-js-v0.2.0.min.js";
import * as exampleBundle from "../examples/grisp-basic/public/grex/grex.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("release bundle exports full v0.2 API and contains zero eval()/new Function()/.innerHTML", () => {
  for (const relPath of [
    "dist/grex-js-v0.2.0.js",
    "dist/grex-js-v0.2.0.min.js",
    "examples/grisp-basic/public/grex/grex.js",
  ]) {
    const raw = fs.readFileSync(path.resolve(relPath), "utf8");
    const codeOnly = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/\beval\s*\(/.test(codeOnly), false, `Found eval() in ${relPath}`);
    assert.equal(/\bnew\s+Function\s*\(/.test(codeOnly), false, `Found new Function() in ${relPath}`);
    assert.equal(/\.innerHTML\b/.test(codeOnly), false, `Found .innerHTML in ${relPath}`);
  }

  for (const api of [bundle, exampleBundle]) {
    const { document } = createTestEnv();
    const price = api.signal("19.95");
    const card = api.Card(
      {
        children: [
          api.Heading({ props: { level: 2, text: "Test Card" } }, { document }).element,
          api.Text(
            { props: { text: () => api.formatGrabDecimal(price.get(), { prefix: "$", decimals: 2 }) } },
            { document }
          ).element,
        ],
      },
      { document }
    );
    assert.equal(card.element.localName, "article");
    assert.equal(card.element.querySelectorAll("div").length, 0);
    assert.equal(card.element.querySelector("p").textContent, "$19.95");
    price.set("25.50");
    assert.equal(card.element.querySelector("p").textContent, "$25.50");
    card.dispose();
  }
});

test("Grisp example page.grab.html and tokens.css enforce zero-wrapper-div and /static/grex/ conventions", () => {
  const html = fs.readFileSync(path.resolve("examples/grisp-basic/page.grab.html"), "utf8");
  assert.equal(/<div\b/i.test(html), false, "Example template must contain zero <div> elements");
  assert.match(html, /data-grex-id="hero-title"/);
  assert.match(html, /data-grex-id="catalog-grid"/);
  assert.match(html, /\{css_url\}/);
  assert.match(html, /\{demo_js_url\}/);

  const grabApp = fs.readFileSync(path.resolve("examples/grisp-basic/app.grab"), "utf8");
  assert.match(grabApp, /server\.asset using "\/static\/grex\/tokens\.css"/);
  assert.match(grabApp, /server\.asset using "\/static\/grex\/demo\.js"/);

  const css = fs.readFileSync(path.resolve("examples/grisp-basic/public/grex/tokens.css"), "utf8");
  assert.match(css, /--grex-accent:/);
  assert.match(css, /\.grex-el-catalog-grid \{/);
  assert.match(css, /@media \(max-width: 640px\)/);
});
