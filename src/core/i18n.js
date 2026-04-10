import ja from "../../config/lang/ja.js";
import en from "../../config/lang/en.js";

const dictionaries = { ja, en };
let currentLanguage = "ja";

export function setLanguage(language) {
  currentLanguage = language === "en" ? "en" : "ja";
}

export function getLanguage() {
  return currentLanguage;
}

export function isEnglish() {
  return currentLanguage === "en";
}

export function getDictionary() {
  return dictionaries[currentLanguage] ?? dictionaries.ja;
}

export function t(key, vars = {}) {
  const value = resolvePath(getDictionary(), key) ?? resolvePath(dictionaries.ja, key) ?? key;
  if (typeof value !== "string") return String(value);
  return value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

function resolvePath(obj, key) {
  return key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
}
