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

export function renderRoamMarkdown(text) {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Stash anchor renderings so later rules (hashtag, page-ref) don't mangle URL internals.
  const tokens = [];
  const stash = (rendered) => {
    const token = `\x00T${tokens.length}\x00`;
    tokens.push(rendered);
    return token;
  };

  // markdown links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    stash(`<a href="${url}" target="_blank" onclick="event.stopPropagation()">${label}</a>`));

  // bare URLs: https?://...
  html = html.replace(/https?:\/\/[^\s<>"]+/g, (url) =>
    stash(`<a href="${url}" target="_blank" onclick="event.stopPropagation()">${url}</a>`));

  // page refs: [[Page Name]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_, page) =>
    `<span class="rm-page-ref" data-page="${page}" onclick="event.stopPropagation(); window.roamAlphaAPI.ui.mainWindow.openPage({page: {title: '${page.replace(/'/g, "\\'")}'}})">${page}</span>`);

  // hashtags: #Tag
  html = html.replace(/#([\w-]+)/g, (_, tag) =>
    `<span class="rm-page-ref" data-page="${tag}" onclick="event.stopPropagation(); window.roamAlphaAPI.ui.mainWindow.openPage({page: {title: '${tag}'}})">#${tag}</span>`);

  // bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // italic: __text__
  html = html.replace(/__([^_]+)__/g, '<em>$1</em>');

  // Restore stashed anchors.
  tokens.forEach((replacement, i) => {
    html = html.replace(`\x00T${i}\x00`, replacement);
  });

  return html;
}

export function chipHtml(typeName, accent) {
  const styleAttr = accent
    ? ` style="--chip-h:${accent.h};--chip-s:${accent.s}%"`
    : "";
  return `<span class="meta-type-chip" data-type="${escapeAttr(typeName)}"${styleAttr}>#${escapeText(typeName)}</span>`;
}

export function fieldRowHtml({ label, value, blockUid, isEmpty }) {
  const blockUidAttr = blockUid ? ` data-block-uid="${escapeAttr(blockUid)}"` : "";
  const valueClass = isEmpty ? "meta-type-field-value meta-type-empty" : "meta-type-field-value";
  const innerValue = isEmpty ? "—" : renderRoamMarkdown(value);
  return `<div class="meta-type-field"${blockUidAttr}><span class="meta-type-field-label">${escapeText(label)}</span><span class="${valueClass}">${innerValue}</span></div>`;
}

// Test gap: this helper mutates a DOM node, but the test suite runs without a
// DOM environment (no jsdom/happy-dom dependency). Logic is exercised
// indirectly via the same render rules that fieldRowHtml covers.
export function renderValueCell(cellEl, value) {
  if (!value) {
    cellEl.classList.add("meta-type-empty");
    cellEl.textContent = "—";
  } else {
    cellEl.classList.remove("meta-type-empty");
    cellEl.innerHTML = renderRoamMarkdown(value);
  }
}
