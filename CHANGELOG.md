# Changelog

## 0.1.0 — Initial Roam Depot release

- Typed pages: add a `Type::` block to a page and a chip appears next to the page title for each known type.
- Sidebar panel: clicking a chip opens a panel in Roam's right sidebar with the type's pinned fields. Field values render via Roam's `renderString` API (so page-refs, hashtags, block-refs, links, and markdown all behave exactly as in a normal block), update live via `addPullWatch`, and switch to Roam's inline block editor on click. Inside the editor, plain Enter saves and exits (Shift+Enter still inserts a newline); Escape and click-outside also save.
- Configurable types: a "Meta Type" tab in Roam settings lets users add, edit, and remove types interactively. Each type has a name, an HSL accent color, and an ordered list of fields. The extension ships with no default types — users add their own via settings. New types pre-populate from a rotating preset palette so users get a usable color out of the box.
- Light/dark theme aware (chip colors and panel surfaces respect Roam's theme).
