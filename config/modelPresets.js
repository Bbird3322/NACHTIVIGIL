// config/modelPresets.js
// GMとNPCの2トラック構成。thinkingは全モデルで必ずオフ
 
export const MODEL_PRESETS = {
  ollama: {
    ultra: {
      label: "Ultra（VRAM 24GB〜）",
      gm:  { model: "gemma4:26b",  thinking: false },
      npc: { model: "gemma4:12b",  thinking: false },
    },
    high: {
      label: "High（VRAM 16GB〜）",
      gm:  { model: "gemma4:12b",  thinking: false },
      npc: { model: "gemma4:e4b",  thinking: false },
    },
    mid: {
      label: "Mid（VRAM 8GB〜）",
      gm:  { model: "gemma4:e4b",  thinking: false },
      npc: { model: "gemma4:e4b",  thinking: false },
    },
    custom: {
      label: "カスタム",
      gm:  { model: "",            thinking: false },
      npc: { model: "",            thinking: false },
    },
  },
  openrouter: {
    free: {
      label: "Free（無料枠）",
      gm:  { model: "google/gemma-3-27b-it:free", thinking: false },
      npc: { model: "google/gemma-3-12b-it:free", thinking: false },
    },
    paid_light: {
      label: "Paid-Light（GM分のみ課金）",
      gm:  { model: "google/gemma-4-26b-a4b-it",  thinking: false },
      npc: { model: "google/gemma-3-12b-it:free",  thinking: false },
    },
    paid_full: {
      label: "Paid-Full（本番品質）",
      gm:  { model: "google/gemma-4-26b-a4b-it",  thinking: false },
      npc: { model: "google/gemma-4-26b-a4b-it",  thinking: false },
    },
    custom: {
      label: "カスタム",
      gm:  { model: "",            thinking: false },
      npc: { model: "",            thinking: false },
    },
  },
  anthropic: {
    default: {
      label: "Claude（フォールバック）",
      gm:  { model: "claude-sonnet-4-6", thinking: false },
      npc: { model: "claude-haiku-4-5-20251001", thinking: false },
    },
    custom: {
      label: "カスタム",
      gm:  { model: "",            thinking: false },
      npc: { model: "",            thinking: false },
    },
  },
};
 
// localStorage に永続化するデフォルト設定
export const DEFAULT_CFG = {
  provider:  "ollama",
  ollamaUrl: "http://localhost:11434",
  apiKey:    "",
  preset:    "high",
  gm:  { model: "gemma4:12b",  thinking: false },
  npc: { model: "gemma4:e4b",  thinking: false },
};
 
/** 設定を localStorage から読み込む */
export function loadCfg() {
  try {
    const raw = localStorage.getItem("noctivigil_llm_cfg");
    if (!raw) return { ...DEFAULT_CFG };
    return { ...DEFAULT_CFG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CFG };
  }
}
 
/** 設定を localStorage に保存する */
export function saveCfg(cfg) {
  localStorage.setItem("noctivigil_llm_cfg", JSON.stringify(cfg));
}
 
/** プリセットからGM/NPCモデル設定を取得する */
export function resolvePreset(provider, preset) {
  return MODEL_PRESETS[provider]?.[preset] ?? null;
}