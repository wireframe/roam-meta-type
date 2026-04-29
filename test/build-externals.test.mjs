import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const bundlePath = resolve(root, "extension.js");

// Regression guard: Roam Depot rejects extensions that re-bundle React or
// Blueprint (Roam ships these on window.*). This test runs the build and
// asserts that none of those libraries' internals leaked into the output
// bundle. Positive assertions follow: SettingsPanel imports React and
// Blueprint, so the bundle should reference window.React and
// window.Blueprint.Core.
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

  it("contains references to window.React", () => {
    expect(bundle).toMatch(/window\.React/);
  });

  it("contains references to window.Blueprint.Core", () => {
    expect(bundle).toMatch(/window\.Blueprint\.Core/);
  });
});
