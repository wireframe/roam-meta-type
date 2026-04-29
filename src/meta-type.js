import { createTeardownRegistry } from "./teardown-registry.mjs";
import { chipHtml, fieldRowHtml, renderRoamMarkdown } from "./meta-type-helpers.mjs";
import { getConfig, getTypeByName, loadConfigFromSettings, SETTINGS_KEY } from "./config.js";
import SettingsPanel from "./settings-panel.js";

const STYLE_ID = "roam-meta-type-styles";
const FLASH_STYLE_ID = "roam-meta-type-flash-styles";
const CHIP_CLASS = "meta-type-chip";
const PANEL_CLASS = "meta-type-panel";
const SIDEBAR_CONTENT_SELECTOR = "#roam-right-sidebar-content";

let observer = null;
let currentPageUid = null;
let renderGeneration = 0;
let teardown = null;
const openPanels = new Map();
const openingPanels = new Set();

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function onload({ extensionAPI }) {
  teardown = createTeardownRegistry();
  // Cleanups run LIFO at unload: stopObserving fires first, removeStyles last.
  loadConfigFromSettings(extensionAPI);
  registerSettingsPanel(extensionAPI);
  injectStyles();
  teardown.register(removeStyles);
  injectFlashStyle();
  teardown.register(removeFlashStyle);
  teardown.register(installChipDelegation());
  teardown.register(installEditExitHandlers());
  teardown.register(cleanup);
  startObserving();
  teardown.register(stopObserving);
  handleCurrentPage(++renderGeneration);
  console.log("[meta-type] initialized");
}

function registerSettingsPanel(extensionAPI) {
  extensionAPI.settings.panel.create({
    tabTitle: "Meta Type",
    settings: [
      {
        id: SETTINGS_KEY,
        // Roam reserves a left/middle column for `name` and `description`. We
        // render our own heading inside the React component to claim that
        // space, so a single space minimizes the wasted column without
        // tripping any "name must be a non-empty string" guard Roam may have.
        name: " ",
        description: "",
        action: {
          type: "reactComponent",
          component: () =>
            SettingsPanel({
              extensionAPI,
              onSave: () => handleConfigChange(),
            }),
        },
      },
    ],
  });
}

// Called after the settings panel saves. The React component already wrote the
// new payload via extensionAPI.settings.set AND called setConfig directly, so
// the in-memory config is current. Re-reading from settings.get here would
// race with the async write and clobber the fresh in-memory value.
function handleConfigChange() {
  rerenderEverything();
}

// TODO(phase 4): if a chip click is in flight when a config change fires,
// the new panel may slot into the sidebar after this cleanup ran. Tolerable for now.
function rerenderEverything() {
  Array.from(openPanels.keys()).forEach((key) => closePanel(key));
  cleanup();
  removeFlashStyle();
  injectFlashStyle();
  handleCurrentPage(++renderGeneration);
}

function installEditExitHandlers() {
  document.addEventListener("mousedown", handleClickOutside, true);
  document.addEventListener("keydown", handleKeydown, true);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside, true);
    document.removeEventListener("keydown", handleKeydown, true);
  };
}

function handleClickOutside(e) {
  const editing = document.querySelector('.meta-type-field[data-editing="true"]');
  if (!editing) return;
  if (editing.contains(e.target)) return;
  exitEditMode(editing);
}

function handleKeydown(e) {
  if (e.key !== "Escape") return;
  const editing = document.querySelector('.meta-type-field[data-editing="true"]');
  if (!editing) return;
  exitEditMode(editing);
}

function onunload() {
  Array.from(openPanels.keys()).forEach(key => closePanel(key));
  teardown.runAll();
  console.log("[meta-type] destroyed");
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .meta-type-field {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
    }
    .meta-type-field-label {
      min-width: 80px;
      color: var(--cl-text-muted, #888);
      font-weight: 500;
      flex-shrink: 0;
    }
    .meta-type-field-value {
      flex: 1;
      padding: 2px 4px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }
    .meta-type-field-value:hover {
      background: var(--cl-bg-hover, rgba(0,0,0,0.04));
    }
    .meta-type-field-value.meta-type-empty {
      color: var(--cl-text-muted, #aaa);
      font-style: italic;
    }
    .meta-type-field-value .rm-page-ref {
      color: var(--cl-link-color, #106ba3);
    }
    .meta-type-field-value a {
      color: var(--cl-link-color, #106ba3);
      text-decoration: none;
    }
    .meta-type-field-value a:hover {
      text-decoration: underline;
    }
    .meta-type-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      justify-content: flex-end;
      margin: 0 0 -24px 0;
    }
    .meta-type-chip {
      --chip-h: 220;
      --chip-s: 8%;
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      cursor: pointer;
      user-select: none;
      text-decoration: none;
      vertical-align: middle;
      color: hsl(var(--chip-h), var(--chip-s), 32%);
      background: hsla(var(--chip-h), var(--chip-s), 50%, 0.10);
      border: 1px solid hsla(var(--chip-h), var(--chip-s), 45%, 0.22);
      transition: background-color 120ms ease, border-color 120ms ease;
    }
    .meta-type-chip:hover {
      background: hsla(var(--chip-h), var(--chip-s), 50%, 0.18);
      border-color: hsla(var(--chip-h), var(--chip-s), 45%, 0.36);
    }
    .rm-dark .meta-type-chip,
    [data-theme="dark"] .meta-type-chip {
      color: hsl(var(--chip-h), var(--chip-s), 78%);
      background: hsla(var(--chip-h), var(--chip-s), 60%, 0.16);
      border-color: hsla(var(--chip-h), var(--chip-s), 55%, 0.28);
    }
    .rm-dark .meta-type-chip:hover,
    [data-theme="dark"] .meta-type-chip:hover {
      background: hsla(var(--chip-h), var(--chip-s), 60%, 0.24);
      border-color: hsla(var(--chip-h), var(--chip-s), 55%, 0.44);
    }
    .meta-type-panel {
      margin: 8px;
      padding: 8px 12px;
      border: 1px solid var(--cl-border-color, #d0d0d0);
      border-radius: 6px;
      background: var(--cl-bg-primary, #fff);
      font-size: 13px;
      line-height: 1.5;
    }
    .rm-dark .meta-type-panel,
    [data-theme="dark"] .meta-type-panel {
      border-color: var(--cl-border-color, #444);
      background: var(--cl-bg-primary, #1f1f1f);
      color: var(--cl-text-default, #ddd);
    }
    .meta-type-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--cl-border-color, #e8e8e8);
    }
    .rm-dark .meta-type-panel-header,
    [data-theme="dark"] .meta-type-panel-header {
      border-bottom-color: var(--cl-border-color, #333);
    }
    .meta-type-panel-header .meta-type-chip {
      margin-left: 0;
    }
    .meta-type-panel-close {
      background: transparent;
      border: none;
      color: var(--cl-text-muted, #888);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .meta-type-panel-close:hover {
      background: var(--cl-bg-hover, rgba(0,0,0,0.06));
      color: var(--cl-text-default, #333);
    }
    .rm-dark .meta-type-panel-close:hover,
    [data-theme="dark"] .meta-type-panel-close:hover {
      background: var(--cl-bg-hover, rgba(255,255,255,0.08));
      color: var(--cl-text-default, #ddd);
    }
    .meta-type-panel-body {
    }
    .meta-type-flash {
      animation: meta-type-flash-pulse 600ms ease-out;
    }
    .meta-type-field[data-editing="true"] .meta-type-field-label {
      display: none;
    }
    .meta-type-field[data-editing="true"] .meta-type-field-value,
    .meta-type-field[data-editing="true"] .meta-type-field-value.meta-type-empty {
      font-style: normal;
      color: inherit;
      cursor: text;
    }
    .meta-type-edit-host {
      /* Reset Roam's block container styling so the embedded editor sits flush in the cell. */
      display: block;
      width: 100%;
    }
    .meta-type-edit-host .rm-bullet,
    .meta-type-edit-host .controls,
    .meta-type-edit-host .rm-caret,
    .meta-type-edit-host .rm-block-toggle {
      display: none !important;
    }
    .meta-type-edit-host .rm-block-main,
    .meta-type-edit-host .rm-block,
    .meta-type-edit-host .roam-block-container {
      padding-left: 0 !important;
      margin-left: 0 !important;
    }
    .meta-type-edit-host .rm-block-children {
      display: none !important;
    }
    .meta-type-edit-host .roam-block,
    .meta-type-edit-host .rm-block-input {
      padding: 0 !important;
      font-size: inherit !important;
      line-height: 1.4 !important;
    }
    .meta-type-edit-host .roam-block:focus,
    .meta-type-edit-host .rm-block-input:focus {
      outline: none;
    }
  `;
  document.head.appendChild(style);
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

function injectFlashStyle() {
  if (document.getElementById(FLASH_STYLE_ID)) return;
  const { r, g, b } = getConfig().flashColor;
  const style = document.createElement("style");
  style.id = FLASH_STYLE_ID;
  style.textContent = `
    @keyframes meta-type-flash-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0.4); }
      50%  { box-shadow: 0 0 0 6px rgba(${r}, ${g}, ${b}, 0.0); }
      100% { box-shadow: 0 0 0 0 rgba(${r}, ${g}, ${b}, 0.0); }
    }
  `;
  document.head.appendChild(style);
}

function removeFlashStyle() {
  const style = document.getElementById(FLASH_STYLE_ID);
  if (style) style.remove();
}

function getCurrentPageTitle() {
  const titleEl = document.querySelector(".rm-title-display");
  if (!titleEl) return null;
  return titleEl.textContent.trim();
}

async function getPageUid(pageTitle) {
  const result = await window.roamAlphaAPI.q(
    `[:find ?uid :in $ ?title :where [?e :node/title ?title] [?e :block/uid ?uid]]`,
    pageTitle
  );
  if (result && result.length > 0) return result[0][0];
  return null;
}

function startObserving() {
  const target = document.getElementById("app");
  if (!target) return;

  let lastTitle = null;

  const handleMutation = debounce(async () => {
    const title = getCurrentPageTitle();
    if (title && title !== lastTitle) {
      lastTitle = title;
      cleanup();
      const gen = ++renderGeneration;
      await handleCurrentPage(gen);
    }
  }, 200);

  observer = new MutationObserver(handleMutation);
  observer.observe(target, { childList: true, subtree: true });
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

async function handleCurrentPage(gen) {
  try {
    const pageTitle = getCurrentPageTitle();
    if (!pageTitle) return;

    const pageUid = await getPageUid(pageTitle);
    if (!pageUid || gen !== renderGeneration) return;

    currentPageUid = pageUid;
    const types = await detectTypes(pageUid);
    if (types.length === 0 || gen !== renderGeneration) return;

    mountChips(types);
  } catch (err) {
    console.error("[meta-type] failed to render:", err);
  }
}

function cleanup() {
  clearChips();
  currentPageUid = null;
}

function parsePageRefs(blockString) {
  const refs = [];
  const hashMatches = blockString.match(/#[\w-]+/g) || [];
  hashMatches.forEach(ref => refs.push(ref.substring(1)));
  const bracketMatches = blockString.match(/\[\[([^\]]+)\]\]/g) || [];
  bracketMatches.forEach(ref => refs.push(ref.slice(2, -2)));
  return refs;
}

async function onChipClick(pageUid, typeName) {
  if (!pageUid) {
    console.warn("[meta-type] onChipClick called without pageUid; ignoring");
    return;
  }
  const type = getTypeByName(typeName);
  if (!type) {
    console.warn(`[meta-type] unknown type: ${typeName}`);
    return;
  }

  const key = `${pageUid}::${typeName}`;
  const existing = openPanels.get(key);
  if (existing) {
    existing.element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    flashElement(existing.element);
    return;
  }

  if (openingPanels.has(key)) return;
  openingPanels.add(key);
  try {
    const fields = type.fields;
    const fieldData = await readAllFields(pageUid, fields);

    const panelEl = renderPanel(pageUid, typeName, fieldData);

    await window.roamAlphaAPI.ui.rightSidebar.open();
    const sidebar = await waitForElement(SIDEBAR_CONTENT_SELECTOR, 2000);
    if (!sidebar) {
      console.error("[meta-type] sidebar content area not found");
      return;
    }

    sidebar.prepend(panelEl);

    const entry = {
      pageUid,
      typeName,
      fields: fields.map(name => ({
        name,
        blockUid: fieldData[name].uid,
        value: fieldData[name].value
      })),
      element: panelEl,
      watchHandle: null
    };
    openPanels.set(key, entry);
    subscribePullWatch(entry);
  } finally {
    openingPanels.delete(key);
  }
}

function renderPanel(pageUid, typeName, fieldData) {
  // Caller (onChipClick) has already validated the type exists, so `type` is non-null.
  const type = getTypeByName(typeName);
  const fields = type.fields;
  const rowsHtml = fields
    .map(name => fieldRowHtml({
      label: name,
      value: fieldData[name].value,
      blockUid: fieldData[name].uid,
      isEmpty: !fieldData[name].value
    }))
    .join("");

  const panel = document.createElement("div");
  panel.className = PANEL_CLASS;
  panel.setAttribute("data-page-uid", pageUid);
  panel.setAttribute("data-type", typeName);
  panel.innerHTML = `
    <div class="meta-type-panel-header">
      ${chipHtml(typeName, type.color)}
      <button class="meta-type-panel-close" aria-label="Close">✕</button>
    </div>
    <div class="meta-type-panel-body">${rowsHtml}</div>
  `;

  const headerChip = panel.querySelector(`.meta-type-panel-header .${CHIP_CLASS}`);
  if (headerChip) {
    headerChip.addEventListener("click", () => {
      window.roamAlphaAPI.ui.mainWindow.openPage({ page: { title: typeName } });
    });
  }

  const closeBtn = panel.querySelector(".meta-type-panel-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closePanel(`${pageUid}::${typeName}`));
  }

  const rows = panel.querySelectorAll(".meta-type-panel-body .meta-type-field");
  rows.forEach((row, index) => {
    const fieldName = fields[index];
    row.addEventListener("click", (e) => {
      // Don't re-trigger edit mode when clicking inside the embedded block editor.
      if (e.target.closest(".meta-type-edit-host")) return;
      const blockUid = row.getAttribute("data-block-uid");
      onFieldClick(pageUid, fieldName, blockUid, row);
    });
  });

  return panel;
}

function closePanel(key) {
  const entry = openPanels.get(key);
  if (!entry) return;
  unsubscribePullWatch(entry);
  if (entry.element && entry.element.parentElement) {
    entry.element.remove();
  }
  openPanels.delete(key);
}

function subscribePullWatch(panelEntry) {
  const pattern = "[:block/uid :block/string {:block/children ...}]";
  const entityId = `[:block/uid "${panelEntry.pageUid}"]`;
  const callback = () => onPullWatchFire(panelEntry);

  try {
    window.roamAlphaAPI.data.addPullWatch(pattern, entityId, callback);
    panelEntry.watchHandle = { pattern, entityId, callback };
  } catch (err) {
    console.error("[meta-type] failed to subscribe pull-watch:", err);
  }
}

function unsubscribePullWatch(panelEntry) {
  if (!panelEntry.watchHandle) return;
  const { pattern, entityId, callback } = panelEntry.watchHandle;
  try {
    window.roamAlphaAPI.data.removePullWatch(pattern, entityId, callback);
  } catch (err) {
    console.error("[meta-type] failed to unsubscribe pull-watch:", err);
  }
  panelEntry.watchHandle = null;
}

async function onPullWatchFire(panelEntry) {
  const fieldNames = panelEntry.fields.map(f => f.name);
  const fieldData = await readAllFields(panelEntry.pageUid, fieldNames);

  const rows = panelEntry.element.querySelectorAll(".meta-type-panel-body .meta-type-field");
  rows.forEach((row, index) => {
    // Skip rows in edit mode — Roam's embedded editor owns that DOM.
    if (row.dataset.editing === "true") return;

    const fieldName = fieldNames[index];
    const next = fieldData[fieldName];
    if (!next) return;

    const cached = panelEntry.fields[index];
    if (cached.value === next.value && cached.blockUid === next.uid) return;

    // Update cached state.
    cached.value = next.value;
    cached.blockUid = next.uid;

    // Re-render the value cell.
    const valueCell = row.querySelector(".meta-type-field-value");
    if (!valueCell) return;
    row.setAttribute("data-block-uid", next.uid || "");
    if (!next.value) {
      valueCell.classList.add("meta-type-empty");
      valueCell.textContent = "—";
    } else {
      valueCell.classList.remove("meta-type-empty");
      valueCell.innerHTML = renderRoamMarkdown(next.value);
    }
  });
}

function mountInlineEditor(rowEl, blockUid) {
  const valueCell = rowEl.querySelector(".meta-type-field-value");
  if (!valueCell) return;

  // Stash current display HTML for restore later.
  rowEl.dataset.displayHtml = valueCell.innerHTML;
  rowEl.dataset.editing = "true";

  valueCell.innerHTML = '<div class="meta-type-edit-host"></div>';
  const host = valueCell.querySelector(".meta-type-edit-host");

  window.roamAlphaAPI.ui.components.renderBlock({
    uid: blockUid,
    el: host
  });

  focusEditHost(host, blockUid);
}

function focusEditHost(host, blockUid, attempts = 30) {
  // If textarea is mounted (edit mode), just focus and return.
  const textarea = host.querySelector("textarea.rm-block-input");
  if (textarea) {
    textarea.focus();
    if (typeof textarea.setSelectionRange === "function") {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }
    return;
  }

  // Otherwise, Roam is in view mode. Find the view element and ask Roam to flip it.
  const viewEl = host.querySelector(`[id^="block-input-"][id$="-${blockUid}"]`);
  if (viewEl) {
    const windowId = parseWindowId(viewEl.id, blockUid);
    if (windowId && !host.dataset.metaTypeFocusFired) {
      host.dataset.metaTypeFocusFired = "true";
      try {
        window.roamAlphaAPI.ui.setBlockFocusAndSelection({
          location: { "block-uid": blockUid, "window-id": windowId }
        });
      } catch (err) {
        console.error("[meta-type] setBlockFocusAndSelection failed:", err);
      }
    }
  }

  if (attempts > 0) {
    setTimeout(() => focusEditHost(host, blockUid, attempts - 1), 30);
  }
}

function parseWindowId(elementId, blockUid) {
  const prefix = "block-input-";
  const suffix = `-${blockUid}`;
  if (!elementId.startsWith(prefix) || !elementId.endsWith(suffix)) return null;
  return elementId.slice(prefix.length, elementId.length - suffix.length);
}

async function exitEditMode(rowEl) {
  if (rowEl.dataset.editing !== "true") return;
  delete rowEl.dataset.editing;

  const valueCell = rowEl.querySelector(".meta-type-field-value");
  if (!valueCell) return;

  // Re-read the current value via the panel's pageUid + field name.
  // The panel's data attributes carry pageUid; the row's index resolves the field name.
  const panelEl = rowEl.closest(`.${PANEL_CLASS}`);
  if (!panelEl) {
    // Fallback: restore prior display HTML
    valueCell.innerHTML = rowEl.dataset.displayHtml || "";
    delete rowEl.dataset.displayHtml;
    return;
  }

  const pageUid = panelEl.getAttribute("data-page-uid");
  const typeName = panelEl.getAttribute("data-type");
  const fields = getTypeByName(typeName)?.fields;
  if (!fields) {
    valueCell.innerHTML = rowEl.dataset.displayHtml || "";
    delete rowEl.dataset.displayHtml;
    return;
  }

  const rows = panelEl.querySelectorAll(".meta-type-panel-body .meta-type-field");
  const index = Array.prototype.indexOf.call(rows, rowEl);
  const fieldName = fields[index];

  if (!fieldName) {
    valueCell.innerHTML = rowEl.dataset.displayHtml || "";
    delete rowEl.dataset.displayHtml;
    return;
  }

  // Re-query field value (Roam may have saved a new value while in edit mode).
  const { uid, value } = await readFieldValue(pageUid, fieldName);
  rowEl.setAttribute("data-block-uid", uid || "");

  // Re-render the value cell using fieldRowHtml's value-cell content logic.
  // We can't easily reuse fieldRowHtml here (it produces a full row); instead,
  // duplicate its inner-cell logic.
  if (!value) {
    valueCell.classList.add("meta-type-empty");
    valueCell.textContent = "—";
  } else {
    valueCell.classList.remove("meta-type-empty");
    valueCell.innerHTML = renderRoamMarkdown(value);
  }

  delete rowEl.dataset.displayHtml;
}

function waitForElement(selector, timeoutMs) {
  return new Promise(resolve => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 50);
  });
}

function flashElement(el) {
  el.classList.add("meta-type-flash");
  setTimeout(() => el.classList.remove("meta-type-flash"), 600);
}

function clearChips() {
  document.querySelectorAll(`.meta-type-chips, .${CHIP_CLASS}`).forEach(el => {
    if (el.closest(`.${PANEL_CLASS}`)) return;
    el.remove();
  });
}

function mountChips(types) {
  const titleEl = document.querySelector(".rm-title-display");
  if (!titleEl) return;

  const titleRow = titleEl.parentElement;
  if (!titleRow || !titleRow.parentElement) return;

  titleRow.parentElement.querySelectorAll(".meta-type-chips").forEach(el => el.remove());

  if (types.length === 0) return;

  const pageUidAtMount = currentPageUid;
  const container = document.createElement("div");
  container.className = "meta-type-chips";
  container.innerHTML = types.map(typeName => chipHtml(typeName, getTypeByName(typeName)?.color)).join("");
  container.querySelectorAll(`.${CHIP_CLASS}`).forEach(chip => {
    chip.setAttribute("data-page-uid", pageUidAtMount);
  });

  titleRow.parentNode.insertBefore(container, titleRow);
}

function installChipDelegation() {
  const handleChipClick = (e) => {
    const chip = e.target.closest(`.${CHIP_CLASS}`);
    if (!chip) return;
    // Header chips inside panels have their own listener (navigates to type page).
    if (chip.closest(`.${PANEL_CLASS}`)) return;
    const pageUid = chip.getAttribute("data-page-uid");
    const typeName = chip.getAttribute("data-type");
    if (!pageUid || !typeName) return;
    onChipClick(pageUid, typeName);
  };
  document.body.addEventListener("click", handleChipClick);
  return () => document.body.removeEventListener("click", handleChipClick);
}

async function detectTypes(pageUid) {
  const prefix = getConfig().typePrefix;
  const query = `[:find ?string
                  :in $ ?pageUid ?prefix
                  :where [?p :block/uid ?pageUid]
                         [?p :block/children ?b]
                         [?b :block/string ?string]
                         [(clojure.string/starts-with? ?string ?prefix)]]`;

  const results = await window.roamAlphaAPI.q(query, pageUid, prefix);
  if (!results || results.length === 0) return [];

  const typeNames = [];
  results.forEach(([blockString]) => {
    const value = blockString.substring(prefix.length);
    parsePageRefs(value).forEach(ref => {
      if (getTypeByName(ref)) typeNames.push(ref);
    });
  });

  return typeNames;
}

async function readFieldValue(pageUid, fieldName) {
  const prefix = fieldName + "::";
  const query = `[:find ?uid ?string
                  :in $ ?pageUid ?prefix
                  :where [?p :block/uid ?pageUid]
                         [?p :block/children ?b]
                         [?b :block/string ?string]
                         [?b :block/uid ?uid]
                         [(clojure.string/starts-with? ?string ?prefix)]]`;

  const results = await window.roamAlphaAPI.q(query, pageUid, prefix);
  if (!results || results.length === 0) return { uid: null, value: "" };

  const [uid, blockString] = results[0];
  const value = blockString.substring(prefix.length).trim();
  return { uid, value };
}

async function readAllFields(pageUid, fields) {
  const entries = await Promise.all(
    fields.map(async (field) => [field, await readFieldValue(pageUid, field)])
  );
  return Object.fromEntries(entries);
}

async function createFieldBlock(pageUid, fieldName) {
  await window.roamAlphaAPI.createBlock({
    location: { "parent-uid": pageUid, order: 0 },
    block: { string: `${fieldName}:: ` }
  });
  const { uid } = await readFieldValue(pageUid, fieldName);
  return uid;
}

async function onFieldClick(pageUid, fieldName, blockUid, rowEl) {
  try {
    // Exit any other row currently in edit mode first.
    const editing = document.querySelector('.meta-type-field[data-editing="true"]');
    if (editing && editing !== rowEl) {
      await exitEditMode(editing);
    }

    let uid = blockUid;
    if (!uid) {
      uid = await createFieldBlock(pageUid, fieldName);
      if (!uid) return;
      rowEl.setAttribute("data-block-uid", uid);
    }

    if (rowEl.dataset.editing === "true") return;
    mountInlineEditor(rowEl, uid);
  } catch (err) {
    console.error("[meta-type] failed to open field for edit:", err);
  }
}

export default { onload, onunload };

