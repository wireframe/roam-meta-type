import { getConfig, getTypeByName } from "./config.js";

export function getCurrentPageTitle() {
  const titleEl = document.querySelector(".rm-title-display");
  if (!titleEl) return null;
  return titleEl.textContent.trim();
}

export async function getPageUid(pageTitle) {
  const result = await window.roamAlphaAPI.q(
    `[:find ?uid :in $ ?title :where [?e :node/title ?title] [?e :block/uid ?uid]]`,
    pageTitle
  );
  if (result && result.length > 0) return result[0][0];
  return null;
}

export function parsePageRefs(blockString) {
  const refs = [];
  const hashMatches = blockString.match(/#[\w-]+/g) || [];
  hashMatches.forEach(ref => refs.push(ref.substring(1)));
  const bracketMatches = blockString.match(/\[\[([^\]]+)\]\]/g) || [];
  bracketMatches.forEach(ref => refs.push(ref.slice(2, -2)));
  return refs;
}

export async function detectTypes(pageUid) {
  const prefix = getConfig().typePrefix;
  const query = `[:find ?string
                  :in $ ?pageUid ?prefix
                  :where [?p :block/uid ?pageUid]
                         [?p :block/children ?b]
                         [?b :block/string ?string]
                         [(clojure.string/starts-with? ?string ?prefix)]]`;

  const results = await window.roamAlphaAPI.q(query, pageUid, prefix);
  if (!results || results.length === 0) return [];

  const typeNames = [];
  results.forEach(([blockString]) => {
    const value = blockString.substring(prefix.length);
    parsePageRefs(value).forEach(ref => {
      if (getTypeByName(ref)) typeNames.push(ref);
    });
  });

  return typeNames;
}

export async function readFieldValue(pageUid, fieldName) {
  const prefix = fieldName + "::";
  const query = `[:find ?uid ?string
                  :in $ ?pageUid ?prefix
                  :where [?p :block/uid ?pageUid]
                         [?p :block/children ?b]
                         [?b :block/string ?string]
                         [?b :block/uid ?uid]
                         [(clojure.string/starts-with? ?string ?prefix)]]`;

  const results = await window.roamAlphaAPI.q(query, pageUid, prefix);
  if (!results || results.length === 0) return { uid: null, value: "" };

  const [uid, blockString] = results[0];
  const value = blockString.substring(prefix.length).trim();
  return { uid, value };
}

export async function readAllFields(pageUid, fields) {
  const entries = await Promise.all(
    fields.map(async (field) => [field, await readFieldValue(pageUid, field)])
  );
  return Object.fromEntries(entries);
}

export async function createFieldBlock(pageUid, fieldName) {
  await window.roamAlphaAPI.createBlock({
    location: { "parent-uid": pageUid, order: 0 },
    block: { string: `${fieldName}:: ` }
  });
  const { uid } = await readFieldValue(pageUid, fieldName);
  return uid;
}
