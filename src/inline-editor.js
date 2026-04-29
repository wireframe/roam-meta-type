import { getTypeByName } from "./config.js";
import { readFieldValue, createFieldBlock } from "./roam-data.js";
import { renderValueCell } from "./meta-type-helpers.mjs";

const PANEL_CLASS = "meta-type-panel";

export function installEditExitHandlers() {
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

export async function exitEditMode(rowEl) {
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

  renderValueCell(valueCell, value);

  delete rowEl.dataset.displayHtml;
}

export async function onFieldClick(pageUid, fieldName, blockUid, rowEl) {
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
