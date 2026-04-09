// src/llm/memory.js
// NPC記憶の3段階管理と自動要約
// 段階1: memories[]（軽量・永続イベントメモ）
// 段階2: recentHistory[]（直近10件の会話履歴）
// 段階3: 接触終了後の自動要約（LLM使用）
 
import { callNPC } from "./client.js";
import { registry } from "../agents/registry.js";
import { GS } from "../core/gameState.js";
 
const HISTORY_LIMIT = 10;
 
const SUMMARY_SYSTEM = `あなたは会話記録の要約担当です。
与えられた会話から、情報担当者が後日参照すべき重要事項のみを1〜2文で簡潔に要約してください。
感情・雰囲気・接触状況なども含めること。日本語で出力すること。`;
 
/**
 * 接触終了後の自動要約処理
 * recentHistory が HISTORY_LIMIT を超えた分を summarize して memories に移動する
 * @param {string} npcId
 * @returns {Promise<void>}
 */
export async function summarizeContact(npcId) {
  const npc = registry.get(npcId);
  if (!npc) return;
 
  const history = npc.recentHistory ?? [];
  if (history.length === 0) return;
 
  try {
    const summary = await callNPC(SUMMARY_SYSTEM, [
      {
        role: "user",
        content: `以下の会話から重要事項を1〜2文で要約してください:\n${JSON.stringify(history, null, 2)}`,
      },
    ], { retries: 2 });
 
    npc.memories = npc.memories ?? [];
    npc.memories.push({ day: GS.day, event: summary.trim() });
 
    // recentHistory を上限以内に切り詰める
    npc.recentHistory = history.slice(-HISTORY_LIMIT);
 
  } catch (e) {
    // 要約失敗時はイベントログのみ記録（ゲーム進行は止めない）
    console.warn(`[memory] ${npcId} の要約失敗:`, e.message);
    npc.memories = npc.memories ?? [];
    npc.memories.push({
      day: GS.day,
      event: `（要約失敗）接触あり。ターン数: ${history.length}`,
    });
    npc.recentHistory = history.slice(-HISTORY_LIMIT);
  }
}
 
/**
 * NPC の会話履歴に1件追加する。
 * HISTORY_LIMIT を超えた場合は超過分を自動的に要約キューに積む（非同期）。
 * @param {string} npcId
 * @param {"user"|"assistant"} role
 * @param {string} content
 */
export function pushHistory(npcId, role, content) {
  const npc = registry.get(npcId);
  if (!npc) return;
 
  npc.recentHistory = npc.recentHistory ?? [];
  npc.recentHistory.push({ role, content });
 
  // 上限超過したらバックグラウンドで要約（await しない）
  if (npc.recentHistory.length > HISTORY_LIMIT * 2) {
    summarizeContact(npcId).catch(console.warn);
  }
}
 
/**
 * NPC の memories を自然言語の文字列にフォーマットする
 * @param {Array<{day:number, event:string}>} memories
 * @returns {string}
 */
export function formatMemories(memories) {
  if (!memories || memories.length === 0) return "（過去の接触記録なし）";
  return memories
    .map(m => `Day ${m.day}: ${m.event}`)
    .join("\n");
}
 
/**
 * NPC の recentHistory を文字列にフォーマットする（デバッグ用）
 * @param {Array<{role:string, content:string}>} history
 * @returns {string}
 */
export function formatHistory(history) {
  if (!history || history.length === 0) return "（会話履歴なし）";
  return history
    .map(h => `[${h.role}] ${h.content}`)
    .join("\n");
}