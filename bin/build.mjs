#!/usr/bin/env node
import { build } from "esbuild";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Roam ships React, ReactDOM, and Blueprint on window.* and Roam Depot
// MANDATES that extensions consume them from there (re-bundling these
// libraries is grounds for Depot rejection). The plugin below rewrites
// `import { Button } from "@blueprintjs/core"` into a virtual ESM module
// that reads from `window.Blueprint.Core.Button` at runtime.
const externalToGlobal = {
  "react": "window.React",
  "@blueprintjs/core": "window.Blueprint.Core",
};

// Maintenance contract: when source code adds a new NAMED import from one
// of the externalized modules, add the symbol here. esbuild fails the build
// with "no matching export" if a named import is missing.
//
// Namespace imports (`import * as X from "react"`) and default imports
// (`import React from "react"`) bypass this check — they bind to the whole
// `window.<Lib>` object, so missing symbols become runtime undefined-property
// errors rather than build errors. Prefer named imports.
const knownExports = {
  "react": ["useState"],
  "@blueprintjs/core": ["Button", "Card", "InputGroup", "TextArea"],
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const roamGlobalsPlugin = {
  name: "roam-globals",
  setup(build) {
    const filter = new RegExp(
      `^(${Object.keys(externalToGlobal).map(escapeRegex).join("|")})$`
    );
    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "roam-global",
    }));
    build.onLoad({ filter: /.*/, namespace: "roam-global" }, (args) => {
      const globalRef = externalToGlobal[args.path];
      const names = knownExports[args.path];
      if (!names) {
        throw new Error(
          `roam-globals plugin: '${args.path}' is in externalToGlobal but missing from knownExports. ` +
          `Add an entry (use [] if no named exports needed).`
        );
      }
      const lines = [
        `const g = ${globalRef};`,
        // Roam ships these as plain global namespace objects (no .default wrapper),
        // so `import X from "react"` should bind X to the whole window.<Lib> object.
        `export default g;`,
        ...names.map((name) => `export const ${name} = g.${name};`),
      ];
      return { contents: lines.join("\n"), loader: "js" };
    });
  },
};

await build({
  entryPoints: [resolve(root, "src/meta-type.js")],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: resolve(root, "extension.js"),
  loader: { ".js": "jsx", ".jsx": "jsx" },
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  plugins: [roamGlobalsPlugin],
  logLevel: "info",
});
