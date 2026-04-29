import { describe, it, expect } from "vitest";
import { getConfig, getTypeByName } from "../src/config.js";

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
