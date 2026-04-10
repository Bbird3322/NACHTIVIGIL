import { loadCfg, normalizeCfg } from "../../config/modelPresets.js";

let CFG = loadCfg();
const isEnglish = () => CFG.language === "en";

export function setCfg(newCfg) {
  CFG = normalizeCfg({ ...CFG, ...newCfg });
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
    throw new Error(isEnglish() ? "Model is not configured. Choose a model in Settings." : "モデルが未設定です。設定画面でモデルを選択してください。");
  }

  if (CFG.provider === "openrouter" && !CFG.apiKey) {
    throw new Error(isEnglish() ? "OpenRouter requires an API key." : "OpenRouter を使うには APIキーが必要です。");
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

  throw new Error(isEnglish() ? "LLM call failed." : "LLM 呼び出しに失敗しました。");
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
      throw new Error(isEnglish() ? `Unknown provider: ${CFG.provider}` : `不明なプロバイダです: ${CFG.provider}`);
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
      return new Error(isEnglish() ? `OpenRouter rejected model "${model}". Use an OpenRouter model ID like "google/gemma-4-26b-a4b-it:free".` : `OpenRouter がモデル「${model}」を拒否しました。"google/gemma-4-26b-a4b-it:free" のような OpenRouter 用IDを指定してください。`);
    }
    if (status === 401 || status === 403) {
      return new Error(isEnglish() ? "OpenRouter authentication failed. Check your API key." : "OpenRouter の認証に失敗しました。APIキーを確認してください。");
    }
  }

  if (CFG.provider === "ollama") {
    if (status === 500 && text.toLowerCase().includes("requires more system memory")) {
      return CFG.ignoreRamCheck
        ? new Error(isEnglish() ? `Ollama reported insufficient memory. Disabling the RAM check cannot bypass Ollama's real memory requirement. Use a lighter model than "${model}".` : `Ollama がメモリ不足を返しました。RAM制限チェックを無効化しても、Ollama 本体の必要メモリ制限は超えられません。モデル「${model}」を軽量化してください。`)
        : new Error(isEnglish() ? `Ollama ran out of memory. Model "${model}" is too heavy for the currently available RAM. Switch to a lighter preset or free up memory.` : `Ollama でメモリ不足が発生しました。モデル「${model}」は現在の空きRAMでは重すぎます。より軽いプリセットへ切り替えるか、RAMを確保してください。`);
    }
    if (status === 404 && text.toLowerCase().includes("model")) {
      return new Error(isEnglish() ? `Ollama model "${model}" is not installed locally. Run "ollama pull ${model}".` : `Ollama モデル「${model}」がローカルにありません。"ollama pull ${model}" を実行してください。`);
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
    throw new Error(isEnglish() ? `Could not reach Ollama at ${CFG.ollamaUrl}. Make sure "ollama serve" is running and browser access is allowed.` : `Ollama (${CFG.ollamaUrl}) に接続できません。"ollama serve" が起動していて、ブラウザからアクセス可能か確認してください。`);
  }

  if (!response.ok) {
    throw new Error(isEnglish() ? `Ollama is reachable, but /api/tags returned HTTP ${response.status}.` : `Ollama には接続できましたが、/api/tags が HTTP ${response.status} を返しました。`);
  }

  const data = await response.json().catch(() => ({ models: [] }));
  const names = (data.models ?? []).map((entry) => entry.name);
  if (!names.includes(model)) {
    const installed = isEnglish()
      ? (names.length ? `Installed models: ${names.join(", ")}` : "No Ollama models are installed yet.")
      : (names.length ? `インストール済みモデル: ${names.join(", ")}` : "まだ Ollama モデルがインストールされていません。");
    throw new Error(isEnglish() ? `Ollama model "${model}" is not available locally. ${installed} Run "ollama pull ${model}".` : `Ollama モデル「${model}」はローカルで利用できません。${installed} "ollama pull ${model}" を実行してください。`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
