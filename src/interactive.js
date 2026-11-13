/**
 * Grex JS v0.3 Zero-Wrapper-Div Interactive & Form Components + Keyed Repeaters (ForEach).
 * 7 semantic components: Form, Input, Select, Tabs, Accordion, Modal, Nav + ForEach.
 */

import { effect, signal } from "./signals.js";
import { GrexSecurityError, isSafeUrl, sanitizeAttributeValue, setSafeText } from "./security.js";
import { bindElement, renderElement } from "./dom.js";
import {
  appendChildren,
  buildBaseSpec,
  isReactive,
  readVal,
  registerElementType,
  renderNode,
} from "./elements.js";

let interactiveIdSeq = 0;

function nextInteractiveId(prefix) {
  interactiveIdSeq += 1;
  return `${prefix}-${interactiveIdSeq}`;
}

function getDoc(options) {
  const doc = (options && options.document) || globalThis.document;
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("Grex interactive element requires a DOM document.");
  }
  return doc;
}

function collectFormValues(formEl) {
  const data = {};
  const controls = formEl.querySelectorAll("input, select, textarea");
  for (const ctrl of controls) {
    const name = ctrl.getAttribute("name");
    if (!name) {
      continue;
    }
    data[name] = ctrl.value;
  }
  return data;
}

// --- 1. Form (<form>) ---

export function Form(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  if (config.tag && config.tag.toLowerCase() !== "form") {
    throw new GrexSecurityError(`Form must render <form>; received "${config.tag}".`);
  }

  const base = buildBaseSpec("grex-form", config);
  const method = props.method === undefined ? "post" : String(props.method).trim().toLowerCase();
  if (method !== "post" && method !== "get") {
    throw new GrexSecurityError(`Invalid Form method "${method}"; expected "post" or "get".`);
  }
  base.attrs.method = method;

  if (props.action !== undefined) {
    base.attrs.action = props.action;
  }

  const submitting = isReactive(props.submitting) ? props.submitting : signal(false);
  const error = isReactive(props.error) ? props.error : signal(null);
  const submitted = isReactive(props.submitted) ? props.submitted : signal(false);
  const csrfHeader = props.csrfHeader || "X-CSRF-Token";

  base.attrs["aria-busy"] = () => (submitting.get() ? "true" : "false");

  const formEl = doc.createElement("form");
  const disposers = [];
  const binding = bindElement(formEl, base);
  disposers.push(binding.dispose);

  let csrfHiddenInput = null;
  if (props.csrfField) {
    const fieldName = sanitizeAttributeValue("name", props.csrfField);
    csrfHiddenInput = doc.createElement("input");
    csrfHiddenInput.setAttribute("type", "hidden");
    csrfHiddenInput.setAttribute("name", fieldName);
    formEl.appendChild(csrfHiddenInput);

    if (props.csrfToken !== undefined) {
      if (isReactive(props.csrfToken) || typeof props.csrfToken === "function") {
        disposers.push(
          effect(() => {
            const tok = String(readVal(props.csrfToken) ?? "");
            csrfHiddenInput.setAttribute("value", tok);
            csrfHiddenInput.value = tok;
          })
        );
      } else {
        const tok = String(props.csrfToken ?? "");
        csrfHiddenInput.setAttribute("value", tok);
        csrfHiddenInput.value = tok;
      }
    }
  }

  appendChildren(formEl, config.children, doc, disposers);

  const onSubmitHandler = async (event) => {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (submitting.peek()) {
      return;
    }

    const tokenVal = props.csrfToken !== undefined ? readVal(props.csrfToken) : undefined;
    if (method === "post" && props.requireCsrf !== false && props.csrfToken !== undefined && !tokenVal) {
      error.set("Missing CSRF token.");
      return;
    }

    submitting.set(true);
    error.set(null);
    try {
      if (csrfHiddenInput && tokenVal !== undefined) {
        csrfHiddenInput.setAttribute("value", String(tokenVal));
        csrfHiddenInput.value = String(tokenVal);
      }
      if (typeof props.onSubmit === "function") {
        await props.onSubmit({
          event,
          form: formEl,
          values: collectFormValues(formEl),
          csrfToken: tokenVal,
          csrfHeader,
        });
      }
      submitted.set(true);
    } catch (err) {
      error.set(err && err.message ? err.message : String(err));
    } finally {
      submitting.set(false);
    }
  };

  formEl.addEventListener("submit", onSubmitHandler);

  return {
    element: formEl,
    submitting,
    error,
    submitted,
    dispose() {
      formEl.removeEventListener("submit", onSubmitHandler);
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 2. Input (<label> + <input>/<textarea> + <small role="alert">) ---

const ALLOWED_INPUT_TYPES = new Set([
  "text",
  "email",
  "password",
  "search",
  "tel",
  "url",
  "number",
  "hidden",
  "textarea",
]);

function validateInputRules(val, props) {
  const str = val == null ? "" : String(val);

  if (props.required && str.trim() === "") {
    return typeof props.required === "string" ? props.required : "This field is required.";
  }
  if (str !== "") {
    if (props.grabType === "GrabInteger" && !/^[+-]?\d+$/.test(str.trim())) {
      return "Must be an exact whole integer.";
    }
    if (props.grabType === "GrabDecimal" && !/^[+-]?\d+(?:\.\d+)?$/.test(str.trim())) {
      return "Must be an exact base-10 decimal value.";
    }
    if (typeof props.minLength === "number" && str.length < props.minLength) {
      return `Must be at least ${props.minLength} characters.`;
    }
    if (typeof props.maxLength === "number" && str.length > props.maxLength) {
      return `Must be at most ${props.maxLength} characters.`;
    }
    if (props.pattern) {
      const rx = props.pattern instanceof RegExp ? props.pattern : new RegExp(props.pattern);
      if (!rx.test(str)) {
        return props.patternMessage || "Invalid format.";
      }
    }
  }
  if (typeof props.validate === "function") {
    const customErr = props.validate(str);
    if (customErr) {
      return String(customErr);
    }
  }
  return null;
}

export function Input(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  const inputType = props.type === undefined ? "text" : String(props.type).trim().toLowerCase();
  if (!ALLOWED_INPUT_TYPES.has(inputType)) {
    throw new GrexSecurityError(`Disallowed Input type "${inputType}".`);
  }

  const controlId = props.inputId || (config.id ? `${config.id}-input` : nextInteractiveId("grex-input"));
  const errorId = `${controlId}-error`;
  const valueSignal = isReactive(props.value) ? props.value : signal(props.value == null ? "" : String(props.value));
  const errorSignal = isReactive(props.error) ? props.error : signal(null);

  const isTextarea = inputType === "textarea";
  const controlEl = doc.createElement(isTextarea ? "textarea" : "input");
  controlEl.setAttribute("id", controlId);
  if (!isTextarea) {
    controlEl.setAttribute("type", inputType);
  }
  if (props.name != null) {
    controlEl.setAttribute("name", sanitizeAttributeValue("name", props.name));
  }
  if (props.placeholder != null) {
    controlEl.setAttribute("placeholder", String(props.placeholder));
  }
  if (props.required) {
    controlEl.setAttribute("required", "");
  }
  if (props.disabled) {
    controlEl.setAttribute("disabled", "");
  }
  if (props.grabType === "GrabDecimal") {
    controlEl.setAttribute("inputmode", "decimal");
  } else if (props.grabType === "GrabInteger") {
    controlEl.setAttribute("inputmode", "numeric");
  } else if (props.inputMode) {
    controlEl.setAttribute("inputmode", String(props.inputMode));
  }
  if (props.bare && props.label != null) {
    controlEl.setAttribute("aria-label", String(props.label));
  }

  const disposers = [];
  const base = buildBaseSpec(props.bare ? "grex-input" : "grex-field", config);

  const errorEl = doc.createElement("small");
  errorEl.setAttribute("id", errorId);
  errorEl.setAttribute("role", "alert");
  errorEl.setAttribute("hidden", "");

  const runValidation = (currentVal) => {
    const errMsg = validateInputRules(currentVal, props);
    errorSignal.set(errMsg);
    if (errMsg) {
      controlEl.setAttribute("aria-invalid", "true");
      controlEl.setAttribute("aria-describedby", errorId);
      errorEl.removeAttribute("hidden");
      setSafeText(errorEl, errMsg);
    } else {
      controlEl.removeAttribute("aria-invalid");
      controlEl.removeAttribute("aria-describedby");
      errorEl.setAttribute("hidden", "");
      setSafeText(errorEl, "");
    }
    return errMsg === null;
  };

  disposers.push(
    effect(() => {
      const nextStr = valueSignal.get() == null ? "" : String(valueSignal.get());
      controlEl.value = nextStr;
      controlEl.setAttribute("value", nextStr);
      if (isTextarea) {
        setSafeText(controlEl, nextStr);
      }
    })
  );

  const onInput = (ev) => {
    const raw = ev && ev.target && typeof ev.target.value === "string" ? ev.target.value : controlEl.value;
    valueSignal.set(String(raw));
    if (errorSignal.peek() !== null || props.validateOnInput) {
      runValidation(raw);
    }
  };

  const onBlur = () => {
    runValidation(controlEl.value);
  };

  controlEl.addEventListener("input", onInput);
  controlEl.addEventListener("blur", onBlur);

  if (props.bare) {
    const bound = bindElement(controlEl, base);
    disposers.push(bound.dispose);
    return {
      element: controlEl,
      input: controlEl,
      value: valueSignal,
      error: errorSignal,
      validate: () => runValidation(controlEl.value),
      dispose() {
        controlEl.removeEventListener("input", onInput);
        controlEl.removeEventListener("blur", onBlur);
        for (const fn of disposers) {
          fn();
        }
        disposers.length = 0;
      },
    };
  }

  const labelEl = doc.createElement("label");
  labelEl.setAttribute("for", controlId);
  const bound = bindElement(labelEl, base);
  disposers.push(bound.dispose);

  if (props.label != null) {
    const caption = doc.createElement("span");
    caption.setAttribute("class", "grex-label");
    setSafeText(caption, props.label);
    labelEl.appendChild(caption);
  }
  labelEl.appendChild(controlEl);
  labelEl.appendChild(errorEl);

  return {
    element: labelEl,
    input: controlEl,
    value: valueSignal,
    error: errorSignal,
    validate: () => runValidation(controlEl.value),
    dispose() {
      controlEl.removeEventListener("input", onInput);
      controlEl.removeEventListener("blur", onBlur);
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 3. Select (<label> + <select> + <option>/<optgroup>) ---

function appendSelectOptions(selectEl, items, doc) {
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (typeof item.group === "string" && Array.isArray(item.options)) {
      const groupEl = doc.createElement("optgroup");
      groupEl.setAttribute("label", item.group);
      appendSelectOptions(groupEl, item.options, doc);
      selectEl.appendChild(groupEl);
    } else {
      const optEl = doc.createElement("option");
      const valStr = item.value == null ? "" : String(item.value);
      optEl.setAttribute("value", valStr);
      if (item.disabled) {
        optEl.setAttribute("disabled", "");
      }
      setSafeText(optEl, item.label == null ? valStr : item.label);
      selectEl.appendChild(optEl);
    }
  }
}

export function Select(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  const controlId = props.selectId || (config.id ? `${config.id}-select` : nextInteractiveId("grex-select"));
  const valueSignal = isReactive(props.value) ? props.value : signal(props.value == null ? "" : String(props.value));

  const selectEl = doc.createElement("select");
  selectEl.setAttribute("id", controlId);
  if (props.name != null) {
    selectEl.setAttribute("name", sanitizeAttributeValue("name", props.name));
  }
  if (props.required) {
    selectEl.setAttribute("required", "");
  }
  if (props.disabled) {
    selectEl.setAttribute("disabled", "");
  }
  if (props.bare && props.label != null) {
    selectEl.setAttribute("aria-label", String(props.label));
  }

  const disposers = [];
  const renderOpts = () => {
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
    const list = readVal(props.options) || [];
    appendSelectOptions(selectEl, list, doc);
    selectEl.value = String(valueSignal.peek() ?? "");
  };

  if (isReactive(props.options) || typeof props.options === "function") {
    disposers.push(effect(renderOpts));
  } else {
    renderOpts();
  }

  disposers.push(
    effect(() => {
      selectEl.value = String(valueSignal.get() ?? "");
    })
  );

  const onChange = (ev) => {
    const nextVal = ev && ev.target && typeof ev.target.value === "string" ? ev.target.value : selectEl.value;
    valueSignal.set(String(nextVal));
  };
  selectEl.addEventListener("change", onChange);

  const base = buildBaseSpec(props.bare ? "grex-select" : "grex-field", config);

  if (props.bare) {
    const bound = bindElement(selectEl, base);
    disposers.push(bound.dispose);
    return {
      element: selectEl,
      select: selectEl,
      value: valueSignal,
      dispose() {
        selectEl.removeEventListener("change", onChange);
        for (const fn of disposers) {
          fn();
        }
        disposers.length = 0;
      },
    };
  }

  const labelEl = doc.createElement("label");
  labelEl.setAttribute("for", controlId);
  const bound = bindElement(labelEl, base);
  disposers.push(bound.dispose);

  if (props.label != null) {
    const caption = doc.createElement("span");
    caption.setAttribute("class", "grex-label");
    setSafeText(caption, props.label);
    labelEl.appendChild(caption);
  }
  labelEl.appendChild(selectEl);

  return {
    element: labelEl,
    select: selectEl,
    value: valueSignal,
    dispose() {
      selectEl.removeEventListener("change", onChange);
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 4. Tabs (role="tablist", role="tab", role="tabpanel") ---

export function Tabs(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  const tabs = Array.isArray(props.tabs) ? props.tabs : [];
  if (tabs.length === 0) {
    throw new GrexSecurityError("Tabs requires at least one tab item.");
  }

  const activeId = isReactive(props.activeId) ? props.activeId : signal(props.activeId ?? tabs[0].id);
  const prefix = config.id || nextInteractiveId("grex-tabs");

  const sectionEl = doc.createElement("section");
  const disposers = [];
  const base = buildBaseSpec("grex-tabs", config);
  const bound = bindElement(sectionEl, base);
  disposers.push(bound.dispose);

  const tablistEl = doc.createElement("nav");
  tablistEl.setAttribute("role", "tablist");
  if (props.label != null) {
    tablistEl.setAttribute("aria-label", String(props.label));
  }
  sectionEl.appendChild(tablistEl);

  const tabButtons = [];
  const tabPanels = [];
  const clickHandlers = [];

  for (const tab of tabs) {
    const tabId = `${prefix}-tab-${tab.id}`;
    const panelId = `${prefix}-panel-${tab.id}`;

    const btn = doc.createElement("button");
    btn.setAttribute("type", "button");
    btn.setAttribute("role", "tab");
    btn.setAttribute("id", tabId);
    btn.setAttribute("aria-controls", panelId);
    setSafeText(btn, tab.label);
    const onClick = () => activeId.set(tab.id);
    btn.addEventListener("click", onClick);
    clickHandlers.push([btn, onClick]);
    tablistEl.appendChild(btn);
    tabButtons.push({ id: tab.id, el: btn });

    const panel = doc.createElement("section");
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("id", panelId);
    panel.setAttribute("aria-labelledby", tabId);
    panel.setAttribute("tabindex", "0");
    if (tab.content !== undefined) {
      appendChildren(panel, Array.isArray(tab.content) ? tab.content : [tab.content], doc, disposers);
    }
    sectionEl.appendChild(panel);
    tabPanels.push({ id: tab.id, el: panel });
  }

  disposers.push(
    effect(() => {
      const current = activeId.get();
      for (const btnEntry of tabButtons) {
        const isActive = btnEntry.id === current;
        btnEntry.el.setAttribute("aria-selected", isActive ? "true" : "false");
        btnEntry.el.setAttribute("tabindex", isActive ? "0" : "-1");
      }
      for (const panelEntry of tabPanels) {
        if (panelEntry.id === current) {
          panelEntry.el.removeAttribute("hidden");
        } else {
          panelEntry.el.setAttribute("hidden", "");
        }
      }
    })
  );

  const onKeyDown = (event) => {
    const key = event && event.key;
    if (!key) {
      return;
    }
    const currentIndex = tabButtons.findIndex((b) => b.id === activeId.peek());
    const idx = currentIndex === -1 ? 0 : currentIndex;
    let nextIdx = null;

    if (key === "ArrowRight") {
      nextIdx = (idx + 1) % tabButtons.length;
    } else if (key === "ArrowLeft") {
      nextIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
    } else if (key === "Home") {
      nextIdx = 0;
    } else if (key === "End") {
      nextIdx = tabButtons.length - 1;
    }

    if (nextIdx !== null) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      const nextTab = tabButtons[nextIdx];
      activeId.set(nextTab.id);
      if (typeof nextTab.el.focus === "function") {
        nextTab.el.focus();
      }
    }
  };

  tablistEl.addEventListener("keydown", onKeyDown);

  return {
    element: sectionEl,
    activeId,
    dispose() {
      tablistEl.removeEventListener("keydown", onKeyDown);
      for (const [btn, fn] of clickHandlers) {
        btn.removeEventListener("click", fn);
      }
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 5. Accordion (<details> + <summary>) ---

export function Accordion(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  const items = Array.isArray(props.items) ? props.items : [];
  const singleOpen = props.singleOpen === true;
  const openIds = isReactive(props.openIds)
    ? props.openIds
    : signal(items.filter((i) => i.open).map((i) => i.id));

  const sectionEl = doc.createElement("section");
  const disposers = [];
  const base = buildBaseSpec("grex-accordion", config);
  const bound = bindElement(sectionEl, base);
  disposers.push(bound.dispose);

  const detailsEntries = [];
  const toggleListeners = [];

  for (const item of items) {
    const detailsEl = doc.createElement("details");
    if (item.open) {
      detailsEl.open = true;
    }
    const summaryEl = doc.createElement("summary");
    setSafeText(summaryEl, item.summary);
    detailsEl.appendChild(summaryEl);

    if (item.content !== undefined) {
      appendChildren(detailsEl, Array.isArray(item.content) ? item.content : [item.content], doc, disposers);
    }

    const onToggle = () => {
      if (singleOpen && detailsEl.open) {
        for (const other of detailsEntries) {
          if (other.el !== detailsEl && other.el.open) {
            other.el.open = false;
          }
        }
      }
      openIds.set(detailsEntries.filter((d) => d.el.open).map((d) => d.id));
    };

    detailsEl.addEventListener("toggle", onToggle);
    toggleListeners.push([detailsEl, onToggle]);
    detailsEntries.push({ id: item.id, el: detailsEl });
    sectionEl.appendChild(detailsEl);
  }

  return {
    element: sectionEl,
    openIds,
    dispose() {
      for (const [el, fn] of toggleListeners) {
        el.removeEventListener("toggle", fn);
      }
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 6. Modal (<dialog> with showModal(), focus trap, Escape, focus restore) ---

function getFocusableDescendants(container) {
  const nodes = container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes);
}

export function Modal(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  const openSignal = isReactive(props.open) ? props.open : signal(Boolean(props.open));
  const titleId = config.id ? `${config.id}-title` : nextInteractiveId("grex-modal-title");

  const dialogEl = doc.createElement("dialog");
  const disposers = [];
  const base = buildBaseSpec("grex-modal", config);
  base.attrs["aria-modal"] = "true";
  if (props.title != null) {
    base.attrs["aria-labelledby"] = titleId;
  }
  const bound = bindElement(dialogEl, base);
  disposers.push(bound.dispose);

  if (props.title != null) {
    const headingEl = doc.createElement("h2");
    headingEl.setAttribute("id", titleId);
    setSafeText(headingEl, props.title);
    dialogEl.appendChild(headingEl);
  }

  appendChildren(dialogEl, config.children, doc, disposers);

  let previousActive = null;

  const closeAndRestore = () => {
    if (dialogEl.open && typeof dialogEl.close === "function") {
      dialogEl.close();
    } else {
      dialogEl.open = false;
    }
    if (previousActive && typeof previousActive.focus === "function") {
      previousActive.focus();
    }
    previousActive = null;
    if (typeof props.onClose === "function") {
      props.onClose();
    }
  };

  disposers.push(
    effect(() => {
      const shouldOpen = Boolean(openSignal.get());
      if (shouldOpen && !dialogEl.open) {
        previousActive = doc.activeElement || null;
        if (typeof dialogEl.showModal === "function") {
          dialogEl.showModal();
        } else {
          dialogEl.open = true;
        }
        const focusables = getFocusableDescendants(dialogEl);
        if (focusables.length > 0 && typeof focusables[0].focus === "function") {
          focusables[0].focus();
        } else if (typeof dialogEl.focus === "function") {
          dialogEl.focus();
        }
      } else if (!shouldOpen && dialogEl.open) {
        closeAndRestore();
      }
    })
  );

  const onCancel = (ev) => {
    if (ev && typeof ev.preventDefault === "function") {
      ev.preventDefault();
    }
    openSignal.set(false);
  };

  const onKeyDown = (ev) => {
    if (!ev) {
      return;
    }
    if (ev.key === "Escape") {
      if (typeof ev.preventDefault === "function") {
        ev.preventDefault();
      }
      openSignal.set(false);
      return;
    }
    if (ev.key === "Tab") {
      const focusables = getFocusableDescendants(dialogEl);
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (ev.shiftKey && doc.activeElement === first) {
        if (typeof ev.preventDefault === "function") {
          ev.preventDefault();
        }
        last.focus();
      } else if (!ev.shiftKey && doc.activeElement === last) {
        if (typeof ev.preventDefault === "function") {
          ev.preventDefault();
        }
        first.focus();
      }
    }
  };

  dialogEl.addEventListener("cancel", onCancel);
  dialogEl.addEventListener("keydown", onKeyDown);

  return {
    element: dialogEl,
    open: openSignal,
    dispose() {
      dialogEl.removeEventListener("cancel", onCancel);
      dialogEl.removeEventListener("keydown", onKeyDown);
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 7. Nav (<nav> + optional mobile toggle + <ul>/<li>/<a>) ---

export function Nav(config = {}, options = {}) {
  const doc = getDoc(options);
  const props = config.props || {};
  const items = Array.isArray(props.items) ? props.items : [];
  const activePath = isReactive(props.activePath) ? props.activePath : signal(props.activePath ?? "");
  const menuOpen = isReactive(props.open) ? props.open : signal(Boolean(props.open));
  const listId = config.id ? `${config.id}-list` : nextInteractiveId("grex-nav-list");

  const navEl = doc.createElement("nav");
  const disposers = [];
  const base = buildBaseSpec("grex-nav", config);
  if (props.label != null) {
    base.attrs["aria-label"] = String(props.label);
  }
  const bound = bindElement(navEl, base);
  disposers.push(bound.dispose);

  let toggleBtn = null;
  let onToggleClick = null;
  if (props.collapsible) {
    toggleBtn = doc.createElement("button");
    toggleBtn.setAttribute("type", "button");
    toggleBtn.setAttribute("class", "grex-nav-toggle");
    toggleBtn.setAttribute("aria-controls", listId);
    setSafeText(toggleBtn, props.toggleLabel || "Menu");
    onToggleClick = () => menuOpen.set(!menuOpen.peek());
    toggleBtn.addEventListener("click", onToggleClick);
    navEl.appendChild(toggleBtn);
  }

  const ulEl = doc.createElement("ul");
  ulEl.setAttribute("id", listId);
  navEl.appendChild(ulEl);

  if (toggleBtn) {
    disposers.push(
      effect(() => {
        const isOpen = Boolean(menuOpen.get());
        toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (isOpen) {
          ulEl.removeAttribute("hidden");
        } else {
          ulEl.setAttribute("hidden", "");
        }
      })
    );
  }

  const linkEntries = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (!isSafeUrl(item.href)) {
      throw new GrexSecurityError(`Unsafe URL blocked in Nav item: "${String(item.href)}".`);
    }
    const liEl = doc.createElement("li");
    const aEl = doc.createElement("a");
    aEl.setAttribute("href", item.href);
    if (item.external || /^(https?:)?\/\//i.test(item.href)) {
      aEl.setAttribute("rel", "noopener noreferrer");
    }
    setSafeText(aEl, item.text);
    liEl.appendChild(aEl);
    ulEl.appendChild(liEl);
    linkEntries.push({ href: item.href, el: aEl });
  }

  disposers.push(
    effect(() => {
      const current = String(activePath.get() ?? "");
      for (const entry of linkEntries) {
        if (current !== "" && entry.href === current) {
          entry.el.setAttribute("aria-current", "page");
        } else {
          entry.el.removeAttribute("aria-current");
        }
      }
    })
  );

  return {
    element: navEl,
    activePath,
    open: menuOpen,
    dispose() {
      if (toggleBtn && onToggleClick) {
        toggleBtn.removeEventListener("click", onToggleClick);
      }
      for (const fn of disposers) {
        fn();
      }
      disposers.length = 0;
    },
  };
}

// --- 8. Keyed Repeater (ForEach) ---

function resolveRenderedChild(rendered, doc) {
  if (!rendered) {
    throw new Error("ForEach render() must return an element or { element, dispose }.");
  }
  if (typeof rendered === "object" && rendered.element) {
    return {
      element: rendered.element,
      dispose: typeof rendered.dispose === "function" ? rendered.dispose : () => {},
    };
  }
  if (typeof rendered === "object" && "type" in rendered) {
    return renderNode(rendered, { document: doc });
  }
  if (typeof rendered === "object" && "tag" in rendered) {
    return renderElement(rendered, { document: doc });
  }
  if (typeof rendered === "object" && rendered.nodeType) {
    return { element: rendered, dispose: () => {} };
  }
  throw new TypeError("Unsupported ForEach render() return value.");
}

export function ForEach(config = {}, options = {}) {
  const doc = getDoc(options);
  if (typeof config.key !== "function") {
    throw new TypeError("ForEach requires a key(item, index) function.");
  }
  if (typeof config.render !== "function") {
    throw new TypeError("ForEach requires a render(itemSignal, indexSignal) function.");
  }

  let parentEl;
  let parentDispose = () => {};
  if (config.parent && config.parent.nodeType === 1) {
    parentEl = config.parent;
  } else if (config.parent && typeof config.parent === "object") {
    const renderedParent = renderNode(config.parent, { document: doc });
    parentEl = renderedParent.element;
    parentDispose = renderedParent.dispose;
  } else {
    parentEl = doc.createElement("ul");
  }

  let keyedMap = new Map();
  let emptyHandle = null;

  const disposeEmpty = () => {
    if (emptyHandle) {
      if (emptyHandle.element && emptyHandle.element.parentNode === parentEl) {
        parentEl.removeChild(emptyHandle.element);
      }
      emptyHandle.dispose();
      emptyHandle = null;
    }
  };

  const stopEffect = effect(() => {
    const list = readVal(config.items) || [];
    if (!Array.isArray(list)) {
      throw new TypeError("ForEach items must resolve to an array.");
    }

    if (list.length === 0) {
      for (const entry of keyedMap.values()) {
        if (entry.element.parentNode === parentEl) {
          parentEl.removeChild(entry.element);
        }
        entry.dispose();
      }
      keyedMap.clear();

      if (typeof config.empty === "function" && !emptyHandle) {
        const emptyRes = resolveRenderedChild(config.empty(), doc);
        emptyHandle = emptyRes;
        parentEl.appendChild(emptyRes.element);
      }
      return;
    }

    disposeEmpty();

    const nextMap = new Map();
    const orderedEntries = [];

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      const itemKey = config.key(item, i);
      if (itemKey === undefined || itemKey === null || itemKey === "") {
        throw new Error(`ForEach key() returned invalid key at index ${i}.`);
      }
      if (nextMap.has(itemKey)) {
        throw new Error(`ForEach duplicate key "${String(itemKey)}" detected.`);
      }

      let entry = keyedMap.get(itemKey);
      if (entry) {
        entry.itemSignal.set(item);
        entry.indexSignal.set(i);
        keyedMap.delete(itemKey);
      } else {
        const itemSignal = signal(item);
        const indexSignal = signal(i);
        const rendered = resolveRenderedChild(config.render(itemSignal, indexSignal), doc);
        entry = {
          key: itemKey,
          itemSignal,
          indexSignal,
          element: rendered.element,
          dispose: rendered.dispose,
        };
      }
      nextMap.set(itemKey, entry);
      orderedEntries.push(entry);
    }

    // Dispose removed items cleanly
    for (const stale of keyedMap.values()) {
      if (stale.element.parentNode === parentEl) {
        parentEl.removeChild(stale.element);
      }
      stale.dispose();
    }

    // Reorder DOM nodes in place without recreating unchanged items
    let cursor = parentEl.firstChild;
    for (const entry of orderedEntries) {
      if (entry.element === cursor) {
        cursor = cursor.nextSibling;
      } else {
        parentEl.insertBefore(entry.element, cursor);
      }
    }

    keyedMap = nextMap;
  });

  return {
    element: parentEl,
    dispose() {
      stopEffect();
      disposeEmpty();
      for (const entry of keyedMap.values()) {
        entry.dispose();
      }
      keyedMap.clear();
      parentDispose();
    },
  };
}

// Register all 7 interactive components into ELEMENT_REGISTRY for renderNode()
registerElementType("Form", Form);
registerElementType("Input", Input);
registerElementType("Select", Select);
registerElementType("Tabs", Tabs);
registerElementType("Accordion", Accordion);
registerElementType("Modal", Modal);
registerElementType("Nav", Nav);
