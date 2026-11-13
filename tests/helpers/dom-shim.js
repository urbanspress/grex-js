/**
 * Minimal zero-dependency DOM & Window shim for Node unit/DOM/security tests.
 * Tracks node identity, textContent, innerHTML (throws/tracks if ever touched),
 * attributes, CSSStyleDeclaration, EventTarget, and postMessage.
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

  get firstChild() {
    return this.childNodes[0] || null;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
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
    const set = this._listeners.get(event.type);
    if (!set) {
      return true;
    }
    for (const fn of Array.from(set)) {
      fn(event);
    }
    return true;
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
  }

  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }

  setAttribute(name, value) {
    this._attrs.set(String(name), String(value));
  }

  getAttribute(name) {
    return this._attrs.has(String(name)) ? this._attrs.get(String(name)) : null;
  }

  removeAttribute(name) {
    this._attrs.delete(String(name));
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
    const results = [];
    const matchFn = compileSimpleSelector(selector);
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (matchFn(child)) {
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
  const attrMatch = /^\[([a-z0-9_-]+)="([^"]*)"\]$/i.exec(s);
  if (attrMatch) {
    const [, attrName, attrVal] = attrMatch;
    return (el) => el.getAttribute(attrName) === attrVal;
  }
  const tag = s.toLowerCase();
  return (el) => el.localName === tag;
}

export function createTestEnv() {
  const doc = {
    createElement(tag) {
      return new ElementShim(tag, doc);
    },
    createElementNS(ns, tag) {
      return new ElementShim(tag, doc, ns);
    },
    createTextNode(text) {
      return new TextShim(text, doc);
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
