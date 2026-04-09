// src/agents/gm.js
// GMエージェント — 場面進行・状況報告・STATEタグパース
 
import { callGM } from "../llm/client.js";
import { GS, playerKnowledge, mergeStateFromTag, addLog } from "../core/gameState.js";
import { formatMemories } from "../llm/memory.js";
 
// ─────────────────────────────────────────────
// GMシステムプロンプト
// ─────────────────────────────────────────────
 
function buildGMSystemPrompt() {
  return `あなたは「NACHTIVIGIL」のGM（ゲームマスター）です。
 
場面の進行と状況管理を担当します。以下を同時に演じます：
①部下・味方捜査官 ②敵スパイ・工作員 ③マスコミ記者（敵対/中立/協力）
④他官庁担当者（警察庁・公安調査庁・CIRO・防衛省情報本部等）
⑤政治アクター ⑥協力者・二重スパイ
 
【ルール】
- 1ターン＝1日。各レスポンス冒頭に「Day ${GS.day}（${GS.date}）:」
- プレイヤーへの行動提案・次手の示唆は絶対禁止
- 情報は客観的かつ詳細に。敵・他機関はリアルに、時に理不尽に動くこと
- グレー・違法捜査も選択肢（リスクと効率を必ず併存させること）
- 難易度: ${GS.difficulty}
- ヒントモード: ${GS.difficulty === "ENCRYPTED" ? "有効" : "無効"}
 
【現在のゲームステート】
- ミッション: ${GS.missionName}（${GS.missionStage} / ${GS.missionStatus}）
- 予算残額: ${GS.budget.toLocaleString()}円
- 要員: ${GS.personnel.available}/${GS.personnel.total}名
- 敵警戒度: ${Math.round(GS.meters.enemyAlertness * 100)}%
- 露出率: ${Math.round(GS.meters.exposureRate * 100)}%
- 報道熱量: ${Math.round(GS.meters.PressHeat * 100)}%
- 適法性: ${Math.round(GS.meters.M_legal * 100)}%
- 証拠連鎖: ${Math.round(GS.meters.chainIntegrity * 100)}%
 
【プレイヤーの確認済み情報】
${buildKnowledgeSummary()}
 
【タグ仕様】
作戦を提案・確認する際のみ末尾直前に:
<OPERATION>{"name":"作戦名","days":日数,"personnel":人数,"cost":費用(円),"description":"概要","risk":"リスク","method":"legal|illegal"}</OPERATION>
 
NPC接触終了時のみ:
<NPCEVENTS>[{"npcId":"...","loyaltyDelta":0,"hostilityDelta":0,"newMemory":"要約","intelGained":{"content":"...","reliability":0.8}}]</NPCEVENTS>
 
ワールド行動（LLM描写生成時のみ）:
<WORLDACTION>{"actor":"...","action":"...","location":"...","significance":3,"discoverable":true,"discoveryMethods":["..."],"expiresDay":10,"narrative":"..."}</WORLDACTION>
 
必ず各レスポンス末尾にSTATEタグ（JSON形式厳守・コメント禁止）:
<STATE>{"meters":{"enemyAlertness":${GS.meters.enemyAlertness},"exposureRate":${GS.meters.exposureRate},"PressHeat":${GS.meters.PressHeat},"M_legal":${GS.meters.M_legal},"chainIntegrity":${GS.meters.chainIntegrity},"auditHeat":${GS.meters.auditHeat}},"leaks":${GS.leaks},"bureaucracyPressure":{},"missionName":"${GS.missionName}","missionStage":"${GS.missionStage}","missionPhaseLevel":${GS.missionPhaseLevel},"missionStatus":"${GS.missionStatus}","sideMissions":[],"scenarioVars":{}}</STATE>`;
}
 
function buildKnowledgeSummary() {
  const facts = playerKnowledge.confirmedFacts;
  if (facts.length === 0) return "（確認済み情報なし）";
  return facts
    .slice(-10)  // 直近10件のみ（プロンプト肥大化防止）
    .map(f => `- [Day ${f.acquiredDay}] ${f.content}`)
    .join("\n");
}
 
// ─────────────────────────────────────────────
// タグパース
// ─────────────────────────────────────────────
 
/**
 * GMレスポンスからすべてのタグを解析して返す
 * @param {string} raw
 * @returns {{ text: string, state: object|null, operation: object|null, npcEvents: object[]|null, worldActions: object[]|null }}
 */
export function parseGMResponse(raw) {
  const result = {
    text:        extractTextOnly(raw),
    state:       null,
    operation:   null,
    npcEvents:   null,
    worldActions: null,
  };
 
  // <STATE>...</STATE>
  const stateMatch = raw.match(/<STATE>([\s\S]*?)<\/STATE>/);
  if (stateMatch) {
    result.state = safeParseJSON(stateMatch[1], "STATE");
  }
 
  // <OPERATION>...</OPERATION>
  const opMatch = raw.match(/<OPERATION>([\s\S]*?)<\/OPERATION>/);
  if (opMatch) {
    result.operation = safeParseJSON(opMatch[1], "OPERATION");
  }
 
  // <NPCEVENTS>...</NPCEVENTS>
  const npcMatch = raw.match(/<NPCEVENTS>([\s\S]*?)<\/NPCEVENTS>/);
  if (npcMatch) {
    result.npcEvents = safeParseJSON(npcMatch[1], "NPCEVENTS");
  }
 
  // <WORLDACTION>...</WORLDACTION>（複数対応）
  const waRegex = /<WORLDACTION>([\s\S]*?)<\/WORLDACTION>/g;
  const worldActions = [];
  let waMatch;
  while ((waMatch = waRegex.exec(raw)) !== null) {
    const wa = safeParseJSON(waMatch[1], "WORLDACTION");
    if (wa) worldActions.push(wa);
  }
  if (worldActions.length > 0) result.worldActions = worldActions;
 
  return result;
}
 
/** タグ部分を除いた本文テキストを返す */
function extractTextOnly(raw) {
  return raw
    .replace(/<STATE>[\s\S]*?<\/STATE>/g, "")
    .replace(/<OPERATION>[\s\S]*?<\/OPERATION>/g, "")
    .replace(/<NPCEVENTS>[\s\S]*?<\/NPCEVENTS>/g, "")
    .replace(/<WORLDACTION>[\s\S]*?<\/WORLDACTION>/g, "")
    .trim();
}
 
/** JSONパース失敗時は null を返す（防御的パース） */
function safeParseJSON(str, tagName) {
  try {
    return JSON.parse(str.trim());
  } catch (e) {
    console.warn(`[GM] ${tagName} のJSONパース失敗:`, e.message, "\n---\n", str.slice(0, 200));
    return null;
  }
}
 
// ─────────────────────────────────────────────
// GM会話履歴
// ─────────────────────────────────────────────
 
/** GMとの会話履歴（直近のみ保持） */
const GM_HISTORY_LIMIT = 20;
const _gmHistory = [];
 
function pushGMHistory(role, content) {
  _gmHistory.push({ role, content });
  if (_gmHistory.length > GM_HISTORY_LIMIT * 2) {
    // 古い方から半分削除
    _gmHistory.splice(0, GM_HISTORY_LIMIT);
  }
}
 
export function clearGMHistory() {
  _gmHistory.length = 0;
}
 
// ─────────────────────────────────────────────
// メインAPI
// ─────────────────────────────────────────────
 
/**
 * プレイヤーの入力をGMに送り、レスポンスをパースして返す。
 * GS の自動更新（STATE タグ適用）も行う。
 *
 * @param {string} playerInput
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {function} [opts.onChunk] - ストリーミング用（将来拡張用。現時点では未使用）
 * @returns {Promise<{ text:string, operation:object|null, npcEvents:object[]|null, worldActions:object[]|null }>}
 */
export async function sendToGM(playerInput, opts = {}) {
  pushGMHistory("user", playerInput);
 
  const systemPrompt = buildGMSystemPrompt();
  const raw = await callGM(systemPrompt, [..._gmHistory], {
    retries: 3,
    signal: opts.signal,
  });
 
  pushGMHistory("assistant", raw);
 
  const parsed = parseGMResponse(raw);
 
  // STATEタグを GS に自動適用
  if (parsed.state) {
    mergeStateFromTag(parsed.state);
  } else {
    console.warn("[GM] STATEタグが見つかりませんでした。GS は更新されません。");
  }
 
  // ログに記録
  addLog("info", `GM応答 (Day ${GS.day})`);
 
  return {
    text:        parsed.text,
    operation:   parsed.operation,
    npcEvents:   parsed.npcEvents,
    worldActions: parsed.worldActions,
  };
}
 
/**
 * ゲーム開始時の初回メッセージをGMから取得する
 * @param {string} scenarioTitle
 * @returns {Promise<string>}
 */
export async function getOpeningMessage(scenarioTitle) {
  const prompt = `シナリオ「${scenarioTitle}」が開始されました。Day 1の状況を簡潔に説明し、プレイヤーの最初の任務概要を提示してください。`;
  const result = await sendToGM(prompt);
  return result.text;
}