export const SETTINGS_KEY = "types-config";

let currentConfig = null;

const DEFAULT_CONFIG = {
  types: [
    {
      name: "Organization",
      color: { h: 217, s: 60 },
      fields: ["Website", "Phone", "Address"],
    },
    {
      name: "Person",
      color: { h: 32, s: 70 },
      fields: ["Email", "Phone", "Organization", "Role", "Location", "LinkedIn"],
    },
    {
      name: "Project",
      color: { h: 158, s: 50 },
      fields: ["Status", "Priority", "Due", "Topics"],
    },
    {
      name: "Blog",
      color: { h: 262, s: 55 },
      fields: ["Source"],
    },
    {
      name: "document",
      color: { h: 215, s: 14 },
      fields: ["Author", "Source", "Topics"],
    },
    {
      name: "article",
      color: { h: 350, s: 60 },
      fields: ["Author", "Source", "Topics"],
    },
    {
      name: "book",
      color: { h: 199, s: 60 },
      fields: ["Author", "Source", "Topics"],
    },
  ],
  typePrefix: "Type::",
  flashColor: { r: 16, g: 107, b: 163 },
};

// Call getConfig() afresh at use time — do not cache the return across awaits or React renders.
export function getConfig() {
  return currentConfig || DEFAULT_CONFIG;
}

export function setConfig(config) {
  currentConfig = config;
}

export function loadConfigFromSettings(extensionAPI) {
  const raw = extensionAPI.settings.get(SETTINGS_KEY);
  setConfig(parseConfigJson(raw, DEFAULT_CONFIG));
}

export function getTypeByName(name) {
  return getConfig().types.find((type) => type.name === name) || null;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidShape(parsed) {
  return (
    isPlainObject(parsed) &&
    Array.isArray(parsed.types) &&
    typeof parsed.typePrefix === "string" &&
    isPlainObject(parsed.flashColor)
  );
}

export function parseConfigJson(jsonString, defaults) {
  if (jsonString === null || jsonString === undefined || jsonString === "") {
    return defaults;
  }
  try {
    const parsed = JSON.parse(jsonString);
    if (!hasValidShape(parsed)) {
      console.warn("[meta-type] settings JSON has wrong shape (expected { types, typePrefix, flashColor }), using defaults");
      return defaults;
    }
    return parsed;
  } catch (error) {
    console.warn("[meta-type] settings JSON failed to parse:", error.message);
    return defaults;
  }
}
