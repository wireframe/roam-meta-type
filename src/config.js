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

export function getConfig() {
  return DEFAULT_CONFIG;
}

export function getTypeByName(name) {
  return DEFAULT_CONFIG.types.find((type) => type.name === name) || null;
}
