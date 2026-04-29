import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// The source code in src/settings-panel.js imports from "react" and
// "@blueprintjs/core". At BUILD time, esbuild's roam-globals plugin (see
// bin/build.mjs) rewrites those imports to read from window.React /
// window.Blueprint.Core. At TEST time, vitest needs concrete modules to
// resolve — so we alias them to lightweight stubs in test/stubs/. Tests only
// exercise pure helpers, so the stubs need not behave like real React.
export default defineConfig({
  // src/settings-panel.js contains JSX in a .js file (matching the esbuild
  // build config: loader { ".js": "jsx" }). Vite's default loader treats .js
  // as plain JS and chokes on JSX syntax. We tell esbuild (used by Vite) to
  // run the JSX loader on every .js file under src/, mirroring the build.
  plugins: [
    {
      name: "jsx-in-js",
      enforce: "pre",
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) return null;
        if (!code.includes("</") && !code.includes("/>")) return null;
        const { transform } = await import("esbuild");
        const result = await transform(code, {
          loader: "jsx",
          jsxFactory: "React.createElement",
          jsxFragment: "React.Fragment",
          sourcemap: true,
          sourcefile: id,
        });
        return { code: result.code, map: result.map };
      },
    },
  ],
  test: {
    alias: {
      "react": resolve(root, "test/stubs/react.js"),
      "@blueprintjs/core": resolve(root, "test/stubs/blueprint-core.js"),
    },
  },
});
