# Plan: Roam Depot plugin conversion
Date: 2026-04-29
Decisions: [decisions.md](decisions.md)
Research: [research.md](research.md)
Structure: [structure.md](structure.md)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the existing IIFE-style `roam/js` extension into a Roam Depot-compatible plugin with a configurable, multi-type settings UI persisted via `extensionAPI.settings`.

**Architecture:** The codebase keeps its current structure (single source file in `src/meta-type.js` plus `src/meta-type-helpers.mjs`) but changes its lifecycle contract from an auto-executing IIFE to `export default { onload({ extensionAPI }), onunload() }`. A new `src/config.js` module becomes the single accessor for all configurable values (types, colors, attribute lists, prefixes, flash color), initially returning hard-coded defaults and later reading from the Roam settings panel. Phase 4 introduces React + BlueprintJS via esbuild with externalized dependencies (consumed from `window.React` / `window.Blueprint.*`).

**Tech Stack:** Plain JavaScript (ES modules), vitest for unit tests, Roam Alpha API and Roam Depot Extension API as runtime dependencies, esbuild for Phase 4+ bundling, Blueprint v3 + React 18 (window-bundled, never re-bundled).

**Tracked branch:** `depot-plugin-conversion` (current).

**Conventions for this plan:**
- Each task is a discrete unit. Tasks that introduce behavior follow Red-Green-Refactor TDD where unit-testable; tasks that touch Roam DOM integration verify by manual reload (`control-d control-r`) in Roam developer mode.
- File:line references match the codebase **as of the start of this plan**. After edits, line numbers shift — the task descriptions name the function/block to locate the change, not just a raw line number.
- Commit at the end of every phase. Tests must pass before commit.

---

## Phase 1: Plugin contract migration + dev loop

### Goal recap
Convert the IIFE in `src/meta-type.js` to a module exporting `default { onload, onunload }`. Add a teardown registry that captures every observer, listener, and injected style. Build emits `extension.js` at the repo root. Behavior is identical to today.

### Tasks

- [x] **Task 1.1: Add unit tests for a teardown registry (RED).**
  - File: `test/teardown-registry.test.mjs` (new)
  - Test cases (all should fail initially because the module doesn't exist):
    - `register(fn)` followed by `runAll()` calls the function exactly once.
    - Multiple registrations run in **reverse** order (LIFO): register A, then B → runAll calls B then A.
    - A function that throws does not prevent later (earlier-registered) cleanups from running.
    - After `runAll()`, the registry is empty (a second `runAll()` is a no-op).
  - Verify: `npm test` shows the new test file failing with "module not found" or similar.

- [x] **Task 1.2: Implement the teardown registry (GREEN).**
  - File: `src/teardown-registry.mjs` (new)
  - Export `createTeardownRegistry()` returning `{ register(fn), runAll() }`. LIFO ordering. Wrap each call in try/catch, log errors but continue.
  - Verify: `npm test` is fully green.

- [x] **Task 1.3: Convert `src/meta-type.js` from IIFE to module skeleton.**
  - File: `src/meta-type.js`
  - Change the file's outermost wrapper from `(() => { "use strict"; ... init(); window.roamMetaTypeDestroy = destroy; })()` (lines 1–2 and 773–777) to a module body.
  - Remove the IIFE `(() => {` opener, the closing `})()`, the `"use strict";` (modules are always strict), the `init()` call at line 773, and the `window.roamMetaTypeDestroy = destroy;` line.
  - At the end of the file, add: `export default { onload, onunload };`
  - Rename `init` → `onload` and `destroy` → `onunload` throughout the file. `onload` should accept `({ extensionAPI })` even though it's unused in this phase.
  - Verify: `npm run build` succeeds; `npm test` still green (no behavioral tests broken).

- [x] **Task 1.4: Wire the teardown registry into `onload`/`onunload`.**
  - File: `src/meta-type.js`
  - At the top of `onload`, create a registry: `const teardown = createTeardownRegistry();` (import from `./teardown-registry.mjs`).
  - Replace each setup call in `onload` with a setup that registers its cleanup:
    - `injectStyles()` → still injects, but registers `removeStyles` cleanup.
    - `installChipDelegation()` (currently at body line 682–693) → store the click handler in a `const`, register `document.body.removeEventListener('click', handler)` cleanup.
    - `installEditExitHandlers()` (lines 56–59) → store both handlers in `const`s, register `removeEventListener` cleanups for `mousedown` and `keydown`.
    - `startObserving()` → already nullifies `observer` in `stopObserving()`. Register `stopObserving` cleanup.
  - In `onunload`: replace the manual cleanup chain (lines 75–81) with: close all open panels (existing logic), then `teardown.runAll()`. The console log can stay.
  - Verify: `npm test` green. The teardown registry test file isolates correctness; manual Roam test happens in Task 1.7.

- [x] **Task 1.5: Update `bin/build.mjs` to emit `extension.js` at the repo root in module format.**
  - File: `bin/build.mjs`
  - Change `outPath` (line 11) from `dist/meta-type.bundle.js` to `extension.js` at repo root.
  - Remove the `mkdirSync(dirname(outPath), { recursive: true });` call (line 24) — the repo root always exists.
  - Adjust the `useStrictLine` handling (lines 16–22): the source no longer contains `"use strict";` after Task 1.3. Replace the concat strategy with: `const bundle = helpers + "\n\n" + source;`. The output remains a single ES module file: helpers at the top (now plain `function` declarations because `export function` was stripped at line 13), then the main module body, ending in `export default { onload, onunload };`.
  - Verify: `npm run build` writes `extension.js` at the repo root. Open the file and confirm it ends with `export default { onload, onunload };` and contains all helper functions and main functions.

- [x] **Task 1.6: Add `.gitignore` entry for the build artifact.**
  - File: `.gitignore` (create if missing)
  - Add `extension.js` (and `dist/` if not already ignored) so the built artifact does not pollute git history during development. The Phase 5 decision determines whether we eventually commit it for Depot.
  - Verify: `git status` does not list `extension.js` after a build.

- [x] **Task 1.7: Manually verify the dev loop end-to-end in Roam.**
  - Run `npm run build` to produce `extension.js`.
  - In Roam: Settings → Roam Depot → Installed Extensions → gear icon → enable Developer mode → Developer Extensions → folder-plus icon → choose `/Users/ryansonnek/Projects/roam-meta-type/`.
  - Open a page that has `Type:: [[Project]]` (or similar) — confirm chips render.
  - Click a chip — confirm the sidebar panel opens with the right fields, fields are editable, edits persist.
  - Hit `control-d control-r` — confirm the extension reloads cleanly. Inspect DOM with DevTools: no orphan `<style id="roam-meta-type-styles">`, no zombie `meta-type-chip` elements outside refreshed pages.
  - Disable the extension from Developer Extensions list — confirm full DOM teardown.
  - Re-enable — confirm chips reappear.

- [x] **Task 1.8: Commit Phase 1.**
  - Stage: `src/teardown-registry.mjs`, `src/meta-type.js`, `bin/build.mjs`, `test/teardown-registry.test.mjs`, `.gitignore`, plus the plan docs that are still untracked (`docs/plans/2026-04-29-depot-plugin-conversion/`).
  - Commit message: `Convert IIFE to onload/onunload lifecycle for Roam Depot`
  - Body: brief summary of the lifecycle change and the teardown registry.

---

## Phase 2: Centralize configurable values behind one accessor

### Goal recap
Pure refactor. Introduce `src/config.js` exporting `getConfig()` returning the current hard-coded values. Replace every direct read of `TYPE_CONFIG`, `TYPE_ACCENTS`, `"Type::"`, and the flash RGBA. Move flash color to runtime style injection. No functional change.

### Tasks

- [x] **Task 2.1: Add unit tests for `getConfig()` (RED).**
  - File: `test/config.test.mjs` (new)
  - Test cases:
    - `getConfig()` returns an object with shape `{ types, typePrefix, flashColor }`.
    - `types` is an array of `{ name, color: { h, s }, fields }` entries.
    - `types` includes all 7 current type names (`Organization`, `Person`, `Project`, `Blog`, `document`, `article`, `book`) with their canonical fields and HSL colors (matching `src/meta-type.js:4-26` and `src/meta-type-helpers.mjs:60-68`).
    - `typePrefix` is `"Type::"`.
    - `flashColor` is `"rgba(16, 107, 163, OPACITY)"` or a structured form sufficient to render the existing keyframes.
    - A `getTypeByName(name)` helper (or equivalent) returns the right entry or `null` for unknown names — pick whichever shape feels natural and write it into the test.
  - Verify: `npm test` shows the new test file failing.

- [x] **Task 2.2: Implement `src/config.js` (GREEN).**
  - File: `src/config.js` (new)
  - Export `getConfig()` returning the structure described in Task 2.1, populated with the values currently hard-coded in `src/meta-type.js:4-26`, `src/meta-type-helpers.mjs:60-68`, and `src/meta-type.js:221-223` (flash color).
  - Export `getTypeByName(name)` (or equivalent) that returns the matching entry or null.
  - Verify: `npm test` is fully green.

- [x] **Task 2.3: Replace `TYPE_CONFIG[typeName]` reads in `src/meta-type.js`.**
  - File: `src/meta-type.js`
  - Six existing call sites; identify each by surrounding function:
    - `onChipClick` — `if (!TYPE_CONFIG[typeName])` (was line 352) → `if (!getTypeByName(typeName))`
    - `onChipClick` — `const fields = TYPE_CONFIG[typeName].fields;` (was line 368) → `const fields = getTypeByName(typeName).fields;`
    - `renderPanel` — `const fields = TYPE_CONFIG[typeName].fields;` (was line 401) → use `getTypeByName(typeName).fields`
    - `exitEditMode` — `const fields = TYPE_CONFIG[typeName] && TYPE_CONFIG[typeName].fields;` (was line 595) → `const fields = getTypeByName(typeName)?.fields;`
    - `detectTypes` — `if (TYPE_CONFIG[ref]) typeNames.push(ref);` (was line 710) → `if (getTypeByName(ref)) typeNames.push(ref);`
  - Delete the `TYPE_CONFIG` constant (was lines 4–26).
  - Add `import { getConfig, getTypeByName } from "./config.js";` at the top of the file (the build script will inline `config.js` exports just like it inlines `meta-type-helpers.mjs` — see Task 2.6).
  - Verify: `npm run build` succeeds; `npm test` green.

- [x] **Task 2.4: Replace the `"Type::"` literal in `src/meta-type.js`.**
  - File: `src/meta-type.js`
  - Two sites in `detectTypes`:
    - Datalog query has the literal in `[(clojure.string/starts-with? ?string "Type::")]` (was line 701). Substitute via JS string interpolation: build the query with `` `... [(clojure.string/starts-with? ?string "${getConfig().typePrefix}")]] ` `` (only if `typePrefix` is trusted to be a safe string; otherwise extract to a parameter and pass via `?prefix` to `roamAlphaAPI.q`). **Use the parameterized form** for safety: pattern after the existing `readFieldValue` at lines 717–728 which already uses `?prefix`.
    - Substring strip (was line 708) — `blockString.substring("Type::".length)` → `blockString.substring(getConfig().typePrefix.length)`.
  - Verify: `npm test` green; manual reload in Roam shows chips still detected.

- [x] **Task 2.5: Move color lookup out of `src/meta-type-helpers.mjs` and into `chipHtml` callers.**
  - File: `src/meta-type-helpers.mjs`
  - Delete `TYPE_ACCENTS` (lines 60–68).
  - Change `chipHtml(typeName)` signature to `chipHtml(typeName, accent)` where `accent` is `{ h, s } | null`. Body uses the passed-in `accent` instead of looking up `TYPE_ACCENTS[typeName]`.
  - File: `src/meta-type.js`
  - Three `chipHtml(typeName)` callers (was lines 417, 674, plus the indirect call in `renderPanel` line 417):
    - `renderPanel` (line 417) — `${chipHtml(typeName)}` → `${chipHtml(typeName, getTypeByName(typeName)?.color)}`
    - `mountChips` (line 674) — `types.map(typeName => chipHtml(typeName)).join("")` → `types.map(typeName => chipHtml(typeName, getTypeByName(typeName)?.color)).join("")`
  - File: `test/meta-type-helpers.test.mjs`
  - Update the 3 existing `chipHtml` tests to pass `null` as the second arg (preserving today's "no accent" assertion behavior). Add one new test asserting that `chipHtml("Project", { h: 158, s: 50 })` outputs the inline `style="--chip-h:158;--chip-s:50%"` substring.
  - Verify: `npm test` fully green.

- [x] **Task 2.6: Update `bin/build.mjs` to inline `src/config.js`.**
  - File: `bin/build.mjs`
  - Add a third concatenation step: read `src/config.js`, strip `export ` from `export function`/`export const`, prepend it (after helpers, before main source).
  - Order in the output: helpers → config → main. (Config can call helpers if needed, main uses both.)
  - Verify: `npm run build` succeeds; `extension.js` contains `getConfig` defined before its first usage in the main body.

- [x] **Task 2.7: Move flash color from static `@keyframes` to runtime style injection.**
  - File: `src/meta-type.js`
  - In `injectStyles` (was lines 83–266), remove the `@keyframes meta-type-flash-pulse { ... }` block (lines 220–224).
  - Add a new helper `injectFlashStyle()` that builds the `@keyframes` rule using `getConfig().flashColor` and appends a separate `<style id="roam-meta-type-flash-styles">` element.
  - Call `injectFlashStyle()` from `onload` after `injectStyles()`. Register a teardown that removes the flash style element (mirror the `removeStyles` pattern at lines 268–271).
  - Verify: `npm run build` + reload in Roam (`control-d control-r`) — confirm clicking an already-open chip flashes the panel as before.

- [x] **Task 2.8: Manual smoke test.**
  - In Roam (after `control-d control-r`), confirm: chips render with correct colors for all 7 known types, panel opens, fields render, edits persist, flash animation plays. `git diff` should read as mechanical — no behavior changed.

- [x] **Task 2.9: Commit Phase 2.**
  - Stage: `src/config.js`, `src/meta-type.js`, `src/meta-type-helpers.mjs`, `bin/build.mjs`, `test/config.test.mjs`, `test/meta-type-helpers.test.mjs`.
  - Commit message: `Centralize configurable values behind getConfig() accessor`

---

## Phase 3: Read config from `extensionAPI.settings`

### Goal recap
Wire `getConfig()` to read a single JSON-encoded `input` setting and parse it. Hard-coded defaults remain as fallback. Subscribe to changes and re-render.

### Tasks

- [x] **Task 3.1: Add unit tests for `parseConfigJson(value, defaults)` (RED).**
  - File: `test/config.test.mjs`
  - Test cases for a new `parseConfigJson(jsonString, defaults)` pure function:
    - Valid JSON matching the schema → parsed config returned.
    - Empty string / null / undefined → defaults returned.
    - Invalid JSON (`"{"` or `"not json"`) → defaults returned, no throw.
    - Valid JSON with the wrong shape (e.g., `[]` or `{ types: "string" }`) → defaults returned, no throw.
    - Valid JSON with extra unknown keys → kept (forward-compat) but the known shape is preserved.
  - Verify: tests fail.

- [x] **Task 3.2: Implement `parseConfigJson` (GREEN).**
  - File: `src/config.js`
  - Add `parseConfigJson(jsonString, defaults)` per Task 3.1's spec.
  - Verify: `npm test` green.

- [x] **Task 3.3: Refactor `getConfig()` to read from `extensionAPI.settings`.**
  - File: `src/config.js`
  - Add a module-level `let currentConfig = null;` and a `setConfig(config)` setter.
  - Add `loadConfigFromSettings(extensionAPI)`:
    - Read `extensionAPI.settings.get("types-config")` (or chosen key name; document choice).
    - Pass through `parseConfigJson` with hard-coded defaults.
    - Call `setConfig(parsed)`.
  - Modify `getConfig()` to return `currentConfig` if set, else the defaults.
  - Verify: `npm test` green; existing `getConfig()` tests still pass with no `extensionAPI` (uses defaults).

- [x] **Task 3.4: Register the settings panel in `onload`.**
  - File: `src/meta-type.js`
  - In `onload({ extensionAPI })`, before `injectStyles()`:
    - Call `loadConfigFromSettings(extensionAPI)`.
    - Call `extensionAPI.settings.panel.create({ tabTitle: "Meta Type", settings: [{ id: "types-config", name: "Types config (JSON)", description: "...", action: { type: "input", placeholder: "{...}", onChange: handleConfigChange } }] })`.
    - Define `handleConfigChange = (event) => { loadConfigFromSettings(extensionAPI); rerenderEverything(); }`.
  - Add `rerenderEverything()`: closes all open panels, clears chips, re-runs `handleCurrentPage(++renderGeneration)`.
  - Verify: `npm run build` succeeds; manual test in Roam — open Settings → Meta Type tab → confirm the input field appears.

- [x] **Task 3.5: Verify the round-trip manually.**
  - In Roam: open Settings → Meta Type → paste valid JSON for `types[]` (e.g., add a new type "Recipe" with color and fields). Close settings.
  - Confirm: chips on a page tagged `Type:: [[Recipe]]` render with the new color.
  - Paste invalid JSON → confirm defaults restore, no error visible to the user (check console for the parse warning).
  - Clear the setting → confirm defaults active again.
  - Disable the extension → confirm no callbacks fire from the change subscription.

- [x] **Task 3.6: Commit Phase 3.**
  - Commit message: `Read multi-type config from extensionAPI.settings with JSON-encoded value`

---

## Phase 4: Multi-type settings UI (BlueprintJS, React from `window.React`)

### Goal recap
Replace the JSON-blob `input` with a Blueprint-based React UI that lets users add/remove/edit types. Persists by writing back to the same JSON-encoded setting key. Bundler swaps from concat to esbuild with externals for React/Blueprint.

### Tasks

- [x] **Task 4.1: Add esbuild as a devDependency.**
  - Run: `npm install --save-dev esbuild`
  - Verify: `package.json` lists `esbuild` under `devDependencies`; `package-lock.json` exists if it didn't already.

- [x] **Task 4.2: Replace `bin/build.mjs` with an esbuild-driven build.**
  - File: `bin/build.mjs`
  - Replace the concat logic with an esbuild API call:
    - `entryPoints: ["src/meta-type.js"]`
    - `bundle: true`
    - `format: "esm"` (Roam expects an ES module with default export)
    - `outfile: "extension.js"`
    - `external: ["react", "react-dom", "@blueprintjs/core", "@blueprintjs/select", "@blueprintjs/datetime"]`
    - `loader: { ".js": "jsx" }` (so JSX in `src/settings-panel.js` works without a separate transform)
    - `jsxFactory: "React.createElement"`, `jsxFragment: "React.Fragment"`
    - `banner: { js: "/* roam-meta-type Roam Depot extension */" }` (purely cosmetic; optional)
  - Add a small alias step or post-build text replace so external bare imports resolve to window globals at runtime. Two options — pick one:
    - **(A) esbuild plugin**: define an `onResolve` hook that maps `react` → a virtual module exporting `window.React`, etc.
    - **(B) Banner-injected globals**: prepend `import * as React from "react";` aliasing — simpler if esbuild's external-as-global is supported via `globalName` per file. (Not directly supported for ESM output — likely option A is cleaner.)
  - Recommended: write a tiny inline plugin (~20 lines) that resolves each external to a virtual file `export default window.React` / `export const Button = window.Blueprint.Core.Button` etc. Document the chosen approach in a comment at the top of `bin/build.mjs`.
  - Verify: `npm run build` produces `extension.js`. `grep -c "createElement" extension.js` is small (only at user code). `grep "react" extension.js` should not show a bundled React module (confirm with `wc -c extension.js` is well under 200 KB for now).

- [x] **Task 4.3: Add a smoke test for the build externals.**
  - File: `test/build-externals.test.mjs` (new)
  - Test that runs the build (or asserts on the existing `extension.js`):
    - `extension.js` exists.
    - It does **not** contain `function createReactElement` or React's internal symbol strings (e.g., `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`).
    - It does contain references to `window.React`, `window.Blueprint`.
  - This is a lightweight regression guard — if a future change accidentally re-bundles React, this test fails.
  - Verify: build, then `npm test` green.

- [x] **Task 4.4: Add unit tests for the settings-panel React component (RED).**
  - File: `test/settings-panel.test.mjs` (new)
  - Use `@testing-library/react` (add as dev dep if needed) or a minimal `react-dom/test-utils` setup. If pulling in testing-library is too heavy, write integration-style assertions against the rendered output of `React.createElement` calls.
  - Test cases:
    - Renders a row per type from props (given an array of 3 types, expect 3 rows).
    - Clicking "Add type" appends an empty row to the rendered output (state update).
    - Editing a row's name field updates the local state.
    - Clicking "Remove" on a row removes it.
    - Clicking "Save" calls the `onSave(typesArray)` prop with the current state.
  - Verify: tests fail (no component yet).

- [x] **Task 4.5: Implement `src/settings-panel.js` (GREEN).**
  - File: `src/settings-panel.js` (new)
  - JSX, default export `SettingsPanel({ extensionAPI })` (or a factory accepting `extensionAPI` and returning a component).
  - On mount: read current types from `extensionAPI.settings.get("types-config")`, parse, set local state.
  - Render: a Blueprint `HTMLTable` with columns for name, color (HSL inputs or Blueprint color picker), fields (comma-separated text input). Add buttons: "Add type", "Save", per-row "Remove".
  - On save: serialize state → `extensionAPI.settings.set("types-config", JSON.stringify(typesArray))`. Trigger the same `handleConfigChange` flow as Phase 3.
  - Use Blueprint imports: `import { Button, HTMLTable, InputGroup } from "@blueprintjs/core";` — bundler externalizes them.
  - Verify: `npm test` fully green; `npm run build` succeeds.

- [x] **Task 4.6: Replace the `input` action with a `reactComponent` action.**
  - File: `src/meta-type.js`
  - In the `panel.create` call from Phase 3, change the single setting from `{ action: { type: "input", ... } }` to `{ action: { type: "reactComponent", component: () => SettingsPanel({ extensionAPI }) } }`.
  - Import `SettingsPanel` from `./settings-panel.js`.
  - Verify: `npm run build` succeeds.

- [ ] **Task 4.7: Manual verification in Roam.**
  - Build, reload Roam (`control-d control-r`).
  - Open Settings → Meta Type tab — confirm the React table renders.
  - Add a row: type "Recipe", color (pick HSL values like h=10, s=70), fields "Cuisine, Time".
  - Save. Open a Roam page with `Type:: [[Recipe]]` — confirm chip renders with the color, panel shows Cuisine/Time fields.
  - Edit the row, save, re-verify. Remove the row, save, re-verify chip disappears.
  - Confirm in DevTools that `window.React` is what the component is using (not a bundled copy).

- [ ] **Task 4.8: Mobile/remote verification (optional but recommended).**
  - Run `npx serve` in the repo root → note the local URL (e.g., `http://192.168.x.y:3000`).
  - In Roam (mobile or another device): Settings → Roam Depot → Developer Extensions → Load remote → paste the URL.
  - Confirm extension loads and the settings UI works.

- [ ] **Task 4.9: Commit Phase 4.**
  - Stage all of Phase 4's files plus `package.json` / `package-lock.json`.
  - Commit message: `Add multi-type settings UI with BlueprintJS and esbuild build`

---

## Phase 5: Depot manifest and submission (decision point, optional)

### Goal recap
Gated on a go/no-go after Phases 1–4. If go: add the manifest entry to a fork of `Roam-Research/roam-depot` and open the PR.

### Tasks

- [ ] **Task 5.1: Decide built-artifact-in-repo vs `build.sh` at depot CI.**
  - Decision criteria: if the build is fast (< 10s) and self-contained (only needs `npm ci && npm run build`), prefer **`build.sh` at depot CI** — keeps the repo clean of build artifacts. zoteroRoam-style "commit the bundle" is only worth it if the build is slow or has secrets.
  - Recommendation: use `build.sh`, do not commit `extension.js` to git. Update `.gitignore` accordingly (already done in Phase 1).
  - Document the decision inline as a comment at the top of `build.sh`.

- [ ] **Task 5.2: Create `build.sh`.**
  - File: `build.sh` (new, in repo root)
  - Contents:
    ```sh
    #!/usr/bin/env bash
    set -euo pipefail
    npm ci
    npm run build
    ```
  - `chmod +x build.sh`
  - Verify: `bash build.sh` produces `extension.js` from a clean state.

- [ ] **Task 5.3: Add a `LICENSE` file if missing.** (Already MIT per `package.json`; ensure `LICENSE` file exists in repo root.)

- [ ] **Task 5.4: Update `README.md` for the end-user audience.**
  - File: `README.md`
  - Replace any "paste this into a `roam/js` block" instructions with "install via Roam Depot" once submitted.
  - Document the settings panel: how to add types, format of color/fields.
  - Note that the extension uses `Type:: [[TypeName]]` blocks and `Field:: value` blocks on each typed page.

- [ ] **Task 5.5: Add `CHANGELOG.md`.**
  - File: `CHANGELOG.md` (new)
  - Initial entry covering the conversion to a Depot plugin.

- [ ] **Task 5.6: Push the feature branch and tag the submission commit.**
  - Push `depot-plugin-conversion` to `origin`.
  - Identify the commit SHA on `main` (after the feature branch is merged) that will be the Depot's `source_commit`. **Note:** the Depot manifest must point at a commit on the default branch of the source repo. Plan: merge `depot-plugin-conversion` → `main` first, then capture the SHA.
  - Verify: the SHA points to a commit where running `bash build.sh` produces a valid `extension.js`.

- [ ] **Task 5.7: Fork `Roam-Research/roam-depot` and add the manifest.**
  - Fork the repo via `gh repo fork Roam-Research/roam-depot --clone`.
  - In the fork, add `extensions/wireframe/roam-meta-type.json`:
    ```json
    {
      "name": "Meta Type",
      "short_description": "Typed pages for Roam Research — a chip next to the title and a sidebar panel for the fields you actually use.",
      "author": "Ryan Sonnek",
      "tags": ["meta-data", "schema", "fields"],
      "source_url": "https://github.com/wireframe/roam-meta-type",
      "source_repo": "https://github.com/wireframe/roam-meta-type.git",
      "source_commit": "<SHA from Task 5.6>"
    }
    ```
  - Verify: the JSON parses (`jq . extensions/wireframe/roam-meta-type.json`).

- [ ] **Task 5.8: Open the Depot PR.**
  - Branch in the depot fork, push, open PR via `gh pr create` against `Roam-Research/roam-depot:main`.
  - Title: `Add Meta Type extension`
  - Body: short description, link to source repo, link to README.

- [ ] **Task 5.9: Verify via PR-shorthand.**
  - The depot's `prBuild.yaml` posts a comment with the PR-shorthand (`wireframe+roam-meta-type+<PR>`).
  - In Roam: Settings → Roam Depot → Developer Extensions → Load remote → paste the shorthand.
  - Confirm extension loads and full functionality works as built locally.

- [ ] **Task 5.10: Address review feedback.**
  - Iterate on the manifest or source as Roam reviewers respond.
  - Each iteration: push to `wireframe/roam-meta-type` `main`, bump `source_commit` in the depot manifest PR.

- [ ] **Task 5.11: Final commit + PR merge.**
  - When approved, the depot maintainers merge. The `publish.yml` workflow auto-publishes to Firebase, and the extension appears in the marketplace.

---

## Verification summary

- **Per-phase:** `npm test` must be green before each commit.
- **Per-phase manual:** Roam dev-mode reload + smoke test (chips, panel, edits, settings UI as applicable).
- **Phase 4 specific:** Inspect built `extension.js` to confirm no bundled React or Blueprint.
- **Phase 5 specific:** PR-shorthand install matches local behavior end-to-end.

## Stopping points

The exploratory intent (D1) means the user may choose to stop after any phase and have learned something useful:
- After Phase 1: knows the lifecycle architecture, has a working dev loop.
- After Phase 2: knows the configurability blast radius (small).
- After Phase 3: knows the schema friction with `extensionAPI.settings` is real but workable.
- After Phase 4: has a shippable plugin with full configurability.
- After Phase 5: published in the Depot.
