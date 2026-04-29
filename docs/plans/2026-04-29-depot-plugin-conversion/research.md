# Research: Roam Depot plugin conversion
Date: 2026-04-29
Decisions: [decisions.md](decisions.md)

## 1. Depot publishing architecture

### Manifest

Single JSON file submitted at `extensions/<github-username>/<repo-name>.json` in `Roam-Research/roam-depot`.

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | yes | string | Display name in Marketplace. |
| `short_description` | yes | string | One-line summary. |
| `author` | yes | string | Author display name. |
| `source_url` | yes | URL | Browser-facing repo URL. |
| `source_repo` | yes | URL | Git clone URL. |
| `source_commit` | yes | 40-char SHA | **Pinned commit. This is the version pin.** |
| `tags` | no | string[] | Discoverability. |
| `stripe_account` | no | string | For paid extensions. |
| `source_subdir` | no | string | Optional subdir of source repo where build runs (used by monorepos like Discourse Graph). |

The internal `ext-id` is computed as `<username>+<repo>` and must match `^[A-Za-z0-9_+-]+$` — no dots, slashes, or special chars (validated in depot's `core.clj`; constrained because Firebase RTDB keys reject `. $ # [ ] /`).

### Plugin repo layout

Files at the source repo root (or `source_subdir`):

- `extension.js` — **required**. Must `export default { onload, onunload }`. State set up in `onload({ extensionAPI })` must be torn down in `onunload`.
- `extension.css` — optional, auto-loaded if present.
- `README.md` — required.
- `CHANGELOG.md` — optional.
- `build.sh` — optional. If present, depot CI runs it on `ubuntu-24.04` before collecting `extension.js`/`extension.css`.

### Submission process

1. Fork `Roam-Research/roam-depot`.
2. Add `extensions/<your-username>/<your-repo>.json` with the manifest.
3. Open PR to `main`.
4. CI runs unprivileged `prBuild.yaml`: clones source repo at `source_commit`, runs `build.sh` if present, uploads artifacts.
5. Privileged `prPublish.yaml` (fires on `workflow_run` after build success) uploads to Firebase under `extension_prs/<ext-id>+<PR>` so reviewers can install the PR build before merge, posts a comment.
6. After merge, `publish.yml` rebuilds and writes to `extensions/<ext-id>` and `extension_versions/<ext-id>+<n>` in Firebase.

PR path filter restricts a PR to files under `extensions/*/*.json`. Themes are explicitly not supported (depot README).

### Versioning model

**Commit-SHA-based, surfaced as a monotonic integer.** No version field in the manifest, no git tag requirement, no semver coupling. To ship an update: bump `source_commit` in the depot manifest via PR. On merge, `publish.clj` looks up `max(version)` for the `ext-id` and writes the new build under `<ext-id>+<max+1>`. The plugin's own `package.json` version is author-internal and unused by the depot.

### Developer extension mode

Roam: **Settings → Roam Depot → Installed Extensions → gear icon → Enable developer mode**. A "Developer Extensions" section appears with a folder-plus icon to point at a local `extension.js` (+ optional `extension.css`). This is the iteration loop and uses the same plugin contract as Depot.

### Sources

- `https://github.com/Roam-Research/roam-depot/blob/main/README.md`
- `Roam-Research/roam-depot/src/community_extensions/{core,build,publish}.clj`
- `Roam-Research/roam-depot/.github/workflows/{prBuild,prPublish,publish}.yml`
- Sample manifests under `extensions/RoamJS/*.json`.

## 2. Depot settings-panel schema

### `extensionAPI.settings` API surface

Provided to `onload({ extensionAPI })`:

| Member | Signature | Behavior |
|---|---|---|
| `settings.panel.create(panelConfig)` | `{ tabTitle: string, settings: SettingEntry[] }` | Registers a tab in the plugin's settings UI. |
| `settings.get(key)` | `(string) => primitive \| undefined` | Reads stored value. |
| `settings.set(key, value)` | `(string, primitive) => void` | Writes value (string / number / boolean). |
| `settings.getAll()` | `() => Record<string, primitive>` | Reads all keys for this extension. |

No documented change-event hooks at the `settings` level — change notifications come from each entry's `action.onChange`.

### Setting entry shape and supported `action.type` values

```js
{ id: string, name: string, description?: string|ReactElement, className?: string, action: { type: ..., ... } }
```

| `action.type` | Required fields | Stored value | Auto-persisted |
|---|---|---|---|
| `"switch"` | `onChange?` | boolean | yes, under `id` |
| `"input"` | `placeholder?`, `onChange?` | string | yes — no native number type |
| `"select"` | `items: string[]`, `onChange?` | string | yes |
| `"button"` | `onClick`, `content` | (none) | n/a — for actions only |
| `"reactComponent"` | `component: () => ReactElement` | (none) | no — component is responsible |

No `multiselect`, `number`, `color`, `radio`, or `textarea` types in the canonical example or any plugin surveyed. Multi-value inputs are commonly handled as comma-separated strings parsed at read time.

Canonical example: `panterarocks49/settings-panel-example/extension.js` (the de facto reference for the schema).

### Nested / array support

**No native support.** `set(key, value)` accepts only primitives; the panel renders one row per `id`. Workarounds, all observed in the wild:

1. `reactComponent` rendering arbitrary UI that writes multiple primitive keys (most common).
2. JSON-encoded string in a single `input` field.
3. `button` whose `onClick` opens a modal owning its own state.
4. Move the structured config out of `extensionAPI.settings` entirely — store it in Roam blocks/pages on the user's graph.

### `reactComponent` capability

`{ type: "reactComponent", component: () => React.ReactElement }`. Zero-arg function returning a React element; mounted inside the row. Arbitrary React allowed (hooks, state, full tables, modal launchers, hot-key recorders observed). The component must persist via `extensionAPI.settings.set(...)` itself — there is no scoped sub-keyspace; namespacing is by convention (e.g., `hot-keys-{n}`). `extensionAPI` is typically passed in via closure.

### Precedents — plugins handling structured config

| Plugin | Repo | Config shape | Strategy |
|---|---|---|---|
| WorkBench | `RoamJS/workbench` | ~20 features × per-feature toggles + sub-settings | One `reactComponent` rendering `SettingsTable`; writes each feature's state to its own primitive key. |
| SmartBlocks | `RoamJS/smartblocks` | hot-keys map + scheduled workflows | Two `reactComponent` entries (`HotKeyPanel`, `DailyConfigComponent`); workflow library lives **outside** settings, in graph blocks. |
| Query Builder | `RoamJS/query-builder` | per-page query/format pairs, default filters | Mix of primitives + 3 `reactComponent` entries; saved queries stored as graph pages, not in `extensionAPI.settings`. |
| Live AI Assistant | `fbgallet/roam-extension-live-ai-assistant` | custom model defs, MCP server configs | `button` entries open dedicated modals; CSV strings parsed via `getArrayFromList()`. |
| Discourse Graph | `DiscourseGraphs/discourse-graph` | node types, relations, formats | One `reactComponent` as thin entry; substantive config on a dedicated graph page. |
| Roam CRM | `8bitgentleman/roam-depot-Roam-CRM` | mixed toggles, week-day select, helpers | Primitives via `switch`/`select`/`button` + presentational `reactComponent` rows. |

Three patterns recur: (1) `reactComponent` writing many primitive keys; (2) `button` opening a custom modal; (3) graph-as-storage (still relevant despite D3 — the surveyed plugins frequently combine settings panel for toggles with graph storage for nested data).

## 3. Current codebase touchpoints

### Project layout

```
roam-meta-type/
├── bin/build.mjs               build script (file concatenation)
├── src/
│   ├── meta-type.js            main extension (777 lines)
│   └── meta-type-helpers.mjs   chip rendering + color table (84 lines)
├── dist/meta-type.bundle.js    output (single IIFE)
├── test/meta-type-helpers.test.mjs   vitest
├── package.json                scripts: build, test
└── README.md
```

### Hard-coded values

**Type → fields** — `src/meta-type.js:4-26` (`TYPE_CONFIG`):

```js
const TYPE_CONFIG = {
  "Organization": { fields: ["Website", "Phone", "Address"] },
  "Person":       { fields: ["Email", "Phone", "Organization", "Role", "Location", "LinkedIn"] },
  "Project":      { fields: ["Status", "Priority", "Due", "Topics"] },
  "Blog":         { fields: ["Source"] },
  "document":     { fields: ["Author", "Source", "Topics"] },
  "article":      { fields: ["Author", "Source", "Topics"] },
  "book":         { fields: ["Author", "Source", "Topics"] },
};
```

7 types, 1–6 fields each.

**Type → color (HSL hue + saturation)** — `src/meta-type-helpers.mjs:60-68` (`TYPE_ACCENTS`):

```js
const TYPE_ACCENTS = {
  Organization: { h: 217, s: 60 }, Person: { h: 32, s: 70 },
  Project: { h: 158, s: 50 }, Blog: { h: 262, s: 55 },
  document: { h: 215, s: 14 }, article: { h: 350, s: 60 }, book: { h: 199, s: 60 },
};
```

**`Type::` prefix string** — `src/meta-type.js:701` (Datalog query) and `:708` (substring strip).

**Field-block prefix** — composed at runtime: `src/meta-type.js:718` `const prefix = fieldName + "::";`.

**Default chip colors** — `src/meta-type.js:133-134` CSS custom properties `--chip-h: 220; --chip-s: 8%;` used as fallback.

**Flash highlight color** — `src/meta-type.js:221-223` hard-coded `rgba(16, 107, 163, ...)` in `@keyframes meta-type-flash-pulse` (3 occurrences within the keyframes rule).

### Call-site map

`TYPE_CONFIG[typeName]` lookups (6 sites, all read-only):
- `meta-type.js:352` validation in unknown-type branch
- `meta-type.js:368` `onChipClick` — fetch fields for sidebar panel
- `meta-type.js:401` `renderPanel` — iterate fields to render rows
- `meta-type.js:402-409` `renderPanel` — `.map(name => fieldRowHtml({...}))`
- `meta-type.js:595` `exitEditMode` — re-validate fields
- `meta-type.js:710` `detectTypes` — filter graph type-refs against known types

`TYPE_ACCENTS[typeName]` lookups (1 site):
- `meta-type-helpers.mjs:71-74` `chipHtml` — inline `style="--chip-h:..;--chip-s:..%"` or empty fallback

`chipHtml(typeName)` callers (3 sites):
- `meta-type.js:417` panel header chip
- `meta-type.js:425-427` chip click → openPage
- `meta-type.js:674` `mountChips` — render all type chips above page title

`"Type::"` literal references (2 sites): `meta-type.js:701`, `:708`.

### Centralization assessment

| Item | Definition | Use sites | Blast radius |
|---|---|---|---|
| Type names + fields | one constant `TYPE_CONFIG` | 6 lookup sites in 1 file | LOW — single chokepoint |
| Type colors | one constant `TYPE_ACCENTS` | 1 lookup site | VERY LOW — fully decoupled |
| `"Type::"` prefix | string literal | 2 sites | LOW — extract to constant |
| Flash color | inline CSS in keyframes | 1 keyframes rule (3 stops) | MODERATE — embedded in static CSS, would need to move to runtime style injection or CSS variables |
| Default chip colors | CSS custom properties | inherited fallback | LOW — already CSS vars |

### Pre-existing config infrastructure

**None.** Single-file IIFE, no config module, no settings object. README explicitly notes the hardcoding and signals a future plan: *"A future version will read `Pinned Fields::` from the type page itself so the type defines its own schema."*

### Build & deploy

- `bin/build.mjs:1-27` — pure Node file concat: reads `meta-type-helpers.mjs`, strips `export function` declarations, injects after `"use strict"` in `meta-type.js`, writes `dist/meta-type.bundle.js`. No transpilation, no minification, no external bundler.
- `package.json` scripts: `build` → `node bin/build.mjs`, `test` → `vitest run`.
- Output: ~860-line IIFE that runs immediately when loaded by Roam.
- README docs the deploy model: paste bundle into a `roam/js` block in the user's graph. There is **no deploy script in the repo** for syncing the bundle to a Roam page (the memory note about "syncs `extension.js` to a `roam/js/meta-type` block" refers to tooling outside this codebase).

## 4. Build & deploy practices among real Depot plugins

### How depot CI processes a plugin

Depot's `publish.yml` runs on push to `main` when any `extensions/*/*.json` changes:

1. Checks out plugin source at `source_commit`.
2. If `build.sh` exists at root, runs it on `ubuntu-24.04`.
3. Collects `extension.js`, `extension.css`, `README.md`, `CHANGELOG.md` from the (sub)directory; uploads to Firebase.

`prBuild.yaml` does the same unprivileged for PRs.

### Build tooling survey

| Plugin | Source language | Build tool | Built artifact location |
|---|---|---|---|
| RoamJS/workbench | TS + React | `samepage build` (esbuild internally) via `build.sh` | Built at depot CI; only `src/` in repo |
| RoamJS/smartblocks | TS | same `samepage build` | Built at depot CI |
| RoamJS/query-builder | TS | same `samepage build` | Built at depot CI |
| Stvad/roam-date | TS + React | `roamjs-scripts build --depot` | Built at depot CI |
| Stvad/roam-vim-navigation | TS | custom esbuild | `extension.js` committed at root and `dist/` |
| 8bitgentleman/zotero-roam | TS + React + SCSS | Vite (`vite build --mode=roam`) | Committed: `extension.js` (612 KB), `.map`, `extension.css` (73 KB), `LICENSE.txt` at root |
| DiscourseGraphs/discourse-graph | TS monorepo | uses `source_subdir: apps/roam` | (subdir of monorepo) |

A trivial 19-byte `build.sh` containing `npm run build:roam` (sha `4fc90bf...`) is shared verbatim across the RoamJS family. Bundling is single-file, self-contained: `npm install` runs inside `build.sh`; nothing is marked "external."

Two distribution patterns:
- **Build at depot CI** (RoamJS family, roam-date): only source committed; no built `extension.js` in the plugin repo.
- **Build committed** (zoteroRoam, roam-vim-navigation): built `extension.js` lives at repo root.

### Dev loop

Watch modes shipped with build tooling: `roamjs-scripts dev --depot`, `samepage dev`, `vite dev --mode=roam`. None of the surveyed plugins documents a hot-reload story; standard pattern is **manual reload in Roam** after rebuild. None of the surveyed READMEs explicitly documents Roam's "Developer Extension" install flow — the only canonical reference is the (client-rendered) Roam developer-documentation page.

### Release process

- **RoamJS family**: `.github/workflows/main.yaml` ("Publish Extension") on push to `main`/`src/**` runs `npm install && npx samepage build` against AWS-credentialed env vars — i.e., samepage publishes to its own AWS-hosted CDN in addition to the Depot. No "commit built artifact" step.
- **zoteroRoam**: multi-workflow `release-it` pipeline. `create-release.yaml` is `workflow_dispatch`; opens a release PR that bumps version, regenerates `CHANGELOG.md`, and commits the built bundle to `main`.
- **Stvad/roam-vim-navigation**: workflow runs lint/typecheck/test/build on push to master and uploads `dist/` to GitHub Pages; built `extension.js` also committed at repo root.

In all cases, the **Depot release** is opening a PR against `Roam-Research/roam-depot` that bumps `source_commit`. CI does the rest.

### CSS handling

`extension.css` at repo root, mirroring `extension.js`. Depot's `prBuild.yaml` (lines 50–58) explicitly uploads `checkout/*/extension.css` alongside `extension.js`. zoteroRoam ships 73 KB CSS at root; RoamJS plugins emit it at depot CI time. CSS-in-JS or runtime style injection was not observed.

## 5. Official developer documentation (canonical reference)

Source: `https://roamresearch.com/#/app/developer-documentation/page/5BB8h4I7b` (Roam's own developer docs page; client-rendered SPA, captured here verbatim because it could not be reached by web fetchers earlier).

### Plugin contract (canonical form)

```javascript
export default {
  onload: ({extensionAPI}) => {},
  onunload: () => {}
};
```

> "All state setup in `onload` should be removed in `onunload`."

### Two coexisting APIs

- **Roam Alpha API** — predates Roam Depot. Available on the global `window.roamAlphaAPI`. Still works in Depot extensions; preserved so existing `roam/js` extensions don't break.
- **Roam Depot Extension API** — newer, passed in via `onload({ extensionAPI })`. Pre-fills extension-aware information into calls and auto-removes registered components when the extension is uninstalled.
- Eventually everything in Alpha API will be duplicated into the Extension API; until then, both are needed.

### UI library convention

> "Extensions should prefer using [blueprintjs](https://blueprintjs.com/docs/versions/3/) components to match Roam's style."

Blueprint **v3** specifically (not v4/v5). The majority of Tailwind CSS is also included with Roam.

### CSS class naming

CSS classes must be prefixed with a unique identifier to avoid colliding with Roam or other extensions. Roam's own classes use the `rm-` prefix (e.g., `rm-modal`).

### Bundled dependencies — MUST be consumed from `window.*`

Roam ships these libraries with core. Extensions **must not bundle their own copies** of these — they must consume the shipped versions from the global object (or have their bundler treat them as external and remap to the global).

**Sync (always available on `window.*`):**

| Package | Version | Global |
|---|---|---|
| `react` | 18.2.0 | `window.React` |
| `react-dom` | 18.2.0 | `window.ReactDOM` |
| `@blueprintjs/core` | ^3.50.4 | `window.Blueprint.Core` |
| `@blueprintjs/select` | ^3.18.6 | `window.Blueprint.Select` |
| `@blueprintjs/datetime` | ^3.23.14 | `window.Blueprint.DateTime` |
| `chrono-node` | ^2.3.2 | `window.ChronoNode` |
| `idb` | 7.1.1 | `window.idb` |
| `nanoid` | ^2.0.4 | `window.Nanoid` |
| `file-saver` | ^2.0.2 | `window.FileSaver` |
| `crypto-js` | ^3.1.9-1 | `window.CryptoJS` |
| `tslib` | 2.2.0 | `TSLib` |

**Async (lazy-loaded; extensions should also lazy-load):**

| Package | Version | Global |
|---|---|---|
| `marked-react` | ^1.1.2 | `RoamLazy.MarkedReact` |
| `marked` | 4.3.0 | `RoamLazy.Marked` |
| `jszip` | ^3.10.0 | `RoamLazy.JSZip` |
| `cytoscape` | ^3.7.2 | `RoamLazy.Cytoscape` |
| `insect.js` | 5.6.0 | `RoamLazy.Insect` |

A webpack example for remapping imports → globals lives at `dvargas92495/roamjs-scripts/src/index.ts:122-126`.

### Dependency policy

> "If you can do it without a dependency, do not use a dependency. Only use trustworthy dependencies — extensions will be rejected if our team decides one of your dependencies is untrustworthy."

### Allowed languages

TypeScript, JavaScript, ClojureScript.

### Offline behavior

> "Extensions will run offline. Your extension doesn't have to work offline but it should be aware it could be running without network connection and handle that accordingly."

### Local development — exact flow

1. (Old/transitional URL noted in doc, "until we launch": `https://relemma-git-roam-app-store.roamresearch.com`. Current production has the developer-extensions feature.)
2. Open Settings → Extensions → enable developer mode.
3. Click "Load extension" and choose the local folder containing `extension.js` (and optionally `extension.css`).
4. Reload chord: **`control-d control-r`**. This calls every loaded developer extension's `onunload`, reloads its source, and calls `onload`. Note: the chord reloads **all** developer extensions, not just one. Per-extension reload is also available from Settings → Extensions.
5. If state isn't fully removed in `unload`, do a full page reload then `control-d control-r` to clear residual state.

### Build environment per the docs

The doc says **`ubuntu-20.04`** for `build.sh`. The actual depot CI in `Roam-Research/roam-depot/.github/workflows/publish.yml` (inspected in section 1) currently runs on **`ubuntu-24.04`** — depot CI has been updated since the doc was written. Plan against `ubuntu-24.04` (npm and yarn available on both).

### Manifest example (canonical)

```json
{
  "name": "Test Extension 1",
  "short_description": "Prints 'Test message 1'",
  "author": "Nikita Prokopov",
  "tags": ["print", "test"],
  "source_url": "https://github.com/tonsky/roam-calculator",
  "source_repo": "https://github.com/tonsky/roam-calculator.git",
  "source_commit": "d5ecd16363975b2e7a097d46e5f411c95e16682d",
  "stripe_account": "acct_1LGASrQVCl6NYjck"
}
```

Path: `extensions/<your-username>/<your-repo>.json` in a fork of `Roam-Research/roam-depot`. Update process: bump the metadata file (typically `source_commit`) and open another PR.

### Remote developer extensions (mobile testing, beta sharing)

Two formats accepted by "Load remote developer extension":

1. **PR-shorthand:** `<username>+<extension-id>+<pr-number>` — auto-generated as a comment on every depot PR. Example: `digitalmaster+roam-memo+668`.
2. **URL:** any publicly accessible URL where appending `extension.js`, `extension.css`, `README.md`, `CHANGELOG.md` to the URL yields the file. Example: `https://roam-excalidraw-depot.pages.dev/`. The URL must include the `https://` prefix; only `extension.js` and `README.md` are required.

Properties of remote dev extensions:
- **Auto-started** like production extensions.
- **Not cached** — re-downloaded on every page load / refresh.
- **Not synced** across devices.

For URL-based remote dev: the depot-extension-template repo (`8bitgentleman/roam-depot-extension-template`) contains a GitHub Actions workflow (`.github/workflows/deploy.yml`) that auto-deploys the extension to GitHub Pages on push to `main`, giving a persistent test URL.

### Stripe payouts (revenue share)

Roam dedicates a portion of revenue to extension authors. To be eligible:
1. Sign up with Stripe in extension settings.
2. Complete the Stripe Connect process fully (account must be enabled).
3. Add the account ID to `stripe_account` in the manifest.

Geographic eligibility per `stripe.com/docs/connect/cross-border-payouts` (non-preview countries). Earnings >$600/yr in the US trigger 1099 reporting. **Paid extensions don't exist yet** — implementing your own payment system disqualifies you from Roam's payouts.

### Reference example plugins (cited by official docs)

| Plugin | Repo | Complexity |
|---|---|---|
| Bitcoin Price Tracker | `panterarocks49/roam-extension-bitcoin-price` | Simple, no build process |
| Auto Tag | `panterarocks49/autotag` | Simple, with a build process |
| RoamJS Query Builder | `dvargas92495/roamjs-query-builder` | Complex build process |

The Auto Tag tutorial Loom specifically demonstrates "porting settings from being changed in a code block to the new settings panel" — directly relevant to D3.

## Patterns Observed

- **Plugin contract:** `export default { onload({ extensionAPI }), onunload() }`. `onload` registers everything; `onunload` must tear all of it down. Replaces the IIFE / "code runs at paste time" model.
- **Settings storage shape:** flat key/primitive map. Structured config is either decomposed into many keys (one per cell) or stored outside `extensionAPI.settings` entirely (modal state, graph blocks).
- **`reactComponent` is the universal escape hatch** for non-trivial settings UI; the component owns its own persistence.
- **Versioning is centralized in the Depot manifest's `source_commit`**, not in the plugin's own version field. The plugin's `package.json` version is informational.
- **Dev loop = "Developer Extensions" feature in Roam** + a watch-mode build pointing at the same files Depot expects. Reload chord is `control-d control-r` (reloads ALL loaded dev extensions, not just one).
- **`build.sh` is the contract surface for arbitrary build pipelines** — the depot doesn't care what's inside; it just runs it on ubuntu-24.04 and collects the output.
- **Roam-bundled deps must be consumed from `window.*`** (not re-bundled). React 18.2, ReactDOM 18.2, Blueprint v3 (core/select/datetime), chrono-node, idb, nanoid, file-saver, crypto-js, tslib are mandated globals. Re-bundling these is a rejection criterion.
- **BlueprintJS v3 is the de facto UI kit.** Settings panels, modals, and component-heavy UIs in surveyed plugins lean on Blueprint to match Roam's look.
- **CSS classes must use a unique prefix** to avoid colliding with Roam (`rm-*`) or other extensions.
- **Two ways to share dev/beta builds**: PR-shorthand (`<user>+<repo>+<pr>`, auto-generated on depot PRs) or a public URL serving `extension.js` + `README.md`. Useful for mobile testing — neither is cached or device-synced.

## Constraints Discovered

- **`extensionAPI.settings` does not natively support nested or array config.** D3 (settings-panel storage) for multiple types each with `{ name, color, attributes[] }` requires either: (a) a `reactComponent` that writes many flat keys (e.g., `type-N-name`, `type-N-color`, `type-N-attrs`); (b) JSON-encoding the whole config into one `input`; or (c) a `button` opening a custom modal.
- **No native color picker action type.** A color setting must be either a hex/HSL string in an `input`, a select of preset names, or a custom `reactComponent` (Blueprint provides color-picker components that fit here).
- **Plugin contract change is non-trivial.** Current code is a single IIFE that begins doing work as soon as it loads. Depot requires a default export with `onload`/`onunload`, and `onunload` must reverse all DOM mutations, observers, listeners, and injected styles. The current code does not appear to provide an unload path.
- **Build artifact location is a fork in the road.** Depot CI can build via `build.sh` (RoamJS pattern, no committed artifact), or the repo can commit a pre-built `extension.js` (zoteroRoam pattern). Both are valid; the choice affects the dev loop and what `git diff` looks like across releases.
- **`ext-id` is a load-bearing identifier** derived from `<github-username>+<repo-name>`. Renaming the GitHub repo or changing the manifest filename changes the ext-id, which is functionally a different extension to Depot.
- **Settings UI cannot launch arbitrary React modals through Roam's UI primitives directly** — modal-launcher plugins (Live AI, Roam CRM) build their own modal infrastructure; Depot's API doesn't ship one. Blueprint's `Dialog` / `Overlay` components are the conventional building blocks.
- **`build.sh` runs on `ubuntu-24.04`** (current depot CI; doc still says `ubuntu-20.04`). Anything beyond what's preinstalled must be installed by the script itself. No private secrets are available to PR-fork builds.
- **The current `roam/js`-block deployment model is unrelated to Depot.** Depot ships a built `extension.js` from GitHub via Firebase to clients; nothing is read from a Roam page block. Conversion is a full re-platforming, not a metadata addition.
- **Bundler must be configured to externalize Roam-bundled deps.** If we adopt React for the settings UI (D3 / Phase 4), the bundler config must remap `import React from 'react'` → `window.React` rather than including React in `extension.js`. Same for any Blueprint imports. Re-bundling is grounds for rejection.
- **Dependency scrutiny is part of the review.** "If you can do it without a dependency, do not use a dependency." Adding npm packages beyond what's already on `window.*` adds review risk.
- **Reload chord is global, not per-extension.** During development, `control-d control-r` reloads every loaded dev extension at once. If the project ever grows to >1 dev extension running simultaneously, side effects across them are possible.
