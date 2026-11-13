#!/usr/bin/env python3
"""
Grex JS Milestone PDF Guide Generator
Generates a plain-English visual walkthrough HTML and publication-grade PDF
for Grex JS releases via headless Chrome.
"""

import os
import sys
import subprocess

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_OUT_DIR = os.path.join(BASE_DIR, "html")
PDF_OUT_DIR = os.path.join(BASE_DIR, "pdf")

COMMON_CSS = """
:root {
  --ink: #0f172a;
  --muted: #475569;
  --line: #cbd5e1;
  --bg-page: #f8fafc;
  --surface: #ffffff;
  --teal: #0d9488;
  --teal-soft: #ccfbf1;
  --blue: #0284c7;
  --blue-soft: #e0f2fe;
  --green: #15803d;
  --green-soft: #dcfce7;
  --amber: #b45309;
  --amber-soft: #fef3c7;
}
* { box-sizing: border-box; }
@page { size: A4; margin: 12mm 14mm 14mm 14mm; }
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink);
  background: var(--bg-page);
  line-height: 1.55;
  font-size: 13.5px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.header-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0d9488 100%);
  color: #ffffff;
  border-radius: 12px;
  padding: 24px 28px;
  margin-bottom: 18px;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.version-pill {
  background: #38bdf8;
  color: #0f172a;
  font-weight: 800;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
}
.date-tag { font-size: 11.5px; color: #cbd5e1; }
h1 { margin: 0 0 6px 0; font-size: 25px; color: #ffffff; }
.subtitle { font-size: 14.5px; color: #5eead4; font-weight: 600; margin: 0 0 10px 0; }
.lead-p { margin: 0; color: #e2e8f0; font-size: 13.5px; }
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 14px;
  page-break-inside: avoid;
}
h2 { margin: 0 0 8px 0; font-size: 16px; color: var(--ink); }
p { margin: 0 0 8px 0; color: var(--muted); }
ul { margin: 6px 0 0 0; padding-left: 18px; color: var(--muted); }
li { margin-bottom: 5px; }
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 700;
  margin-bottom: 6px;
}
.badge-teal { background: var(--teal-soft); color: #115e59; }
.badge-blue { background: var(--blue-soft); color: #075985; }
.badge-green { background: var(--green-soft); color: var(--green); }
.badge-amber { background: var(--amber-soft); color: var(--amber); }
pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 11.5px;
  overflow-x: auto;
  margin: 8px 0 0 0;
}
footer {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--muted);
}
"""

GUIDES = [
    {
        "version": "v0.1.0",
        "date": "2026-11-13",
        "title": "Grex JS v0.1.0 — Core Reactive Runtime & Zero-Wrapper-Div DOM Engine",
        "subtitle": "Plain-English Walkthrough for Store Owners, Designers & Developers",
        "lead": (
            "Grex JS v0.1.0 delivers the lightweight, zero-build-step browser engine powering Grex Builder, "
            "GrabLab CMS, and Groxy AI on top of GRAB 1.0 and Grisp. Instead of wrapping every page element in "
            "layers of slow <div> tags, Grex JS updates only the exact text, attributes, or style tokens that change."
        ),
        "sections": [
            (
                "badge-teal",
                "1. Fine-Grained Signals",
                "Surgical Browser Updates Without Rebuilding Pages",
                [
                    "signal(value) holds a single reactive value (like a product title, cart count, or price).",
                    "computed(fn) calculates derived values lazily and avoids glitchy double-updates in diamond dependency graphs.",
                    "effect(fn) updates only the exact text node or attribute affected and returns dispose() for leak-free cleanup.",
                    "batch(fn) groups multiple updates together so the browser redraws once at the end.",
                    "Exact GRAB Value Integrity (ADR-025c): Base-10 wire strings like \"19.95\" are formatted with formatGrabDecimal() using pure string math—never imprecise floating-point numbers.",
                ],
            ),
            (
                "badge-blue",
                "2. Zero-Wrapper-Div HTML",
                "Clean Semantic Markup & Selective Hydration (ADR-018)",
                [
                    "renderElement() outputs native HTML5 tags (<section>, <header>, <article>, <button>, <a>) directly with zero .grex-wrapper or .grex-inner <div> bloat.",
                    "hydrate() attaches reactivity in place to server-rendered .grab.html pages using data-grex-* attributes without tearing down existing DOM nodes.",
                    "CSS custom properties (--grex-*) and classes apply straight to the semantic tag itself.",
                ],
            ),
            (
                "badge-amber",
                "3. Strict CSP & XSS Safety",
                "Fail-Closed Browser Security (ADR-014 & ADR-017)",
                [
                    "Zero eval() and zero new Function(): runs safely under strict script-src 'self' Content-Security-Policy headers.",
                    "Text bindings always use textContent—never unsafe innerHTML.",
                    "URL attributes (href, src, action, formaction) block javascript:, data:, vbscript:, and control-character obfuscated links.",
                    "Inline on* event attributes (onclick, onerror, etc.) and dangerous tags (<script>, <iframe>, <object>) are blocked.",
                ],
            ),
            (
                "badge-green",
                "4. Fluid Grisp Sync & Bridge",
                "Instant Preview + server.asset Cache Busting (ADR-027b)",
                [
                    "GrexPreviewBridge validates exact allowedOrigins (rejecting wildcards \"*\") and patches live signals and --grex-* CSS tokens in browser memory with zero Grisp restarts.",
                    "compileTokenCss() generates clean responsive CSS (base, tablet, mobile) for /static/grex/ so Grisp Docker containers stay --read-only.",
                    "GRAB's server.asset fingerprints /static/grex/* files (?v=<12-char-sha256>) with immutable caching on match and safe no-cache fallback during rolling restarts.",
                ],
            ),
        ],
        "snippet": (
            'use server\n\n'
            'route "GET" "/"\n'
            '  set css_url to server.asset using "/static/grex/tokens.css"\n'
            '  set demo_js_url to server.asset using "/static/grex/demo.js"\n'
            '  give back server.html using "page.grab.html", record {title: "Northbound Goods", price: "19.95", css_url: css_url, demo_js_url: demo_js_url}\n'
            'end'
        ),
    }
]


def render_html(g):
    cards = []
    for badge_cls, badge_txt, title, bullets in g["sections"]:
        li_html = "\n".join(f"      <li>{b}</li>" for b in bullets)
        cards.append(
            f"""  <section class="card">
    <span class="badge {badge_cls}">{badge_txt}</span>
    <h2>{title}</h2>
    <ul>
{li_html}
    </ul>
  </section>"""
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{g["title"]}</title>
  <style>{COMMON_CSS}</style>
</head>
<body>
  <header class="header-hero">
    <div class="header-top">
      <span class="version-pill">Grex JS {g["version"]}</span>
      <span class="date-tag">Released {g["date"]} · urbanspress/grex-js</span>
    </div>
    <h1>{g["title"]}</h1>
    <p class="subtitle">{g["subtitle"]}</p>
    <p class="lead-p">{g["lead"]}</p>
  </header>

  <main class="grid-2">
{chr(10).join(cards)}
  </main>

  <section class="card">
    <span class="badge badge-teal">GRAB 1.0 + Grisp Integration Example</span>
    <h2>Zero-Restart Static Fingerprinting with <code>server.asset</code></h2>
    <p>Grisp serves compiled stylesheets and Grex JS modules from <code>/static/grex/</code> with automatic SHA-256 <code>?v=</code> cache-busting:</p>
    <pre>{g["snippet"]}</pre>
  </section>

  <footer>
    <span>Grex JS — Reactive Frontend Runtime for GRAB &amp; Grisp</span>
    <span>Verified Release Guide · {g["version"]} · MIT License</span>
  </footer>
</body>
</html>
"""


def main():
    os.makedirs(HTML_OUT_DIR, exist_ok=True)
    os.makedirs(PDF_OUT_DIR, exist_ok=True)

    if not os.path.exists(CHROME_PATH):
        print(f"Error: Chrome executable not found at {CHROME_PATH}", file=sys.stderr)
        sys.exit(1)

    for g in GUIDES:
        ver = g["version"]
        html_path = os.path.join(HTML_OUT_DIR, f"GREX-JS-{ver}-Guide.html")
        pdf_path = os.path.join(PDF_OUT_DIR, f"GREX-JS-{ver}-Guide.pdf")

        with open(html_path, "w", encoding="utf-8") as f:
            f.write(render_html(g))
        print(f"[HTML] Wrote {html_path}")

        cmd = [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            f"file:///{html_path}",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"[ERROR] Chrome PDF failed: {res.stderr}", file=sys.stderr)
            sys.exit(res.returncode)

        size_kb = os.path.getsize(pdf_path) / 1024
        print(f"[PDF]  Generated {pdf_path} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
