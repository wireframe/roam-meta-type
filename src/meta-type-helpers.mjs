function escapeText(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function chipHtml(typeName, accent) {
  const styleAttr = accent
    ? ` style="--chip-h:${accent.h};--chip-s:${accent.s}%"`
    : "";
  return `<span class="meta-type-chip" data-type="${escapeAttr(typeName)}"${styleAttr}>#${escapeText(typeName)}</span>`;
}

// Returns the row scaffold only. For non-empty rows the value cell is left
// blank — populate it post-mount with renderValueCell, which delegates to
// Roam's renderString so we get correct, sandboxed rendering for page refs,
// hashtags, links, and markdown.
export function fieldRowHtml({ label, value, blockUid, isEmpty }) {
  const blockUidAttr = blockUid ? ` data-block-uid="${escapeAttr(blockUid)}"` : "";
  const valueClass = isEmpty ? "meta-type-field-value meta-type-empty" : "meta-type-field-value";
  const innerValue = isEmpty ? "—" : "";
  return `<div class="meta-type-field"${blockUidAttr}><span class="meta-type-field-label">${escapeText(label)}</span><span class="${valueClass}">${innerValue}</span></div>`;
}

export function renderValueCell(cellEl, value) {
  if (!value) {
    cellEl.classList.add("meta-type-empty");
    cellEl.textContent = "—";
    return;
  }
  cellEl.classList.remove("meta-type-empty");
  cellEl.textContent = "";
  window.roamAlphaAPI.ui.components.renderString({ el: cellEl, string: value });
}
