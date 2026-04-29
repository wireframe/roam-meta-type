import { createTeardownRegistry } from "./teardown-registry.mjs";
import { chipHtml } from "./meta-type-helpers.mjs";
import { getConfig, getTypeByName, loadConfigFromSettings, SETTINGS_KEY } from "./config.js";
import SettingsPanel from "./settings-panel.js";
import { getCurrentPageTitle, getPageUid, detectTypes } from "./roam-data.js";
import { installEditExitHandlers } from "./inline-editor.js";
import { onChipClick, closeAllPanels, resetPanelState } from "./panel.js";

const CHIP_CLASS = "meta-type-chip";
const PANEL_CLASS = "meta-type-panel";

let observer = null;
let currentPageUid = null;
let renderGeneration = 0;
let teardown = null;

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function onload({ extensionAPI }) {
  teardown = createTeardownRegistry();
  resetPanelState();
  renderGeneration = 0;
  // Cleanups run LIFO at unload: stopObserving fires first, clearFlashColor last.
  loadConfigFromSettings(extensionAPI);
  registerSettingsPanel(extensionAPI);
  applyFlashColor();
  teardown.register(clearFlashColor);
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
              onSave: rerenderEverything,
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
//
// Known limitation: if a chip click is in flight when a config change fires,
// the new panel may slot into the sidebar after this cleanup ran. Tolerable for now.
function rerenderEverything() {
  closeAllPanels();
  cleanup();
  applyFlashColor();
  handleCurrentPage(++renderGeneration);
}

function onunload() {
  closeAllPanels();
  teardown.runAll();
  console.log("[meta-type] destroyed");
}

function applyFlashColor() {
  const { r, g, b } = getConfig().flashColor;
  document.documentElement.style.setProperty('--meta-type-flash-r', r);
  document.documentElement.style.setProperty('--meta-type-flash-g', g);
  document.documentElement.style.setProperty('--meta-type-flash-b', b);
}

function clearFlashColor() {
  document.documentElement.style.removeProperty('--meta-type-flash-r');
  document.documentElement.style.removeProperty('--meta-type-flash-g');
  document.documentElement.style.removeProperty('--meta-type-flash-b');
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

export default { onload, onunload };
