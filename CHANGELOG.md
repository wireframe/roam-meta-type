# Changelog

## 0.1.0 — Initial Roam Depot release

- Typed pages: add a `Type::` block to a page and a chip appears next to the page title for each known type.
- Sidebar panel: clicking a chip opens a panel in Roam's right sidebar with the type's pinned fields. Field rows render Roam markdown (page-refs, hashtags, links, bold/italic), update live via `addPullWatch`, and switch to Roam's inline block editor on click.
- Configurable types: a "Meta Type" tab in Roam settings lets users add, edit, and remove types interactively. Each type has a name, an HSL accent color, and an ordered list of fields. New types pre-populate from a rotating preset palette so users get a usable color out of the box.
- Light/dark theme aware (chip colors and panel surfaces respect Roam's theme).
