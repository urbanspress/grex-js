/**
 * Minimal zero-dependency DOM & Window shim for Node unit/DOM/security/a11y tests.
 * Tracks node identity, textContent, innerHTML (throws/tracks if ever touched),
 * attributes, CSSStyleDeclaration, EventTarget, form/dialog controls, focus, and postMessage.
 */

class StyleShim {
  constructor() {
    this._props = new Map();
  }
  setProperty(name, value) {
    this._props.set(String(name), String(value));
  }
  getPropertyValue(name) {
    return this._props.get(String(name)) || "";
  }
  removeProperty(name) {
    const prev = this._props.get(String(name)) || "";
    this._props.delete(String(name));
    return prev;
  }
}

class NodeShim {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._listeners = new Map();
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get nextSibling() {
    if (!this.parentNode) {
      return null;
    }
    const idx = this.parentNode.childNodes.indexOf(this);
    if (idx === -1 || idx + 1 >= this.parentNode.childNodes.length) {
      return null;
    }
    return this.parentNode.childNodes[idx + 1];
  }

  appendChild(child) {
    if (child.parentNode) {
      const idx = child.parentNode.childNodes.indexOf(child);
      if (idx !== -1) {
        child.parentNode.childNodes.splice(idx, 1);
      }
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    if (!refChild) {
      return this.appendChild(newChild);
    }
    if (newChild === refChild) {
      return newChild;
    }
    if (newChild.parentNode) {
      const oldIdx = newChild.parentNode.childNodes.indexOf(newChild);
      if (oldIdx !== -1) {
        newChild.parentNode.childNodes.splice(oldIdx, 1);
      }
    }
    const refIdx = this.childNodes.indexOf(refChild);
    if (refIdx === -1) {
      return this.appendChild(newChild);
    }
    newChild.parentNode = this;
    this.childNodes.splice(refIdx, 0, newChild);
    return newChild;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    const set = this._listeners.get(type);
    if (set) {
      set.delete(fn);
    }
  }

  dispatchEvent(event) {
    const ev = event && typeof event === "object" ? event : { type: String(event) };
    if (!ev.target) {
      ev.target = this;
    }
    ev.currentTarget = this;
    if (typeof ev.preventDefault !== "function") {
      ev.defaultPrevented = false;
      ev.preventDefault = () => {
        ev.defaultPrevented = true;
      };
    }
    const set = this._listeners.get(ev.type);
    if (!set) {
      return !ev.defaultPrevented;
    }
    for (const fn of Array.from(set)) {
      fn(ev);
    }
    return !ev.defaultPrevented;
  }

  listenerCount(type) {
    const set = this._listeners.get(type);
    return set ? set.size : 0;
  }
}

class TextShim extends NodeShim {
  constructor(text, ownerDocument) {
    super(3, ownerDocument);
    this.nodeValue = String(text);
  }
  get textContent() {
    return this.nodeValue;
  }
  set textContent(val) {
    this.nodeValue = String(val);
  }
}

class ElementShim extends NodeShim {
  constructor(tagName, ownerDocument, namespaceURI = "http://www.w3.org/1999/xhtml") {
    super(1, ownerDocument);
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.namespaceURI = namespaceURI;
    this._attrs = new Map();
    this.style = new StyleShim();
    this.innerHTMLWriteCount = 0;
    this._value = "";
    this._open = false;
    this.showModalCount = 0;
    this.closeCount = 0;
  }

  get children() {
    return this.childNodes.filter((c) => c.nodeType === 1);
  }

  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }

  get value() {
    if (this.localName === "select") {
      if (this._value !== "") {
        return this._value;
      }
      const firstOpt = this.querySelector("option");
      return firstOpt ? (firstOpt.getAttribute("value") ?? firstOpt.textContent) : "";
    }
    return this._value;
  }

  set value(v) {
    this._value = v == null ? "" : String(v);
  }

  get open() {
    return this._open || this.hasAttribute("open");
  }

  set open(val) {
    this._open = Boolean(val);
    if (this._open) {
      this._attrs.set("open", "");
    } else {
      this._attrs.delete("open");
    }
  }

  showModal() {
    this.showModalCount += 1;
    this.open = true;
  }

  close() {
    this.closeCount += 1;
    this.open = false;
    this.dispatchEvent({ type: "close" });
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  setAttribute(name, value) {
    const k = String(name);
    const v = String(value);
    this._attrs.set(k, v);
    if (k === "value") {
      this._value = v;
    } else if (k === "open") {
      this._open = true;
    }
  }

  getAttribute(name) {
    return this._attrs.has(String(name)) ? this._attrs.get(String(name)) : null;
  }

  removeAttribute(name) {
    const k = String(name);
    this._attrs.delete(k);
    if (k === "open") {
      this._open = false;
    }
  }

  hasAttribute(name) {
    return this._attrs.has(String(name));
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  set textContent(val) {
    this.childNodes = [];
    if (val !== "") {
      this.appendChild(new TextShim(String(val), this.ownerDocument));
    }
  }

  get innerHTML() {
    return this.childNodes
      .map((c) => {
        if (c.nodeType === 3) {
          return c.nodeValue;
        }
        const attrs = Array.from(c._attrs.entries())
          .map(([k, v]) => ` ${k}="${v}"`)
          .join("");
        return `<${c.localName}${attrs}>${c.innerHTML}</${c.localName}>`;
      })
      .join("");
  }

  set innerHTML(_val) {
    this.innerHTMLWriteCount += 1;
    throw new Error("Unsafe innerHTML write detected in Grex JS test shim!");
  }

  querySelectorAll(selector) {
    const parts = selector.split(",").map((s) => compileSimpleSelector(s));
    const results = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (parts.some((fn) => fn(child))) {
            results.push(child);
          }
          walk(child);
        }
      }
    };
    walk(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function compileSimpleSelector(selector) {
  const s = selector.trim();
  if (s === "*") {
    return () => true;
  }
  const tagAttrMatch = /^([a-z0-9_-]+)?\[([a-z0-9_-]+)(?:="([^"]*)")?\](?::not\(\[([a-z0-9_-]+)\]\))?$/i.exec(s);
  if (tagAttrMatch) {
    const [, tag, attrName, attrVal, notAttr] = tagAttrMatch;
    return (el) => {
      if (tag && el.localName !== tag.toLowerCase()) return false;
      if (attrVal !== undefined) {
        if (el.getAttribute(attrName) !== attrVal) return false;
      } else if (!el.hasAttribute(attrName)) {
        return false;
      }
      if (notAttr && el.hasAttribute(notAttr)) return false;
      return true;
    };
  }
  const tagNotMatch = /^([a-z0-9_-]+):not\(\[([a-z0-9_-]+)\]\)$/i.exec(s);
  if (tagNotMatch) {
    const [, tag, notAttr] = tagNotMatch;
    return (el) => el.localName === tag.toLowerCase() && !el.hasAttribute(notAttr);
  }
  const idMatch = /^#([a-z0-9_-]+)$/i.exec(s);
  if (idMatch) {
    const id = idMatch[1];
    return (el) => el.getAttribute("id") === id;
  }
  const tag = s.toLowerCase();
  return (el) => el.localName === tag;
}

export function createTestEnv() {
  const doc = {
    activeElement: null,
    createElement(tag) {
      return new ElementShim(tag, doc);
    },
    createElementNS(ns, tag) {
      return new ElementShim(tag, doc, ns);
    },
    createTextNode(text) {
      return new TextShim(text, doc);
    },
    getElementById(id) {
      return doc.querySelector(`[id="${id}"]`);
    },
    documentElement: null,
    querySelectorAll(selector) {
      return doc.documentElement ? doc.documentElement.querySelectorAll(selector) : [];
    },
    querySelector(selector) {
      return doc.documentElement ? doc.documentElement.querySelector(selector) : null;
    },
  };
  doc.documentElement = new ElementShim("html", doc);
  const body = new ElementShim("body", doc);
  doc.documentElement.appendChild(body);
  doc.body = body;

  const winListeners = new Map();
  const win = {
    document: doc,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) {
        winListeners.set(type, new Set());
      }
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = winListeners.get(type);
      if (set) {
        set.delete(fn);
      }
    },
    listenerCount(type) {
      const set = winListeners.get(type);
      return set ? set.size : 0;
    },
    postMessage(data, origin) {
      const event = { type: "message", data, origin };
      const set = winListeners.get("message");
      if (set) {
        for (const fn of Array.from(set)) {
          fn(event);
        }
      }
    },
  };

  return { document: doc, window: win, body };
}
