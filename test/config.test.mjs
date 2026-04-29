import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getConfig,
  getTypeByName,
  parseConfigJson,
  setConfig,
  loadConfigFromSettings,
  SETTINGS_KEY,
} from "../src/config.js";

// Reset module-level state before each test so tests are order-independent.
beforeEach(() => setConfig(null));

describe("getConfig", () => {
  it("returns an object with types, typePrefix, and flashColor keys", () => {
    const config = getConfig();
    expect(config).toHaveProperty("types");
    expect(config).toHaveProperty("typePrefix");
    expect(config).toHaveProperty("flashColor");
  });

  it("ships with no default types", () => {
    expect(getConfig().types).toEqual([]);
  });

  it('typePrefix is "Type::"', () => {
    expect(getConfig().typePrefix).toBe("Type::");
  });

  // flashColor only carries the RGB channels; the keyframe opacity stops
  // (0.4 -> 0.0) live in the animation rule, not the config.
  it("flashColor carries the rgb channels of the current animation", () => {
    expect(getConfig().flashColor).toEqual({ r: 16, g: 107, b: 163 });
  });
});

describe("getTypeByName", () => {
  it("returns null for any name when no types are configured", () => {
    expect(getTypeByName("Project")).toBeNull();
    expect(getTypeByName("anything")).toBeNull();
  });

  it("returns the matching type entry when a custom type is configured", () => {
    setConfig({
      types: [
        { name: "Recipe", color: { h: 10, s: 70 }, fields: ["Cuisine", "Time"] },
      ],
      typePrefix: "Type::",
      flashColor: { r: 1, g: 2, b: 3 },
    });
    expect(getTypeByName("Recipe")).toEqual({
      name: "Recipe",
      color: { h: 10, s: 70 },
      fields: ["Cuisine", "Time"],
    });
  });

  it("returns null for an unknown name", () => {
    expect(getTypeByName("NotARealType")).toBeNull();
  });
});

describe("parseConfigJson", () => {
  it("parses valid JSON matching the schema", () => {
    const validConfig = {
      types: [
        {
          name: "Recipe",
          color: { h: 10, s: 70 },
          fields: ["Cuisine", "Time"],
        },
      ],
      typePrefix: "Type::",
      flashColor: { r: 16, g: 107, b: 163 },
    };
    const result = parseConfigJson(JSON.stringify(validConfig));
    expect(result.types[0].name).toBe("Recipe");
    expect(result.types[0].color).toEqual({ h: 10, s: 70 });
    expect(result.types[0].fields).toEqual(["Cuisine", "Time"]);
    expect(result.typePrefix).toBe("Type::");
    expect(result.flashColor).toEqual({ r: 16, g: 107, b: 163 });
  });

  it("returns defaults when given an empty string", () => {
    const result = parseConfigJson("");
    expect(result.types).toEqual([]);
    expect(result.typePrefix).toBe("Type::");
  });

  it("returns defaults when given null", () => {
    const result = parseConfigJson(null);
    expect(result.types).toEqual([]);
    expect(result.typePrefix).toBe("Type::");
  });

  it("returns defaults when given undefined", () => {
    const result = parseConfigJson(undefined);
    expect(result.types).toEqual([]);
    expect(result.typePrefix).toBe("Type::");
  });

  it("returns defaults without throwing for invalid JSON '{'", () => {
    expect(() => parseConfigJson("{")).not.toThrow();
    expect(parseConfigJson("{").typePrefix).toBe("Type::");
  });

  it("returns defaults without throwing for invalid JSON 'not json'", () => {
    expect(() => parseConfigJson("not json")).not.toThrow();
    expect(parseConfigJson("not json").typePrefix).toBe("Type::");
  });

  it("returns defaults without throwing for valid JSON of the wrong shape (array)", () => {
    expect(() => parseConfigJson("[]")).not.toThrow();
    expect(parseConfigJson("[]").typePrefix).toBe("Type::");
  });

  it("returns defaults without throwing for valid JSON missing required fields", () => {
    const malformed = '{ "types": "string instead of array" }';
    expect(() => parseConfigJson(malformed)).not.toThrow();
    expect(parseConfigJson(malformed).typePrefix).toBe("Type::");
  });

  it("preserves unknown keys for forward-compat while keeping known shape", () => {
    const withExtra = {
      types: [
        {
          name: "Recipe",
          color: { h: 10, s: 70 },
          fields: ["Cuisine", "Time"],
        },
      ],
      typePrefix: "Type::",
      flashColor: { r: 16, g: 107, b: 163 },
      futureField: "ignored",
    };
    const result = parseConfigJson(JSON.stringify(withExtra));
    expect(result.types[0].name).toBe("Recipe");
    expect(result.typePrefix).toBe("Type::");
    expect(result.flashColor).toEqual({ r: 16, g: 107, b: 163 });
    expect(result.futureField).toBe("ignored");
  });
});

describe("config state", () => {
  const customConfig = {
    types: [
      { name: "Recipe", color: { h: 10, s: 70 }, fields: ["Cuisine", "Time"] },
    ],
    typePrefix: "Kind::",
    flashColor: { r: 1, g: 2, b: 3 },
  };

  it("getConfig returns DEFAULT_CONFIG before any setConfig call", () => {
    const config = getConfig();
    expect(config.typePrefix).toBe("Type::");
    expect(config.types).toEqual([]);
  });

  it("setConfig replaces the config returned by getConfig", () => {
    setConfig(customConfig);
    expect(getConfig()).toBe(customConfig);
    expect(getConfig().typePrefix).toBe("Kind::");
  });

  it("setConfig(null) resets to DEFAULT_CONFIG", () => {
    setConfig(customConfig);
    setConfig(null);
    expect(getConfig().typePrefix).toBe("Type::");
    expect(getConfig().types).toEqual([]);
  });

  it("getTypeByName uses the active config after setConfig", () => {
    setConfig(customConfig);
    const recipe = getTypeByName("Recipe");
    expect(recipe).not.toBeNull();
    expect(recipe.fields).toEqual(["Cuisine", "Time"]);
  });
});

describe("loadConfigFromSettings", () => {
  it("reads SETTINGS_KEY from extensionAPI.settings.get and stores parsed config", () => {
    const stored = {
      types: [
        { name: "Recipe", color: { h: 10, s: 70 }, fields: ["Cuisine", "Time"] },
      ],
      typePrefix: "Kind::",
      flashColor: { r: 1, g: 2, b: 3 },
    };
    const extensionAPI = {
      settings: {
        get: vi.fn().mockReturnValue(JSON.stringify(stored)),
      },
    };

    loadConfigFromSettings(extensionAPI);

    expect(extensionAPI.settings.get).toHaveBeenCalledWith(SETTINGS_KEY);
    expect(getConfig().typePrefix).toBe("Kind::");
    expect(getConfig().types[0].name).toBe("Recipe");
  });

  it("falls back to DEFAULT_CONFIG when settings store returns null", () => {
    const extensionAPI = {
      settings: { get: vi.fn().mockReturnValue(null) },
    };
    loadConfigFromSettings(extensionAPI);
    expect(getConfig().typePrefix).toBe("Type::");
  });

  it("falls back to DEFAULT_CONFIG when settings store returns invalid JSON", () => {
    const extensionAPI = {
      settings: { get: vi.fn().mockReturnValue("{not json") },
    };
    loadConfigFromSettings(extensionAPI);
    expect(getConfig().typePrefix).toBe("Type::");
  });
});

describe("SETTINGS_KEY", () => {
  it("is the documented string", () => {
    expect(SETTINGS_KEY).toBe("types-config");
  });
});
