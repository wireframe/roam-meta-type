#!/usr/bin/env bash
# Roam Depot build entry point. Invoked by depot CI on ubuntu-24.04.
# Produces extension.js (and optionally extension.css) at the repo root.
set -euo pipefail
npm ci
npm run build
