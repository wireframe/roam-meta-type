import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const bundlePath = resolve(root, "extension.js");

// Regression guard: Roam Depot rejects extensions that re-bundle React,
// ReactDOM, or Blueprint (Roam ships these on window.*). This test runs
// the build and asserts that none of those libraries' internals leaked
// into the output bundle.
//
// NOTE: positive assertions ("does CONTAIN window.React" etc.) are
// deferred to Phase 4.5 when the SettingsPanel component starts importing
// from "react" and "@blueprintjs/core". Until then, no source code
// references those modules, so the bundle correctly contains no
// window.React reference. Only the negative checks are meaningful here.
describe("build bundle externals", () => {
  let bundle;

  beforeAll(() => {
    execSync("node bin/build.mjs", { cwd: root, stdio: "ignore" });
    bundle = readFileSync(bundlePath, "utf-8");
  });

  it("writes extension.js at the repo root", () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it("does not bundle React internals", () => {
    expect(bundle).not.toContain("__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED");
    expect(bundle).not.toContain("react.development");
    expect(bundle).not.toContain("react.production");
  });

  it("does not bundle Blueprint internals", () => {
    // Blueprint's internal namespace prefix and known internal-only symbols.
    expect(bundle).not.toContain("@blueprintjs/core/lib");
    expect(bundle).not.toContain("BUTTON_FILL");
    expect(bundle).not.toContain("Classes.BUTTON ");
  });

  it("emits an esbuild default export (extension entry point)", () => {
    expect(bundle).toMatch(/export\s*\{[^}]*\bas\s+default\b/);
  });

  it("does not contain bundled module wrappers for externalized libs", () => {
    expect(bundle).not.toMatch(/node_modules\/react\//);
    expect(bundle).not.toMatch(/node_modules\/@blueprintjs\//);
  });
});
