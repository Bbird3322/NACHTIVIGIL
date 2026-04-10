import { loadCfg } from "../../config/modelPresets.js";

let CFG = loadCfg();

export function setCfg(newCfg) {
  CFG = { ...CFG, ...newCfg };
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
    throw new Error("Model is not configured. Open settings and choose a model.");
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(getEndpoint(), {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(buildBody(modelCfg, systemPrompt, messages)),
        signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if ((res.status === 429 || res.status >= 500) && attempt < retries - 1) {
          await sleep(Math.min(2000 * 2 ** attempt, 10000));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
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

  throw new Error("LLM call failed.");
}

function buildBody(modelCfg, systemPrompt, messages) {
  if (CFG.provider === "anthropic") {
    return {
      model: modelCfg.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    };
  }

  const base = {
    model: modelCfg.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
  };

  if (CFG.provider === "ollama") {
    return {
      ...base,
      options: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 64,
        repeat_penalty: 1,
        num_ctx: 8192,
      },
    };
  }

  if (CFG.provider === "openrouter") {
    return modelCfg.thinking === false
      ? { ...base, reasoning: { enabled: false } }
      : base;
  }

  return base;
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
      throw new Error(`Unknown provider: ${CFG.provider}`);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
