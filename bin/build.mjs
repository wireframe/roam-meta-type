#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const registryPath = resolve(root, "src/teardown-registry.mjs");
const helpersPath = resolve(root, "src/meta-type-helpers.mjs");
const configPath = resolve(root, "src/config.js");
const sourcePath = resolve(root, "src/meta-type.js");
const outPath = resolve(root, "extension.js");

const stripExports = (code) => code.replace(/^export\s+(function|const|let)\s+/gm, "$1 ");

const registry = stripExports(readFileSync(registryPath, "utf-8"));
const helpers = stripExports(readFileSync(helpersPath, "utf-8"));
const config = stripExports(readFileSync(configPath, "utf-8"));
const source = readFileSync(sourcePath, "utf-8");

const bundle = registry + "\n\n" + helpers + "\n\n" + config + "\n\n" + source;

const scanTarget = bundle.replace(/^\s*export\s+default\s+\{\s*onload,\s*onunload\s*\};?\s*$/m, "");
const stray = scanTarget.match(/^\s*(?:import|export)\b.*$/gm);
if (stray) {
  console.error(`Bundle contains unexpected top-level import/export statement(s) outside the final \`export default { onload, onunload };\`:`);
  for (const line of stray) console.error(`  ${line.trim()}`);
  console.error(`Check src/teardown-registry.mjs, src/meta-type-helpers.mjs, src/config.js, and src/meta-type.js — these would break Roam at load time.`);
  process.exit(1);
}

writeFileSync(outPath, bundle, "utf-8");

console.log(`Built ${outPath} (${bundle.split("\n").length} lines)`);
