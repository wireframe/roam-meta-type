import { getTypeByName } from "./config.js";
import { readAllFields } from "./roam-data.js";
import { onFieldClick } from "./inline-editor.js";
import { chipHtml, fieldRowHtml, renderValueCell } from "./meta-type-helpers.mjs";

const CHIP_CLASS = "meta-type-chip";
const PANEL_CLASS = "meta-type-panel";
const SIDEBAR_CONTENT_SELECTOR = "#roam-right-sidebar-content";

const openPanels = new Map();
const openingPanels = new Set();

export function resetPanelState() {
  openingPanels.clear();
  openPanels.clear();
}

export function closeAllPanels() {
  Array.from(openPanels.keys()).forEach((key) => closePanel(key));
}

export async function onChipClick(pageUid, typeName) {
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
    const valueCell = row.querySelector(".meta-type-field-value");
    if (valueCell) {
      renderValueCell(valueCell, fieldData[fieldName].value);
    }
    row.addEventListener("click", (e) => {
      // Don't re-trigger edit mode when clicking inside the embedded block editor.
      if (e.target.closest(".meta-type-edit-host")) return;
      const blockUid = row.getAttribute("data-block-uid");
      onFieldClick(pageUid, fieldName, blockUid, row);
    });
  });

  return panel;
}

export function closePanel(key) {
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
    renderValueCell(valueCell, next.value);
  });
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
