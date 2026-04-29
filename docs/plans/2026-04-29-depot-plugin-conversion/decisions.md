# Decisions: Roam Depot plugin conversion
Date: 2026-04-29

## D1: Intent is exploratory, not shipping
**Question:** What is the end goal of this work?
**Options considered:**
- A) Full Depot submission (restructure + manifest + PR to `Roam-Research/roam-depot`)
- B) Depot-compatible, self-hosted (developer extension)
- C) Local restructure only
- D) Exploratory — understand the architecture before committing to a path
**Chosen:** D (exploratory)
**Rationale:** User wants to understand two things before deciding to ship: (1) the architecture required to publish to Roam Depot, and (2) the changes needed to move from hard-coded type + attribute to configurable, including how Depot helps or hinders that.

## D2: Configurability shape — multiple types, each with color and attributes
**Question:** What does "configurable" mean for users of this plugin?
**Options considered:**
- A) Single type + multi-attribute, user-renamable (clean fit for Depot settings panel)
- B) Multiple types, each with its own color + attributes (needs structured config)
- C) Graph-as-config — types inferred from pages tagged in the graph
**Chosen:** B
**Rationale:** The current plugin already has the model "Type → { color, attributes[] }". Making the type itself user-configurable (name + color + attribute list), with multiple types supported, is the natural extension. The user explicitly corrected the assumption that there is only one attribute per type.

## D3: Config lives in the Roam settings panel, per-user/per-install
**Question:** Should configuration travel with the graph, or be a per-user / per-install setting?
**Options considered:**
- B) Settings panel — config in user's Roam app settings; per-user/per-install; doesn't travel with graph export
- C) Graph-as-config — config stored in a Roam page (e.g., `[[roam/meta-type]]`); travels with graph; shared across users of a shared graph
**Chosen:** B
**Rationale:** User wants config scoped to the user/install, not the graph. Acknowledged tradeoff: Depot's settings schema is designed for flat primitives (text, number, boolean, select, multiselect), so storing nested "type + color + attributes[]" definitions is an open design question — to be investigated in research.

## Research Focus Areas

1. **Depot publishing architecture.** What does the Roam Depot plugin manifest require? Concrete schema of the manifest file, expected repo layout, what gets submitted via PR to `Roam-Research/roam-depot`, what the review/approval process looks like, and what ongoing maintenance expectations exist.

2. **Depot settings-panel schema.** What types does Depot's settings panel actually support? Confirm exact primitive types and whether nested or array-of-object config is possible. Find precedents — existing Depot plugins that need structured config (multi-row, nested, etc.) — and document the patterns they use to work around the flat-schema constraint (JSON-encoded text field, custom modal triggered from settings, separate config page, etc.).

3. **Current codebase touchpoints for configurability.** Where in the current code are the type name, color, and attributes hard-coded? What functions, modules, and call sites would need to change if these become a runtime-loaded list of `{ name, color, attributes[] }`? Identify the blast radius — minimal, moderate, or substantial refactor.

4. **Build and deploy implications.** Depot expects a committed `extension.js` (and possibly `extension.css`) at a known path in the repo, loaded directly by Roam. The current workflow syncs `extension.js` into a `roam/js/meta-type` code block in a Roam page. What changes for: build tooling, dev loop (how to test changes without round-tripping through the graph), release process, and versioning?
