import { describe, it, expect } from "vitest";
import {
  parseFieldsInput,
  stringifyFieldsForInput,
  buildSavePayload,
  parseHueOrFallback,
  parseSatOrFallback,
  presetColorForIndex,
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

describe("parseHueOrFallback", () => {
  it("parses a numeric string into a hue", () => {
    expect(parseHueOrFallback("220", 100)).toBe(220);
  });

  it("returns the fallback for an empty string", () => {
    expect(parseHueOrFallback("", 100)).toBe(100);
  });

  it("returns the fallback for non-numeric input", () => {
    expect(parseHueOrFallback("abc", 100)).toBe(100);
  });

  it("clamps values above 360 to 360", () => {
    expect(parseHueOrFallback("400", 100)).toBe(360);
  });

  it("clamps negative values to 0", () => {
    expect(parseHueOrFallback("-5", 100)).toBe(0);
  });
});

describe("parseSatOrFallback", () => {
  it("parses a numeric string into a saturation", () => {
    expect(parseSatOrFallback("60", 30)).toBe(60);
  });

  it("returns the fallback for an empty string", () => {
    expect(parseSatOrFallback("", 30)).toBe(30);
  });

  it("returns the fallback for non-numeric input", () => {
    expect(parseSatOrFallback("abc", 30)).toBe(30);
  });

  it("clamps values above 100 to 100", () => {
    expect(parseSatOrFallback("150", 30)).toBe(100);
  });

  it("clamps negative values to 0", () => {
    expect(parseSatOrFallback("-5", 30)).toBe(0);
  });
});

describe("presetColorForIndex", () => {
  it("returns the first palette entry for index 0", () => {
    expect(presetColorForIndex(0)).toEqual({ h: 217, s: 60 });
  });

  it("wraps to index 0 when index equals palette length (8)", () => {
    expect(presetColorForIndex(8)).toEqual(presetColorForIndex(0));
  });

  it("wraps to index 7 when index is 15 (15 % 8 == 7)", () => {
    expect(presetColorForIndex(15)).toEqual(presetColorForIndex(7));
  });
});
