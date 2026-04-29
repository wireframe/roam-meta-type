// SettingsPanel — Blueprint-based React UI for editing the types config.
//
// Scope cut (Phase 4): the UI edits the `types` array only. `typePrefix` and
// `flashColor` are advanced settings preserved on save (see buildSavePayload).
// Users who need to change them must do so via the underlying settings store
// directly. This is a deliberate trade-off: a richer editor for the field
// users actually edit, with no schema-level UI for prefix/flash color (rare).
//
// Testing scope: only the pure helpers (parseFieldsInput,
// stringifyFieldsForInput, buildSavePayload) are unit-tested. The component
// itself is verified manually inside Roam — this project does not depend on
// @testing-library/react or jsdom and we do not want to introduce them just
// for a small settings panel. The helpers carry the parsing logic, so the
// component reduces to wiring + Blueprint primitives.

import React, { useState } from "react";
import { Button, Card, InputGroup, TextArea } from "@blueprintjs/core";
import { getConfig, setConfig, SETTINGS_KEY } from "./config.js";

// Preset palette for new types. Rotates by row count so each Add type click
// picks a distinct color until the palette wraps. Hand-picked for chip
// readability against both light and dark Roam themes.
const PRESET_PALETTE = [
  { h: 217, s: 60 },  // blue
  { h: 32, s: 70 },   // orange
  { h: 158, s: 50 },  // green
  { h: 262, s: 55 },  // purple
  { h: 350, s: 60 },  // red
  { h: 180, s: 50 },  // teal
  { h: 50, s: 65 },   // yellow
  { h: 320, s: 60 },  // pink
];

export function presetColorForIndex(index) {
  return PRESET_PALETTE[index % PRESET_PALETTE.length];
}

export function parseFieldsInput(text) {
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function stringifyFieldsForInput(fields) {
  return fields.join(", ");
}

export function buildSavePayload(currentConfig, editedTypes) {
  return { ...currentConfig, types: editedTypes };
}

function newRowId() {
  return crypto.randomUUID();
}

function blankRow(index = 0) {
  const color = { ...presetColorForIndex(index) };
  return {
    _id: newRowId(),
    name: "",
    color,
    hueInput: String(color.h),
    satInput: String(color.s),
    fieldsInput: "",
  };
}

function cloneTypeForEdit(type) {
  return {
    _id: newRowId(),
    name: type.name,
    color: { h: type.color.h, s: type.color.s },
    hueInput: String(type.color.h),
    satInput: String(type.color.s),
    fieldsInput: stringifyFieldsForInput(type.fields),
  };
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function parseHueOrFallback(input, fallback) {
  const parsed = parseInt(input, 10);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 360) : fallback;
}

export function parseSatOrFallback(input, fallback) {
  const parsed = parseInt(input, 10);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 100) : fallback;
}

function swatchStyle(h, s) {
  return {
    background: `hsl(${h}, ${s}%, 50%)`,
    display: "inline-block",
    width: "16px",
    height: "16px",
    borderRadius: "3px",
    border: "1px solid rgba(0,0,0,0.15)",
    verticalAlign: "middle",
  };
}

export default function SettingsPanel({ extensionAPI, onSave }) {
  const [rows, setRows] = useState(() =>
    getConfig().types.map(cloneTypeForEdit)
  );

  const updateRow = (index, patch) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setRows((prev) => [...prev, blankRow(prev.length)]);
  };

  const handleSave = () => {
    const editedTypes = rows.map((row) => ({
      name: row.name,
      color: {
        h: parseHueOrFallback(row.hueInput, row.color.h),
        s: parseSatOrFallback(row.satInput, row.color.s),
      },
      fields: parseFieldsInput(row.fieldsInput),
    }));
    const payload = buildSavePayload(getConfig(), editedTypes);
    extensionAPI.settings.set(SETTINGS_KEY, JSON.stringify(payload));
    // Directly update the in-memory config — bypass the settings.get round-trip
    // since settings.set may not synchronously expose the new value.
    setConfig(payload);
    if (onSave) onSave();
  };

  return (
    <div className="bp3-dark" style={{ padding: "8px 0" }}>
      <h4 style={{ marginTop: 0, marginBottom: "4px" }}>Types</h4>
      <p style={{ marginTop: 0, marginBottom: "12px", opacity: 0.75 }}>
        Add, remove, and edit the page types this extension recognizes.
      </p>
      {rows.map((row, index) => {
        const previewHue = parseHueOrFallback(row.hueInput, row.color.h);
        const previewSat = parseSatOrFallback(row.satInput, row.color.s);
        return (
          <Card
            key={row._id}
            elevation={1}
            style={{ marginBottom: "12px", padding: "12px" }}
          >
            <div style={{ marginBottom: "8px" }}>
              <InputGroup
                fill={true}
                placeholder="Type name"
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <label style={{ fontSize: "12px" }}>
                Hue
                <InputGroup
                  type="number"
                  min={0}
                  max={360}
                  value={row.hueInput}
                  onChange={(e) =>
                    updateRow(index, { hueInput: e.target.value })
                  }
                  style={{ width: "70px" }}
                />
              </label>
              <label style={{ fontSize: "12px" }}>
                Saturation
                <InputGroup
                  type="number"
                  min={0}
                  max={100}
                  value={row.satInput}
                  onChange={(e) =>
                    updateRow(index, { satInput: e.target.value })
                  }
                  style={{ width: "70px" }}
                />
              </label>
              <span style={swatchStyle(previewHue, previewSat)} />
            </div>
            <div style={{ marginBottom: "8px" }}>
              <TextArea
                fill={true}
                growVertically={true}
                rows={2}
                placeholder="Fields, comma-separated (e.g. Email, Phone, Organization)"
                value={row.fieldsInput}
                onChange={(e) =>
                  updateRow(index, { fieldsInput: e.target.value })
                }
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                icon="trash"
                intent="danger"
                minimal={true}
                onClick={() => removeRow(index)}
                aria-label={`Remove ${row.name || "type"}`}
              >
                Remove
              </Button>
            </div>
          </Card>
        );
      })}
      <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
        <Button icon="plus" onClick={addRow}>
          Add type
        </Button>
        <Button intent="primary" icon="floppy-disk" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
