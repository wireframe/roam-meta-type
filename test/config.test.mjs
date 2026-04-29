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

  it("returns the 7 canonical type names", () => {
    const names = getConfig().types.map((t) => t.name);
    expect(names).toEqual([
      "Organization",
      "Person",
      "Project",
      "Blog",
      "document",
      "article",
      "book",
    ]);
  });

  it("each type has shape { name, color: { h, s }, fields }", () => {
    for (const type of getConfig().types) {
      expect(type).toHaveProperty("name");
      expect(typeof type.name).toBe("string");
      expect(type).toHaveProperty("color");
      expect(typeof type.color.h).toBe("number");
      expect(typeof type.color.s).toBe("number");
      expect(Array.isArray(type.fields)).toBe(true);
    }
  });

  it("type fields exactly match the canonical lists", () => {
    const byName = Object.fromEntries(
      getConfig().types.map((t) => [t.name, t.fields])
    );
    expect(byName.Organization).toEqual(["Website", "Phone", "Address"]);
    expect(byName.Person).toEqual([
      "Email",
      "Phone",
      "Organization",
      "Role",
      "Location",
      "LinkedIn",
    ]);
    expect(byName.Project).toEqual(["Status", "Priority", "Due", "Topics"]);
    expect(byName.Blog).toEqual(["Source"]);
    expect(byName.document).toEqual(["Author", "Source", "Topics"]);
    expect(byName.article).toEqual(["Author", "Source", "Topics"]);
    expect(byName.book).toEqual(["Author", "Source", "Topics"]);
  });

  it("type colors exactly match the canonical TYPE_ACCENTS values", () => {
    const byName = Object.fromEntries(
      getConfig().types.map((t) => [t.name, t.color])
    );
    expect(byName.Organization).toEqual({ h: 217, s: 60 });
    expect(byName.Person).toEqual({ h: 32, s: 70 });
    expect(byName.Project).toEqual({ h: 158, s: 50 });
    expect(byName.Blog).toEqual({ h: 262, s: 55 });
    expect(byName.document).toEqual({ h: 215, s: 14 });
    expect(byName.article).toEqual({ h: 350, s: 60 });
    expect(byName.book).toEqual({ h: 199, s: 60 });
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
  it("returns the matching type entry for a known name", () => {
    expect(getTypeByName("Project")).toEqual({
      name: "Project",
      color: { h: 158, s: 50 },
      fields: ["Status", "Priority", "Due", "Topics"],
    });
  });

  it("returns the matching type entry for a lowercase canonical name", () => {
    const entry = getTypeByName("document");
    expect(entry.name).toBe("document");
    expect(entry.color).toEqual({ h: 215, s: 14 });
    expect(entry.fields).toEqual(["Author", "Source", "Topics"]);
  });

  it("returns null for an unknown name", () => {
    expect(getTypeByName("NotARealType")).toBeNull();
  });
});

describe("parseConfigJson", () => {
  const defaults = getConfig();

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
    const result = parseConfigJson(JSON.stringify(validConfig), defaults);
    expect(result.types[0].name).toBe("Recipe");
    expect(result.types[0].color).toEqual({ h: 10, s: 70 });
    expect(result.types[0].fields).toEqual(["Cuisine", "Time"]);
    expect(result.typePrefix).toBe("Type::");
    expect(result.flashColor).toEqual({ r: 16, g: 107, b: 163 });
  });

  it("returns defaults when given an empty string", () => {
    expect(parseConfigJson("", defaults)).toEqual(defaults);
  });

  it("returns defaults when given null", () => {
    expect(parseConfigJson(null, defaults)).toEqual(defaults);
  });

  it("returns defaults when given undefined", () => {
    expect(parseConfigJson(undefined, defaults)).toEqual(defaults);
  });

  it("returns defaults without throwing for invalid JSON '{'", () => {
    expect(() => parseConfigJson("{", defaults)).not.toThrow();
    expect(parseConfigJson("{", defaults)).toEqual(defaults);
  });

  it("returns defaults without throwing for invalid JSON 'not json'", () => {
    expect(() => parseConfigJson("not json", defaults)).not.toThrow();
    expect(parseConfigJson("not json", defaults)).toEqual(defaults);
  });

  it("returns defaults without throwing for valid JSON of the wrong shape (array)", () => {
    expect(() => parseConfigJson("[]", defaults)).not.toThrow();
    expect(parseConfigJson("[]", defaults)).toEqual(defaults);
  });

  it("returns defaults without throwing for valid JSON missing required fields", () => {
    const malformed = '{ "types": "string instead of array" }';
    expect(() => parseConfigJson(malformed, defaults)).not.toThrow();
    expect(parseConfigJson(malformed, defaults)).toEqual(defaults);
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
    const result = parseConfigJson(JSON.stringify(withExtra), defaults);
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
    expect(config.types.map((t) => t.name)).toContain("Organization");
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
    expect(getConfig().types.map((t) => t.name)).toContain("Organization");
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
