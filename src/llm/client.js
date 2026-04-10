import { loadCfg, normalizeCfg } from "../../config/modelPresets.js";
import { setLanguage, t } from "../core/i18n.js";

let CFG = loadCfg();
setLanguage(CFG.language);

export function setCfg(newCfg) {
  CFG = normalizeCfg({ ...CFG, ...newCfg });
  setLanguage(CFG.language);
}

export function getCfg() {
  return CFG;
}

export async function callGM(systemPrompt, messages, opts = {}) {
  return callModel(CFG.gm, systemPrompt, messages, opts);
}

export async function callNPC(systemPrompt, messages, opts = {}) {
  return callModel(CFG.npc, systemPrompt, messages, opts);
}

export async function testConnection() {
  const ping = async (modelCfg) => {
    const start = Date.now();
    try {
      await callModel(
        modelCfg,
        "You are a test assistant. Reply briefly.",
        [{ role: "user", content: "Ping" }],
        { retries: 1 },
      );
      return { ok: true, ms: Date.now() - start };
    } catch (error) {
      return { ok: false, ms: null, error: String(error) };
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

async function callModel(modelCfg, systemPrompt, messages, opts = {}) {
  const { retries = 3, signal } = opts;

  if (!modelCfg?.model) {
    throw new Error(t("client.modelNotConfigured"));
  }

  if (CFG.provider === "openrouter" && !CFG.apiKey) {
    throw new Error(t("client.openrouterApiKeyRequired"));
  }

  if (CFG.provider === "ollama") {
    await assertOllamaModelAvailable(modelCfg.model, signal);
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const endpoint = getEndpoint();
      const body = buildBody(modelCfg, systemPrompt, messages);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if ((res.status === 429 || res.status >= 500) && attempt < retries - 1) {
          await sleep(Math.min(2000 * 2 ** attempt, 10000));
          continue;
        }
        throw buildProviderError(res.status, text, modelCfg.model);
      }

      const data = await res.json();
      return extractText(data);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (attempt < retries - 1) {
        await sleep(Math.min(2000 * 2 ** attempt, 10000));
        continue;
      }
      throw error;
    }
  }

  throw new Error(t("client.llmCallFailed"));
}

function buildBody(modelCfg, systemPrompt, messages) {
  if (CFG.provider === "anthropic") {
    return {
      model: modelCfg.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      thinking: { type: "disabled" },
    };
  }

  const base = {
    model: modelCfg.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
    think: false,
    reasoning: { enabled: false },
  };

  if (CFG.provider === "ollama") {
    return {
      ...base,
      options: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 64,
        repeat_penalty: 1,
        num_ctx: normalizeNumCtx(CFG.ollamaNumCtx),
      },
    };
  }

  if (CFG.provider === "openrouter") {
    return {
      ...base,
      plugins: [],
    };
  }

  return base;
}

function normalizeNumCtx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8192;
  return Math.max(8192, Math.floor(parsed));
}

function getEndpoint() {
  switch (CFG.provider) {
    case "ollama":
      return `${CFG.ollamaUrl}/v1/chat/completions`;
    case "openrouter":
      return "https://openrouter.ai/api/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    default:
      throw new Error(t("client.unknownProvider", { provider: CFG.provider }));
  }
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };

  if (CFG.provider === "openrouter" && CFG.apiKey) {
    headers.Authorization = `Bearer ${CFG.apiKey}`;
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "NACHTIVIGIL";
  }

  if (CFG.provider === "anthropic" && CFG.apiKey) {
    headers["x-api-key"] = CFG.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  return headers;
}

function extractText(data) {
  if (Array.isArray(data.content)) {
    const textBlock = data.content.find((block) => block.type === "text");
    if (textBlock?.text) return textBlock.text;
  }

  const choice = data.choices?.[0];
  return choice?.message?.content ?? choice?.text ?? "";
}

function buildProviderError(status, text, model) {
  if (CFG.provider === "openrouter") {
    if (status === 400 && text.includes("valid model ID")) {
      return new Error(t("client.openrouterInvalidModel", { model }));
    }
    if (status === 401 || status === 403) {
      return new Error(t("client.openrouterAuthFailed"));
    }
  }

  if (CFG.provider === "ollama") {
    if (status === 500 && text.toLowerCase().includes("requires more system memory")) {
      return new Error(t(CFG.ignoreRamCheck ? "client.ollamaMemoryIgnore" : "client.ollamaMemory", { model }));
    }
    if (status === 404 && text.toLowerCase().includes("model")) {
      return new Error(t("client.ollamaModelMissing", { model }));
    }
  }

  return new Error(`HTTP ${status}: ${text.slice(0, 200)}`);
}

async function assertOllamaModelAvailable(model, signal) {
  const tagsUrl = `${CFG.ollamaUrl}/api/tags`;
  let response;

  try {
    response = await fetch(tagsUrl, { signal });
  } catch {
    throw new Error(t("client.ollamaUnreachable", { url: CFG.ollamaUrl }));
  }

  if (!response.ok) {
    throw new Error(t("client.ollamaTagsHttp", { status: response.status }));
  }

  const data = await response.json().catch(() => ({ models: [] }));
  const names = (data.models ?? []).map((entry) => entry.name);
  if (!names.includes(model)) {
    const installed = names.length
      ? t("client.ollamaInstalledModels", { models: names.join(", ") })
      : t("client.ollamaNoModels");
    throw new Error(t("client.ollamaModelUnavailable", { model, installed }));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
