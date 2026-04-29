# roam-meta-type

Typed pages for Roam Research. Add a `Type::` attribute to a page and a chip appears next to the title; click it to open a sidebar panel with the fields you care about for that type.

## Encouraging Structure for Your Second Brain

Roam's freedom as an outline is the whole point. But the people, projects, books, and articles I keep coming back to all have *some* structure: an email, a status, a due date, an author. Today that structure is invisible — you have to read the page to learn what kind of thing it is, and scan the outline to find the fields that matter.

`roam-meta-type` keeps the outline. It just makes the structure visible.

## What it does

1. Unobtrusive pill-shaped **chip** page identification based on supported `Type::` attribute.  Multi-typed pages (`Type:: #Project #Blog`) get one chip per type.
2. Click a chip → a **panel** mounts at the top of Roam's right sidebar with that type's pinned fields, rendered as label/value rows.
![Sidebar panel for a Project](screenshots/panel-project.png) 
3. Sidepanel is an integrated **inline-editor**.  Click any row → it flips to inline edit mode using Roam's own block editor (autocomplete, page-refs, formatting — all of it).  Click any value to flip the row into Roam's block editor.  Empty rows render as `—`. Click and the plugin creates the missing block (e.g. `Status:: `) before flipping into edit mode.
![Inline editing a row](screenshots/inline-edit.png)
4. Sidepanel reactively refreshes to updates **live**: edit `Priority::` directly in the page body, the panel updates without a re-render.

Pure roam/js. No external dependencies. No changes to Roam itself. The whole thing is one IIFE you paste into a config block.

## Install

You need one block in your Roam graph.

1. **Copy the bundle.** Open [`dist/meta-type.bundle.js`](dist/meta-type.bundle.js) and copy the entire file to your clipboard.
2. **Make a config page.** Create (or pick) a page in your graph to host the plugin — e.g. `roam/js/meta-type`. Any page works; this is just where the code lives.
3. **Paste into a `roam/js` block.** On that page, create a block whose content is:
   ```
   {{[[roam/js]]}}
   ```
   Indent a child block under it. Paste the bundle into the child block, wrapped in a triple-backtick `javascript` code fence:
   <pre>
   ```javascript
   (() => {
     "use strict";
     // ...the bundle contents...
   })();
   ```
   </pre>
4. **Allow the script.** The first time Roam sees a `roam/js` block on a page, it shows a yellow "Yes, I know what I'm doing" button — click it.
5. **Reload.** The plugin attaches a MutationObserver on page navigation. Open any page with a `Type::` attribute matching a configured type and you should see a chip appear.

To uninstall, remove the block (or run `window.roamMetaTypeDestroy()` in the console to tear it down for the current session).

## Configuring types

The set of recognized types and their pinned fields is hardcoded in [`src/meta-type.js`](src/meta-type.js) at the top:

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

To add or change a type:
1. Edit `TYPE_CONFIG`.
2. Run `npm run build` to regenerate `dist/meta-type.bundle.js`.
3. Re-paste the bundle into your Roam config block.

A future version will read `Pinned Fields::` from the type page itself so the type defines its own schema.

## How a page gets typed

Add a `Type::` attribute as a top-level block on the page, with one or more `#TypeName` references:

```
- Type:: #Project
- Status:: Doing
- Priority:: P1
- Due:: [[April 30th, 2026]]
- Topics:: [[Roam]] [[Productivity]]
```

The plugin reads `Type::`, looks each reference up in `TYPE_CONFIG`, and renders one chip per known type. Unknown types are silently skipped — no chip, no error.

## Development

```bash
npm install         # install vitest
npm test            # run unit tests against helpers
npm run build       # rebuild dist/meta-type.bundle.js from src/
```

The build is a plain file concatenation: `src/meta-type-helpers.mjs` (with `export` stripped) gets injected after the `"use strict";` line of `src/meta-type.js` so the helpers live inside the IIFE scope. See [`bin/build.mjs`](bin/build.mjs).

## Architecture (one-paragraph version)

A single MutationObserver watches `.rm-title-display` for page navigation. On navigation, the plugin queries the page's `Type::` attribute, removes any old chips, and renders new ones as siblings of the title element (never as children — modifying the title element causes edit-mode jank). Clicking a chip opens Roam's right sidebar via `roamAlphaAPI.ui.rightSidebar.open()`, then prepends a custom panel `<div>` to `#roam-right-sidebar-content`. Each open panel registers one `roamAlphaAPI.data.addPullWatch` rooted at the page UID, watching `:block/string` and `:block/children`; the callback diffs the new field values and re-renders affected rows. Field rows in edit mode are not re-rendered — Roam's block editor (mounted via `roamAlphaAPI.ui.components.renderBlock`) owns that DOM until the user blurs.

## License

[MIT](LICENSE).
