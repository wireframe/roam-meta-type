# roam-meta-type

Typed pages for Roam Research. Add a `Type::` attribute to a page and a chip appears next to the title; click it to open a sidebar panel with the fields you care about for that type.

## Encouraging Structure for Your Second Brain

Roam's freedom as an outline is the whole point. But the people, projects, books, and articles I keep coming back to all have *some* structure: an email, a status, a due date, an author. Today that structure is invisible — you have to read the page to learn what kind of thing it is, and scan the outline to find the fields that matter.

`roam-meta-type` keeps the outline. It just makes the structure visible.

## What it does

1. Unobtrusive pill-shaped **chip** page identification based on supported `Type::` attribute. Multi-typed pages (`Type:: #Project #Blog`) get one chip per type.
2. Click a chip → a **panel** mounts at the top of Roam's right sidebar with that type's pinned fields, rendered as label/value rows.
   ![Sidebar panel for a Project](screenshots/panel-project.png)
3. Sidepanel is an integrated **inline-editor**. Click any row → it flips to inline edit mode using Roam's own block editor (autocomplete, page-refs, formatting — all of it). Click any value to flip the row into Roam's block editor. Empty rows render as `—`. Click and the plugin creates the missing block (e.g. `Status:: `) before flipping into edit mode.
   ![Inline editing a row](screenshots/inline-edit.png)
4. Sidepanel reactively refreshes to updates **live**: edit `Priority::` directly in the page body, the panel updates without a re-render.
5. **Configurable** types, fields, and accent colors via the Roam settings panel (no source edits required).

## Install (developer mode)

This extension is being prepared for the Roam Depot. Until it's published, install it as a local Developer Extension:

1. Clone this repo locally:
   ```bash
   git clone https://github.com/wireframe/roam-meta-type.git
   cd roam-meta-type
   npm install
   npm run build
   ```
   This produces `extension.js` at the repo root.
2. In Roam: Settings → **Roam Depot** → **Installed Extensions** → gear icon → enable **Developer mode**.
3. A **Developer Extensions** section appears with a folder-plus icon. Click it and choose this repo's folder.
4. The extension loads. Open any page with a `Type::` attribute and you should see a chip appear.

To reload after editing source: rebuild (`npm run build`), then in Roam press **`control-d control-r`**. Roam unloads the extension, reads the new `extension.js`, and reloads.

To uninstall, remove it from the Developer Extensions list in Roam settings.

## Configuring types

Open Roam **Settings → Meta Type**. There's a single **"Types config (JSON)"** input that holds the full configuration as JSON.

The default config defines 7 types out of the box: `Organization`, `Person`, `Project`, `Blog`, `document`, `article`, `book`. To customize, paste a JSON config and click outside the input to save. The extension reparses, closes any open panels, and re-renders chips with the new config.

Canonical JSON to start from (paste this and edit):

```json
{"types":[{"name":"Organization","color":{"h":217,"s":60},"fields":["Website","Phone","Address"]},{"name":"Person","color":{"h":32,"s":70},"fields":["Email","Phone","Organization","Role","Location","LinkedIn"]},{"name":"Project","color":{"h":158,"s":50},"fields":["Status","Priority","Due","Topics"]},{"name":"Blog","color":{"h":262,"s":55},"fields":["Source"]},{"name":"document","color":{"h":215,"s":14},"fields":["Author","Source","Topics"]},{"name":"article","color":{"h":350,"s":60},"fields":["Author","Source","Topics"]},{"name":"book","color":{"h":199,"s":60},"fields":["Author","Source","Topics"]}],"typePrefix":"Type::","flashColor":{"r":16,"g":107,"b":163}}
```

Schema:

```ts
{
  types: Array<{
    name: string,            // type name; matches the page-ref in the Type:: block
    color: { h: number, s: number },  // HSL accent (lightness is computed)
    fields: string[]         // ordered list of field names; each becomes a row
  }>,
  typePrefix: string,        // the block prefix used to detect a typed page (default "Type::")
  flashColor: { r: number, g: number, b: number }  // RGB for the click-flash highlight
}
```

If the JSON is empty, missing, or malformed, the extension falls back to the canonical defaults and logs a warning to the browser console. Invalid JSON warnings include the parse error message; wrong-shape warnings name the expected top-level keys.

A future version will replace this JSON-blob input with a Blueprint UI for adding, editing, and removing types interactively.

## How a page gets typed

Add a `Type::` attribute as a top-level block on the page, with one or more `#TypeName` references:

```
- Type:: #Project
- Status:: Doing
- Priority:: P1
- Due:: [[April 30th, 2026]]
- Topics:: [[Roam]] [[Productivity]]
```

The plugin reads `Type::`, looks each reference up in the configured types, and renders one chip per known type. Unknown types are silently skipped — no chip, no error.

## Development

```bash
npm install         # vitest + dev deps
npm test            # run unit tests
npm run build       # rebuild extension.js
```

The build is plain file concatenation: `src/teardown-registry.mjs`, `src/meta-type-helpers.mjs`, and `src/config.js` (each with `export` declarations stripped) are concatenated before `src/meta-type.js`. The output `extension.js` ends with `export default { onload, onunload };` — the Roam Depot plugin contract. A guard in [`bin/build.mjs`](bin/build.mjs) fails the build if any stray top-level `import` or `export` survives the concat.

## Architecture (one-paragraph version)

The extension exports `{ onload({ extensionAPI }), onunload() }`. On load it reads the config from `extensionAPI.settings`, registers a settings panel under "Meta Type", injects styles, installs document-level listeners for click-outside-to-exit-edit and Escape-to-exit-edit, registers a chip-click delegation listener on `document.body`, and starts a `MutationObserver` on `.rm-title-display` for page navigation. Every setup operation registers a corresponding cleanup with a small LIFO teardown registry; on unload everything is reversed in reverse-registration order so the observer is silenced before the DOM is torn down. On navigation, the plugin queries the page's `Type::` attribute, removes any old chips, and renders new ones as siblings of the title element. Clicking a chip opens Roam's right sidebar via `roamAlphaAPI.ui.rightSidebar.open()` and prepends a custom panel `<div>` to `#roam-right-sidebar-content`. Each open panel registers a `roamAlphaAPI.data.addPullWatch` rooted at the page UID; the callback diffs new field values and re-renders affected rows without disturbing rows in edit mode (Roam's block editor, mounted via `roamAlphaAPI.ui.components.renderBlock`, owns that DOM until the user blurs).

## License

[MIT](LICENSE).
