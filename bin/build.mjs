#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const helpersPath = resolve(root, "src/meta-type-helpers.mjs");
const sourcePath = resolve(root, "src/meta-type.js");
const outPath = resolve(root, "dist/meta-type.bundle.js");

const helpers = readFileSync(helpersPath, "utf-8").replace(/^export\s+function\s+/gm, "function ");
const source = readFileSync(sourcePath, "utf-8");

const useStrictLine = `"use strict";\n`;
if (!source.includes(useStrictLine)) {
  console.error(`Expected '"use strict";' line in ${sourcePath}`);
  process.exit(1);
}

const bundle = source.replace(useStrictLine, useStrictLine + "\n" + helpers + "\n");

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, bundle, "utf-8");

console.log(`Built ${outPath} (${bundle.split("\n").length} lines)`);
