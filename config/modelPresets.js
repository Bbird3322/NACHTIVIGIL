const MODEL_PRESETS = {
  ollama: {
    ultra: {
      label: "高負荷 31b / 26b",
      gm: { model: "gemma4:31b", thinking: false },
      npc: { model: "gemma4:26b", thinking: false },
    },
    high: {
      label: "標準 26b / e4b",
      gm: { model: "gemma4:26b", thinking: false },
      npc: { model: "gemma4:e4b", thinking: false },
    },
    mid: {
      label: "軽量 e4b / e4b",
      gm: { model: "gemma4:e4b", thinking: false },
      npc: { model: "gemma4:e4b", thinking: false },
    },
    custom: {
      label: "カスタム",
      gm: { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
  openrouter: {
    free: {
      label: "無料 26b / 26b",
      gm: { model: "google/gemma-4-26b-a4b-it:free", thinking: false },
      npc: { model: "google/gemma-4-26b-a4b-it:free", thinking: false },
    },
    paid_light: {
      label: "有料 26b / 軽量",
      gm: { model: "google/gemma-4-26b-a4b-it", thinking: false },
      npc: { model: "google/gemma-4-26b-a4b-it:free", thinking: false },
    },
    paid_full: {
      label: "有料 26b / 26b",
      gm: { model: "google/gemma-4-26b-a4b-it", thinking: false },
      npc: { model: "google/gemma-4-26b-a4b-it", thinking: false },
    },
    custom: {
      label: "カスタム",
      gm: { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
  anthropic: {
    default: {
      label: "Claude 標準",
      gm: { model: "claude-sonnet-4-6", thinking: false },
      npc: { model: "claude-haiku-4-5-20251001", thinking: false },
    },
    custom: {
      label: "カスタム",
      gm: { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
};

const DEFAULT_CFG = {
  provider: "ollama",
  ollamaUrl: "http://localhost:11434",
  apiKey: "",
  language: "ja",
  preset: "high",
  ignoreRamCheck: false,
  gm: { model: "gemma4:26b", thinking: false },
  npc: { model: "gemma4:e4b", thinking: false },
};

const STORAGE_KEY = "nachtivigil_llm_cfg";

export function loadCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CFG);
    const merged = {
      ...structuredClone(DEFAULT_CFG),
      ...JSON.parse(raw),
    };
    return normalizeCfg(merged);
  } catch {
    return structuredClone(DEFAULT_CFG);
  }
}

export function saveCfg(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeCfg(cfg)));
}

export function resolvePreset(provider, preset) {
  return MODEL_PRESETS[provider]?.[preset] ?? null;
}

export function normalizeCfg(cfg) {
  const provider = cfg.provider in MODEL_PRESETS ? cfg.provider : DEFAULT_CFG.provider;
  const availablePresets = MODEL_PRESETS[provider];
  const requestedPreset = cfg.preset in availablePresets ? cfg.preset : defaultPresetForProvider(provider);
  const preset = resolvePreset(provider, requestedPreset);

  let normalized = {
    ...structuredClone(DEFAULT_CFG),
    ...cfg,
    provider,
    language: cfg.language === "en" ? "en" : "ja",
    preset: requestedPreset,
    ignoreRamCheck: Boolean(cfg.ignoreRamCheck),
    gm: { ...structuredClone(DEFAULT_CFG.gm), ...cfg.gm },
    npc: { ...structuredClone(DEFAULT_CFG.npc), ...cfg.npc },
  };

  if (requestedPreset !== "custom" && preset) {
    normalized = {
      ...normalized,
      gm: { ...preset.gm },
      npc: { ...preset.npc },
    };
  }

  if (!isModelValidForProvider(provider, normalized.gm.model) || !isModelValidForProvider(provider, normalized.npc.model)) {
    const fallbackPreset = resolvePreset(provider, defaultPresetForProvider(provider));
    normalized = {
      ...normalized,
      preset: defaultPresetForProvider(provider),
      gm: { ...fallbackPreset.gm },
      npc: { ...fallbackPreset.npc },
    };
  }

  return normalized;
}

function defaultPresetForProvider(provider) {
  switch (provider) {
    case "openrouter":
      return "free";
    case "anthropic":
      return "default";
    case "ollama":
    default:
      return "high";
  }
}

function isModelValidForProvider(provider, model) {
  if (!model) return false;
  switch (provider) {
    case "openrouter":
      return model.includes("/");
    case "anthropic":
      return !model.includes("/");
    case "ollama":
      return model.startsWith("gemma4");
    default:
      return true;
  }
}

export { DEFAULT_CFG, MODEL_PRESETS };
