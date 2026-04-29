# Structure: Roam Depot plugin conversion
Date: 2026-04-29
Decisions: [decisions.md](decisions.md)
Research: [research.md](research.md)

## Phase 1: Plugin contract migration + dev loop

**Goal:** Convert the IIFE entry into `export default { onload({ extensionAPI }), onunload() }`. Add a teardown registry that captures every DOM mutation, MutationObserver, event listener, injected `<style>` element, and timer set up during `onload`, so `onunload` can reverse them. Emit the build artifact as `extension.js` at the path Roam loads. Behavior must be identical to today.

**Files touched:**
- `src/meta-type.js` — wrap module-level setup into `onload`; introduce a teardown registry; replace direct `document.head.appendChild(style)` etc. with registered cleanup.
- `bin/build.mjs` — emit to `extension.js` at the repo root (or another folder Roam can be pointed at) with the lifecycle export. Drop the IIFE wrapper that the current concat applies.
- `package.json` — adjust `build` script if the output path changes.
- `.gitignore` — ignore the built `extension.js` if we're going to keep it out of git (or commit it; decided in Phase 5).

**Depends on:** nothing.

**Verification:**
- In Roam: Settings → Roam Depot → Installed Extensions → gear icon → enable Developer mode → Developer Extensions → folder-plus icon → point at the repo folder.
- Confirm chips render, panel works, types detected — identical to current behavior.
- Hit `control-d control-r` → confirm `onunload` removes all DOM nodes, observers, listeners, and injected styles (verify via DevTools); `onload` rebuilds cleanly. No zombies.
- Disable the extension from the Developer Extensions list → confirm full teardown.
- All existing vitest tests still pass.

**Notes:**
- Existing CSS classes already use the `meta-type-*` prefix — satisfies Roam's class-collision rule. No renames needed.
- Watch-mode rebuild is an optional ergonomic add-on (e.g., `chokidar` or `nodemon` calling `bin/build.mjs`) — not a phase deliverable, but recommended.

## Phase 2: Centralize configurable values behind one accessor

**Goal:** Pure refactor with no functional change. Introduce one config module returning the current hard-coded values. Every read of `TYPE_CONFIG`, `TYPE_ACCENTS`, the `"Type::"` literal, and the flash RGBA goes through this accessor. Move the flash color out of the static `@keyframes` rule into runtime style injection so it can later be driven by config.

**Files touched:**
- `src/config.js` (new) — exports `getConfig()` returning `{ types: [{ name, color: { h, s }, fields }], typePrefix, flashColor }`. Initially returns the current hard-coded values.
- `src/meta-type.js` — replace the 6 `TYPE_CONFIG[...]` lookups (lines 352, 368, 401, 595, 710, plus the field render at 402–409), the 2 `"Type::"` literals (lines 701, 708), and move the flash CSS keyframes (lines 221–223) into runtime style injection that reads `getConfig().flashColor`.
- `src/meta-type-helpers.mjs` — `chipHtml` reads color from `getConfig()` instead of the local `TYPE_ACCENTS` constant.
- `test/meta-type-helpers.test.mjs` — extend to cover the accessor; existing assertions stay green.

**Depends on:** Phase 1.

**Verification:**
- All existing tests pass unchanged.
- Manual smoke test in Roam (via `control-d control-r` reload) shows identical chips, colors, panels, and flash animation.
- `git diff` reads as mechanical — no behavior changes.

## Phase 3: Read config from `extensionAPI.settings` (round-trip proof)

**Goal:** Wire the config module to read from `extensionAPI.settings`. Use a single JSON-encoded `input` setting holding the full `types[]` array — simplest schema fit; defers UI to Phase 4. Hard-coded defaults remain as fallback when the setting is missing or invalid. Subscribe to changes to re-render chips and panels.

**Files touched:**
- `src/config.js` — accept the `extensionAPI` instance; on first read, parse the JSON setting; on parse failure or missing key, fall back to defaults (and optionally seed the setting with defaults).
- `src/meta-type.js` — in `onload`, register the settings panel (`extensionAPI.settings.panel.create(...)`) with one `input` action and an `onChange` handler that re-hydrates config and re-renders. In `onunload`, ensure subscription cleanup is registered with the teardown registry from Phase 1.

**Depends on:** Phase 2.

**Verification:**
- Open settings panel → paste valid JSON for `types[]` → confirm chips/colors update without a reload.
- Paste invalid JSON → confirm fallback to defaults, no thrown error visible to the user.
- Clear the setting → confirm defaults restore on next reload.
- Disable extension → confirm change subscription is torn down (no callbacks fire after unload).
- This is where the schema friction with D3 becomes concrete — note any rough edges for Phase 4.

## Phase 4: Multi-type settings UI (BlueprintJS, React from `window.React`)

**Goal:** Replace the JSON-blob `input` with a real editor: a `reactComponent` settings entry rendering a Blueprint table that lets users add/remove type rows, edit name, pick color, edit attribute list. Persist by writing back to the same JSON-encoded setting key from Phase 3 — no schema change downstream.

**Files touched:**
- `src/settings-panel.js` (new) — uses `React.createElement` (or JSX if we add a JSX transform) and Blueprint v3 components (`HTMLTable` or similar, `InputGroup`, color picker, `Button`). Reads/writes via `extensionAPI.settings`.
- `src/meta-type.js` — replace the Phase 3 `input` action with a `reactComponent` action wrapping `SettingsPanel`.
- `bin/build.mjs` → swap from concat to **esbuild**. The current Node-only concat can't bundle React/JSX/Blueprint imports.
- `package.json` — devDependencies for `esbuild` (and `@types/react` if we adopt TS later, but decisions deferred TypeScript). Add `build` and optional `build:watch` scripts.
- `bin/build.mjs` esbuild config: `bundle: true`, `format: 'iife'` or `'cjs'` (whichever Roam expects for `extension.js`), and **`external: ['react', 'react-dom', '@blueprintjs/core', '@blueprintjs/select', '@blueprintjs/datetime']`** — these must be re-bundled to `window.React` / `window.ReactDOM` / `window.Blueprint.*` per Roam's contract. Use esbuild's `globalName` / banner injection or a small alias plugin to remap the externals to the window globals.

**Depends on:** Phase 3.

**Verification:**
- Open settings → add type "Recipe" with color + fields ["Cuisine", "Time"] → tag a Roam page with `Type::[[Recipe]]` → confirm chip renders with the chosen color.
- Edit and remove types — confirm UI and Roam behavior stay in sync.
- Inspect built `extension.js`: grep that `react`, `react-dom`, `@blueprintjs/core` are NOT bundled into the output (only references to `window.React`, `window.Blueprint.Core`, etc.). Re-bundling these is grounds for Depot rejection.
- Build artifact size is reasonable (well under 1 MB; for context, zoteroRoam's 612 KB is a heavy outlier).
- Mobile spot-check via URL-based remote dev (deploy to GitHub Pages or `npx serve`, then "Load remote developer extension" by URL).

## Phase 5: Depot manifest and submission (decision point, optional)

**Goal:** Gated on a go/no-go after Phases 1–4 reveal the actual shape and effort. If go: add the manifest to a fork of `Roam-Research/roam-depot` at `extensions/<your-username>/roam-meta-type.json`, decide built-artifact-in-repo vs `build.sh` at depot CI (likely `build.sh` running `npm ci && npm run build` since esbuild is fast and the source is small), open the PR.

**Files touched:**
- New entry in fork of `Roam-Research/roam-depot` at `extensions/<your-username>/roam-meta-type.json` — manifest fields: `name`, `short_description`, `author`, `source_url`, `source_repo`, `source_commit`, `tags` (optional).
- `build.sh` (new, in this repo's root) — `npm ci && npm run build` if we go the build-at-CI route; or omit if we commit `extension.js` directly.
- `README.md`, `CHANGELOG.md` — clean up for end-user audience.

**Depends on:** Phase 4 (or Phase 1 minimum if shipping without configurability — fallback if Phases 3–4 prove harder than expected).

**Verification:**
- Depot PR triggers `prBuild.yaml`; `build.sh` runs cleanly on `ubuntu-24.04`.
- Auto-generated PR-shorthand (`<user>+roam-meta-type+<pr>`) installs cleanly via "Load remote developer extension" so reviewers can test before merge.
- Manual end-to-end test against the PR-shorthand build matches local behavior.

## Out of Scope

- Theme support (Depot doesn't accept themes).
- Graph-as-config storage (D3 chose settings panel; revisitable later if settings-panel UX proves too constrained).
- Migration UX for existing `roam/js`-block users (they'll uninstall the old code-block and install the Depot version manually).
- Paid-plugin / Stripe integration.
- i18n / multi-language settings UI.
- Server-side or sync features.
- Backwards-compat shims for the old IIFE entry point.
- Async-loaded Roam deps (`RoamLazy.*` — `marked`, `jszip`, `cytoscape`, `insect`). Current plugin doesn't use any of these.
- TypeScript migration. Project stays JavaScript; Roam allows JS/TS/CLJS.
- Watch-mode build script (recommended ergonomic add-on; not a phase deliverable).
