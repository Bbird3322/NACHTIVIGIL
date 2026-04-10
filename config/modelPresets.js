const MODEL_PRESETS = {
  ollama: {
    ultra: {
      label: "Ultra (RAM 24GB)",
      gm: { model: "gemma4:26b", thinking: false },
      npc: { model: "gemma4:12b", thinking: false },
    },
    high: {
      label: "High (RAM 16GB)",
      gm: { model: "gemma4:12b", thinking: false },
      npc: { model: "gemma4:e4b", thinking: false },
    },
    mid: {
      label: "Mid (RAM 8GB)",
      gm: { model: "gemma4:e4b", thinking: false },
      npc: { model: "gemma4:e4b", thinking: false },
    },
    custom: {
      label: "Custom",
      gm: { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
  openrouter: {
    free: {
      label: "Free",
      gm: { model: "google/gemma-3-27b-it:free", thinking: false },
      npc: { model: "google/gemma-3-12b-it:free", thinking: false },
    },
    paid_light: {
      label: "Paid Light",
      gm: { model: "google/gemma-4-26b-a4b-it", thinking: false },
      npc: { model: "google/gemma-3-12b-it:free", thinking: false },
    },
    paid_full: {
      label: "Paid Full",
      gm: { model: "google/gemma-4-26b-a4b-it", thinking: false },
      npc: { model: "google/gemma-4-26b-a4b-it", thinking: false },
    },
    custom: {
      label: "Custom",
      gm: { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
  anthropic: {
    default: {
      label: "Claude",
      gm: { model: "claude-sonnet-4-6", thinking: false },
      npc: { model: "claude-haiku-4-5-20251001", thinking: false },
    },
    custom: {
      label: "Custom",
      gm: { model: "", thinking: false },
      npc: { model: "", thinking: false },
    },
  },
};

const DEFAULT_CFG = {
  provider: "ollama",
  ollamaUrl: "http://localhost:11434",
  apiKey: "",
  preset: "high",
  gm: { model: "gemma4:12b", thinking: false },
  npc: { model: "gemma4:e4b", thinking: false },
};

const STORAGE_KEY = "nachtivigil_llm_cfg";

export function loadCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_CFG);
    return {
      ...structuredClone(DEFAULT_CFG),
      ...JSON.parse(raw),
    };
  } catch {
    return structuredClone(DEFAULT_CFG);
  }
}

export function saveCfg(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function resolvePreset(provider, preset) {
  return MODEL_PRESETS[provider]?.[preset] ?? null;
}

export { DEFAULT_CFG, MODEL_PRESETS };
