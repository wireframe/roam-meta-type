export const SETTINGS_KEY = "types-config";

let currentConfig = null;

const DEFAULT_CONFIG = {
  types: [],
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
  setConfig(parseConfigJson(raw));
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

export function parseConfigJson(jsonString) {
  if (jsonString === null || jsonString === undefined || jsonString === "") {
    return DEFAULT_CONFIG;
  }
  try {
    const parsed = JSON.parse(jsonString);
    if (!hasValidShape(parsed)) {
      console.warn("[meta-type] settings JSON has wrong shape (expected { types, typePrefix, flashColor }), using defaults");
      return DEFAULT_CONFIG;
    }
    return parsed;
  } catch (error) {
    console.warn("[meta-type] settings JSON failed to parse:", error.message);
    return DEFAULT_CONFIG;
  }
}
