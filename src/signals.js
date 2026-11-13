/**
 * Grex JS v0.1 Fine-Grained Reactive Engine & Exact GRAB Value Integrity.
 * Zero external dependencies, zero eval()/new Function(), deterministic disposal.
 */

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;

let activeObserver = null;
let batchDepth = 0;
let isFlushing = false;
const pendingEffects = new Set();

function cleanupObserverSources(observer) {
  for (const source of observer.sources) {
    source.subscribers.delete(observer);
  }
  observer.sources.clear();
}

function trackSource(source) {
  if (!activeObserver || activeObserver.disposed) {
    return;
  }
  if (!activeObserver.sources.has(source)) {
    activeObserver.sources.add(source);
    source.subscribers.add(activeObserver);
  }
}

function notifyDownstream(source, nextState) {
  for (const sub of source.subscribers) {
    if (sub.disposed) {
      continue;
    }
    if (sub.kind === "effect") {
      if (sub.state < nextState) {
        sub.state = nextState;
      }
      pendingEffects.add(sub);
    } else if (sub.kind === "computed") {
      const prevState = sub.state;
      if (prevState < nextState) {
        sub.state = nextState;
      }
      if (prevState === CLEAN) {
        notifyDownstream(sub, CHECK);
      }
    }
  }
}

function flushEffects() {
  if (batchDepth > 0 || isFlushing) {
    return;
  }
  isFlushing = true;
  let guard = 0;
  try {
    while (pendingEffects.size > 0) {
      if (++guard > 10000) {
        pendingEffects.clear();
        throw new Error("Grex reactive cycle detected: effect triggered more than 10,000 iterations.");
      }
      const queue = Array.from(pendingEffects);
      pendingEffects.clear();
      for (const eff of queue) {
        if (!eff.disposed && shouldUpdate(eff)) {
          runEffect(eff);
        }
      }
    }
  } finally {
    isFlushing = false;
  }
}

function shouldUpdate(node) {
  if (node.state === CLEAN) {
    return false;
  }
  if (node.state === DIRTY) {
    return true;
  }
  for (const source of node.sources) {
    if (source.kind === "computed") {
      evaluateComputed(source);
      if (node.state === DIRTY) {
        return true;
      }
    }
  }
  node.state = CLEAN;
  return false;
}

function evaluateComputed(comp) {
  if (comp.disposed) {
    return comp.value;
  }
  if (comp.state === CLEAN) {
    return comp.value;
  }
  if (!shouldUpdate(comp)) {
    return comp.value;
  }

  const prevObserver = activeObserver;
  cleanupObserverSources(comp);
  activeObserver = comp;
  let nextValue;
  try {
    nextValue = comp.fn();
  } finally {
    activeObserver = prevObserver;
  }

  const changed = !comp.initialized || !Object.is(comp.value, nextValue);
  comp.value = nextValue;
  comp.initialized = true;
  comp.state = CLEAN;

  if (changed) {
    for (const sub of comp.subscribers) {
      if (!sub.disposed && sub.state < DIRTY) {
        sub.state = DIRTY;
      }
    }
  }
  return comp.value;
}

function runEffect(eff) {
  if (eff.disposed) {
    return;
  }
  if (typeof eff.cleanup === "function") {
    const fn = eff.cleanup;
    eff.cleanup = null;
    fn();
  }
  cleanupObserverSources(eff);
  eff.state = CLEAN;

  const prevObserver = activeObserver;
  activeObserver = eff;
  try {
    const maybeCleanup = eff.fn();
    eff.cleanup = typeof maybeCleanup === "function" ? maybeCleanup : null;
  } finally {
    activeObserver = prevObserver;
  }
}

/**
 * Create a reactive signal holding a single value.
 * @template T
 * @param {T} initialValue
 * @returns {{ get(): T, set(nextValue: T | ((prev: T) => T)): T, peek(): T }}
 */
export function signal(initialValue) {
  const node = {
    kind: "signal",
    value: initialValue,
    subscribers: new Set(),
    disposed: false,
  };

  return {
    get() {
      trackSource(node);
      return node.value;
    },
    peek() {
      return node.value;
    },
    set(nextValue) {
      const resolved = typeof nextValue === "function" ? nextValue(node.value) : nextValue;
      if (Object.is(node.value, resolved)) {
        return node.value;
      }
      node.value = resolved;
      notifyDownstream(node, DIRTY);
      flushEffects();
      return node.value;
    },
  };
}

/**
 * Create a lazy, memoized derived signal.
 * @template T
 * @param {() => T} fn
 * @returns {{ get(): T, peek(): T, dispose(): void }}
 */
export function computed(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("computed(fn) requires a function.");
  }

  const node = {
    kind: "computed",
    fn,
    value: undefined,
    initialized: false,
    state: DIRTY,
    sources: new Set(),
    subscribers: new Set(),
    disposed: false,
  };

  return {
    get() {
      if (node.disposed) {
        return node.value;
      }
      evaluateComputed(node);
      trackSource(node);
      return node.value;
    },
    peek() {
      if (node.disposed) {
        return node.value;
      }
      return evaluateComputed(node);
    },
    dispose() {
      if (node.disposed) {
        return;
      }
      node.disposed = true;
      cleanupObserverSources(node);
      node.subscribers.clear();
    },
  };
}

/**
 * Run a reactive side effect immediately and re-run when tracked signals change.
 * @param {() => (void | (() => void))} fn
 * @returns {() => void} dispose callback
 */
export function effect(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("effect(fn) requires a function.");
  }

  const eff = {
    kind: "effect",
    fn,
    cleanup: null,
    state: DIRTY,
    sources: new Set(),
    disposed: false,
  };

  runEffect(eff);

  return function dispose() {
    if (eff.disposed) {
      return;
    }
    eff.disposed = true;
    pendingEffects.delete(eff);
    cleanupObserverSources(eff);
    if (typeof eff.cleanup === "function") {
      const cleanupFn = eff.cleanup;
      eff.cleanup = null;
      cleanupFn();
    }
  };
}

/**
 * Coalesce multiple signal updates so downstream effects run once at the end.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function batch(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("batch(fn) requires a function.");
  }
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) {
      flushEffects();
    }
  }
}

/**
 * Execute a function without tracking any signal reads inside the current observer.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function untrack(fn) {
  if (typeof fn !== "function") {
    throw new TypeError("untrack(fn) requires a function.");
  }
  const prevObserver = activeObserver;
  activeObserver = null;
  try {
    return fn();
  } finally {
    activeObserver = prevObserver;
  }
}

/**
 * Check whether a value is an exact GRAB base-10 integer or decimal wire string.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isExactGrabWireString(value) {
  return typeof value === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
}

/**
 * Format a GRAB base-10 integer or decimal wire string (e.g. "19.95") for display
 * using pure string manipulation—never coercing to IEEE-754 floating-point math.
 *
 * @param {string | number} value
 * @param {{ prefix?: string, suffix?: string, decimals?: number | null, groupSeparator?: string }} [options]
 * @returns {string}
 */
export function formatGrabDecimal(value, options = {}) {
  const {
    prefix = "",
    suffix = "",
    decimals = null,
    groupSeparator = ",",
  } = options;

  const raw = typeof value === "string" ? value.trim() : String(value);
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    throw new TypeError(`Expected exact base-10 decimal string, received: ${String(value)}`);
  }

  const sign = match[1] === "-" ? "-" : "";
  let intPart = match[2].replace(/^0+(?=\d)/, "");
  let fracPart = match[3] || "";

  if (typeof decimals === "number" && Number.isInteger(decimals) && decimals >= 0) {
    if (fracPart.length < decimals) {
      fracPart = fracPart.padEnd(decimals, "0");
    } else if (fracPart.length > decimals) {
      fracPart = fracPart.slice(0, decimals);
    }
  }

  if (groupSeparator) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  }

  const numeric = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  return `${sign}${prefix}${numeric}${suffix}`;
}
