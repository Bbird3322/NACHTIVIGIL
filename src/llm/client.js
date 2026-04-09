// src/llm/client.js
// LLM呼び出し — プロバイダ切り替え・2トラック（GM/NPC）・指数バックオフリトライ
 
import { loadCfg } from "../../config/modelPresets.js";
 
/** 現在の設定（ゲーム起動時に loadCfg() で初期化） */
let CFG = loadCfg();
 
/** 設定を外部から差し替える（difficultyUI.js / 接続テスト用） */
export function setCfg(newCfg) {
  CFG = { ...CFG, ...newCfg };
}
 
export function getCfg() {
  return CFG;
}
 
// ─────────────────────────────────────────────
// 公開API
// ─────────────────────────────────────────────
 
/**
 * GMエージェント呼び出し
 * @param {string} systemPrompt
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts]
 * @param {number} [opts.retries=3]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>}
 */
export async function callGM(systemPrompt, messages, opts = {}) {
  return _call(CFG.gm, systemPrompt, messages, opts);
}
 
/**
 * NPCエージェント呼び出し
 * @param {string} systemPrompt
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts]
 * @param {number} [opts.retries=3]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>}
 */
export async function callNPC(systemPrompt, messages, opts = {}) {
  return _call(CFG.npc, systemPrompt, messages, opts);
}
 
/**
 * 接続テスト（GMモデルに「こんにちは」を送ってレスポンスタイムを返す）
 * @returns {Promise<{ok:boolean, gmMs:number|null, npcMs:number|null, error:string|null}>}
 */
export async function testConnection() {
  const ping = async (modelCfg) => {
    const start = Date.now();
    try {
      await _call(modelCfg, "あなたはAIアシスタントです。", [
        { role: "user", content: "こんにちは" },
      ], { retries: 1 });
      return { ok: true, ms: Date.now() - start };
    } catch (e) {
      return { ok: false, ms: null, error: String(e) };
    }
  };
 
  const [gm, npc] = await Promise.all([ping(CFG.gm), ping(CFG.npc)]);
  return {
    ok: gm.ok && npc.ok,
    gmMs: gm.ms,
    npcMs: npc.ms,
    error: gm.error ?? npc.error ?? null,
  };
}
 
// ─────────────────────────────────────────────
// 内部実装
// ─────────────────────────────────────────────
 
async function _call(modelCfg, systemPrompt, messages, opts = {}) {
  const { retries = 3, signal } = opts;
 
  if (!modelCfg.model) {
    throw new Error("モデルが設定されていません。設定画面でモデルを指定してください。");
  }
 
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const body = _buildBody(modelCfg, systemPrompt, messages);
      const res = await fetch(_getEndpoint(), {
        method: "POST",
        headers: _buildHeaders(),
        body: JSON.stringify(body),
        signal,
      });
 
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // 429 Rate Limit: 指数バックオフ後リトライ
        if (res.status === 429 && attempt < retries - 1) {
          const waitMs = Math.min(4000 * Math.pow(2, attempt), 30000);
          console.warn(`[LLM] 429 Rate Limit. ${waitMs}ms 待機後リトライ (${attempt + 1}/${retries})`);
          await _sleep(waitMs);
          continue;
        }
        // 5xx サーバーエラー: リトライ
        if (res.status >= 500 && attempt < retries - 1) {
          const waitMs = 2000 * Math.pow(2, attempt);
          console.warn(`[LLM] HTTP ${res.status}. ${waitMs}ms 待機後リトライ`);
          await _sleep(waitMs);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
 
      const data = await res.json();
      return _extractText(data);
 
    } catch (e) {
      // AbortSignal によるキャンセルはリトライしない
      if (e.name === "AbortError") throw e;
      // ネットワークエラー: リトライ
      if (attempt < retries - 1) {
        const waitMs = 2000 * Math.pow(2, attempt);
        console.warn(`[LLM] ネットワークエラー: ${e.message}. ${waitMs}ms 待機後リトライ`);
        await _sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
}
 
function _buildBody(modelCfg, systemPrompt, messages) {
  const provider = CFG.provider;
 
  // Anthropic形式（claude系モデル）
  if (provider === "anthropic") {
    return {
      model:      modelCfg.model,
      max_tokens: 2048,
      system:     systemPrompt,
      messages,
    };
  }
 
  // OpenAI互換形式（Ollama / OpenRouter 共通）
  const base = {
    model:    modelCfg.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream:   false,
  };
 
  if (provider === "ollama") {
    return {
      ...base,
      options: {
        temperature:    0.7,
        top_p:          0.95,
        top_k:          64,
        repeat_penalty: 1.0,
        num_ctx:        8192,    // デフォルト2048では長いセッションに不足
      },
    };
  }
 
  if (provider === "openrouter") {
    // Gemma 4: reasoning を必ずオフ（有効だとSTATEタグのJSONが壊れる）
    const extra = modelCfg.thinking === false
      ? { reasoning: { enabled: false } }
      : {};
    return { ...base, ...extra };
  }
 
  return base;
}
 
function _getEndpoint() {
  switch (CFG.provider) {
    case "ollama":
      return `${CFG.ollamaUrl}/v1/chat/completions`;
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    default:
      throw new Error(`未知のプロバイダ: ${CFG.provider}`);
  }
}
 
function _buildHeaders() {
  const h = { "Content-Type": "application/json" };
  if (CFG.provider === "openrouter" && CFG.apiKey) {
    h["Authorization"] = `Bearer ${CFG.apiKey}`;
    h["HTTP-Referer"] = window.location.origin;
    h["X-Title"] = "NACHTIVIGIL";
  }
  if (CFG.provider === "anthropic" && CFG.apiKey) {
    h["x-api-key"] = CFG.apiKey;
    h["anthropic-version"] = "2023-06-01";
  }
  return h;
}
 
function _extractText(data) {
  // Anthropic形式
  if (Array.isArray(data.content)) {
    const textBlock = data.content.find(b => b.type === "text");
    if (textBlock?.text) return textBlock.text;
  }
  // OpenAI互換形式（Ollama / OpenRouter）
  const choice = data.choices?.[0];
  return choice?.message?.content ?? choice?.text ?? "";
}
 
const _sleep = ms => new Promise(r => setTimeout(r, ms));