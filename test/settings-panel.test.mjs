import { describe, it, expect } from "vitest";
import {
  parseFieldsInput,
  stringifyFieldsForInput,
  buildSavePayload,
} from "../src/settings-panel.js";

describe("parseFieldsInput", () => {
  it("splits a comma-separated list with single spaces", () => {
    expect(parseFieldsInput("Email, Phone, Organization")).toEqual([
      "Email",
      "Phone",
      "Organization",
    ]);
  });

  it("splits a comma-separated list with no spaces", () => {
    expect(parseFieldsInput("Email,Phone,Organization")).toEqual([
      "Email",
      "Phone",
      "Organization",
    ]);
  });

  it("trims extra surrounding whitespace from each entry", () => {
    expect(parseFieldsInput("  Email  ,  Phone  ")).toEqual(["Email", "Phone"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseFieldsInput("")).toEqual([]);
  });

  it("returns an empty array for a whitespace-only string", () => {
    expect(parseFieldsInput("   ")).toEqual([]);
  });

  it("drops empty entries from doubled commas", () => {
    expect(parseFieldsInput("Email,, Phone")).toEqual(["Email", "Phone"]);
  });

  it("drops a trailing comma's empty entry", () => {
    expect(parseFieldsInput("Email, Phone,")).toEqual(["Email", "Phone"]);
  });
});

describe("stringifyFieldsForInput", () => {
  it("joins an array with comma+space separators", () => {
    expect(stringifyFieldsForInput(["Email", "Phone"])).toBe("Email, Phone");
  });

  it("returns an empty string for an empty array", () => {
    expect(stringifyFieldsForInput([])).toBe("");
  });
});

describe("buildSavePayload", () => {
  it("preserves typePrefix and flashColor while replacing types", () => {
    const currentConfig = {
      types: [],
      typePrefix: "X::",
      flashColor: { r: 1, g: 2, b: 3 },
    };
    const editedTypes = [
      { name: "A", color: { h: 220, s: 50 }, fields: ["F1"] },
    ];
    expect(buildSavePayload(currentConfig, editedTypes)).toEqual({
      types: editedTypes,
      typePrefix: "X::",
      flashColor: { r: 1, g: 2, b: 3 },
    });
  });

  it("preserves unknown top-level keys for forward-compat", () => {
    const currentConfig = {
      types: [],
      typePrefix: "X::",
      flashColor: { r: 1, g: 2, b: 3 },
      futureField: "preserved",
    };
    const payload = buildSavePayload(currentConfig, [
      { name: "A", color: { h: 1, s: 2 }, fields: [] },
    ]);
    expect(payload.futureField).toBe("preserved");
    expect(payload.types).toEqual([
      { name: "A", color: { h: 1, s: 2 }, fields: [] },
    ]);
  });
});
