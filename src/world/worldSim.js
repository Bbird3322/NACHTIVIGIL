// src/world/worldSim.js
// ワールドシミュレーター — 毎ターン全NPCの行動生成
// ルールベース優先。複雑な接触シーンのみ LLM で描写生成。
 
import { GS, addLog }                        from "../core/gameState.js";
import { advanceDay, checkInstantFail }       from "../core/mechanics.js";
import { registry }                           from "../agents/registry.js";
import { decideAction }                       from "./actionRules.js";
import {
  addWorldEvent, addIntel, patchNpcState,
  getNpcState, worldEvents,
}                                             from "./worldDB.js";
import { callGM }                             from "../llm/client.js";
import { drawEvents }                         from "./eventDB.js";
 
// ─────────────────────────────────────────────
// 行動 → ワールドイベント変換マップ
// ─────────────────────────────────────────────
 
/**
 * 行動名をワールドイベントパラメータに変換する
 * @param {string} action
 * @param {object} npc
 * @param {object} npcState
 * @returns {object} addWorldEvent に渡すパラメータ
 */
function actionToEventParams(action, npc, npcState) {
  const base = {
    actor:            npc.id,
    action,
    location:         npcState?.location ?? "不明",
    significance:     1,
    discoverable:     true,
    phaseRequired:    0,
  };
 
  switch (action) {
    case "dead_drop":
      return { ...base, description: `${npc.name}がデッドドロップを実施した。`, significance: 3,
        discoveryMethods: [`surveillance_${npc.id}`, "sigint"] };
 
    case "recruit_informant":
      return { ...base, description: `${npc.name}が協力者候補に接触した。`, significance: 4,
        discoveryMethods: [`surveillance_${npc.id}`, "investigator"], expiresDay: GS.day + 7 };
 
    case "intelligence_gather":
      return { ...base, description: `${npc.name}が情報収集活動を行った。`, significance: 2,
        discoveryMethods: [`surveillance_${npc.id}`] };
 
    case "meet_handler":
      return { ...base, description: `${npc.name}がハンドラーと接触した。`, significance: 4,
        discoveryMethods: [`surveillance_${npc.id}`, "sigint", "investigator"] };
 
    case "surveillance_check":
      return { ...base, description: `${npc.name}が尾行確認行動をとった。`, significance: 2,
        discoverable: false };
 
    case "route_change":
      return { ...base, description: `${npc.name}が移動ルートを変更した。`, significance: 1,
        discoverable: false };
 
    case "go_dormant":
      return { ...base, description: `${npc.name}が活動を停止した。`, significance: 2,
        discoveryMethods: [`surveillance_${npc.id}`] };
 
    case "emergency_contact":
      return { ...base, description: `${npc.name}が緊急連絡を行った。`, significance: 3,
        discoveryMethods: ["sigint"] };
 
    case "flee":
      return { ...base, description: `${npc.name}が逃亡を試みた。`, significance: 5,
        discoveryMethods: [`surveillance_${npc.id}`, "investigator"] };
 
    case "counter_measure":
      return { ...base, description: `${npc.name}が対諜報措置を実施した。`, significance: 4,
        discoveryMethods: ["investigator"] };
 
    case "sacrifice_asset":
      return { ...base, description: `${npc.name}が協力者を切り捨てた。`, significance: 5,
        discoveryMethods: [`surveillance_${npc.id}`, "investigator"], expiresDay: GS.day + 3 };
 
    case "gather_info":
      return { ...base, description: `${npc.name}が情報を収集した。`, significance: 1,
        discoveryMethods: [] };
 
    case "report_to_handler":
      return { ...base, description: `${npc.name}がハンドラーに報告した。`, significance: 2,
        discoveryMethods: ["sigint"] };
 
    case "withhold_info":
      return { ...base, description: `${npc.name}が情報を隠蔽した。`, significance: 2,
        discoverable: false };
 
    case "contact_enemy":
      return { ...base, description: `${npc.name}が敵側と接触した（二重スパイ化の可能性）。`, significance: 5,
        discoveryMethods: [`surveillance_${npc.id}`, "sigint"], expiresDay: GS.day + 5 };
 
    case "request_report":
      return { ...base, description: `${npc.name}が報告を要求した。`, significance: 1, discoverable: false };
 
    case "political_pressure":
      return { ...base, description: `${npc.name}が政治的圧力をかけた。`, significance: 3, discoverable: false };
 
    case "budget_review":
      return { ...base, description: `${npc.name}が予算査定を行った。`, significance: 2, discoverable: false };
 
    default:
      return { ...base, description: `${npc.name}が${action}を実施した。`, significance: 1, discoverable: false };
  }
}
 
// ─────────────────────────────────────────────
// 行動 → npcState 更新
// ─────────────────────────────────────────────
 
function updateNpcStateFromAction(npcId, action) {
  const patch = {};
  switch (action) {
    case "flee":           patch.activity    = "fleeing";  break;
    case "go_dormant":     patch.activity    = "dormant";  break;
    case "surveillance_check":
    case "route_change":
    case "counter_measure":
      patch.alertLevel = Math.min(1, (getNpcState(npcId)?.alertLevel ?? 0) + 0.05); break;
    case "dead_drop":
    case "meet_handler":
      patch.alertLevel = Math.max(0, (getNpcState(npcId)?.alertLevel ?? 0) - 0.02); break;
    case "contact_enemy":
      patch.activity = "active"; break;
  }
  if (Object.keys(patch).length > 0) patchNpcState(npcId, patch);
}
 
// ─────────────────────────────────────────────
// 行動 → intelPool への断片追加
// ─────────────────────────────────────────────
 
/**
 * 発見可能なイベントから intelPool に断片を追加する
 * @param {object} ev - worldEvent
 * @param {object} diff - 難易度設定
 */
function generateIntelFromEvent(ev, diff) {
  if (!ev.discoverable || ev.discoveryMethods.length === 0) return;
 
  // ノイズ（不確実性）の注入
  let content = ev.description;
  let reliability = 0.8;
 
  if (Math.random() < diff.intelNoiseRate) {
    content     = content + "（情報の一部が不明瞭です）";
    reliability = Math.max(0.3, reliability - 0.3);
  }
 
  // 虚報（EXPOSED限定）
  if (Math.random() < (diff.misinfoProb ?? 0)) {
    content     = _generateMisinfo(ev);
    reliability = 0.3 + Math.random() * 0.3;
  }
 
  addIntel({
    linkedEvent:    ev.id,
    content,
    reliability,
    source:         ev.discoveryMethods[0] ?? "unknown",
    accessLevel:    ev.phaseRequired,
    npcRequired:    null,
    skillRequired:  null,
  });
}
 
function _generateMisinfo(ev) {
  // 虚報: 行動主体・場所を意図的にずらす（単純な文字列置換）
  return ev.description
    .replace("が", "らしき人物が")
    .replace("した。", "したとみられる（未確認）。");
}
 
// ─────────────────────────────────────────────
// LLM描写生成（複雑な接触シーンのみ）
// ─────────────────────────────────────────────
 
const WORLDSIM_SYSTEM = `あなたはスパイゲームのナレーターです。
以下の行動を1〜2文の臨場感ある描写文で表現してください。
日本語で、過去形で、具体的に書いてください。タグや説明は不要です。`;
 
/**
 * 重要度が高いイベントのみ LLM で描写を生成する
 * @param {object} ev
 * @returns {Promise<void>}
 */
async function enrichWithLLMNarrative(ev) {
  if (ev.significance < 4) return;  // 重要度4未満はLLM不使用
  try {
    const narrative = await callGM(WORLDSIM_SYSTEM, [
      { role: "user", content: `行動: ${ev.action}\n主体: ${ev.actor}\n場所: ${ev.location}\n概要: ${ev.description}` }
    ], { retries: 1 });
    ev.narrative = narrative.trim();
  } catch {
    // LLM失敗はサイレントに無視。description をそのまま使う。
    ev.narrative = ev.description;
  }
}
 
// ─────────────────────────────────────────────
// メインAPI
// ─────────────────────────────────────────────
 
/**
 * 1ターン分のワールドシミュレーションを実行する
 * @param {object} diff - 難易度設定オブジェクト
 * @returns {Promise<{ newEvents: object[], instantFail: string|false }>}
 */
export async function simulateWorldTurn(diff) {
  // 1. ルールベース処理（日付進行・予算・作戦カウント等）
  advanceDay(diff);
 
  // 2. 即詰み判定
  const failReason = checkInstantFail(diff);
  if (failReason) {
    addLog("alert", `即時失敗: ${failReason}`);
    return { newEvents: [], instantFail: failReason };
  }
 
  const newEvents = [];
 
  // 3. 全NPCの行動生成
  const npcs = registry.all();
  for (const npc of npcs) {
    const npcState = getNpcState(npc.id);
    if (npcState?.activity === "arrested") continue;  // 逮捕済みはスキップ
 
    const action    = decideAction(npc.type, npcState, npc, GS);
    const evParams  = actionToEventParams(action, npc, npcState);
    evParams.day    = GS.day;
 
    const ev = addWorldEvent(evParams);
    newEvents.push(ev);
 
    // npcState 更新
    updateNpcStateFromAction(npc.id, action);
 
    // intelPool に断片を追加
    generateIntelFromEvent(ev, diff);
 
    // 重要イベントのみ LLM 描写生成（並列実行）
    if (ev.significance >= 4) {
      enrichWithLLMNarrative(ev).catch(() => {});  // 非ブロッキング
    }
  }
 
  // 4. イベントDB抽選（ランダムイベント）
  const drawnEvents = drawEvents(GS, diff);
  for (const evDef of drawnEvents) {
    addLog("info", `イベント発生: ${evDef.id}`);
  }
 
  // 5. GS 全体の敵警戒度を npcStates の平均に同期
  _syncEnemyAlertness();
 
  return { newEvents, instantFail: false };
}
 
/**
 * 敵NPCの alertLevel 平均を GS.meters.enemyAlertness に同期する
 */
function _syncEnemyAlertness() {
  const enemies = registry.byType("enemy");
  if (enemies.length === 0) return;
  const avgAlert = enemies.reduce((sum, npc) => {
    return sum + (getNpcState(npc.id)?.alertLevel ?? GS.meters.enemyAlertness);
  }, 0) / enemies.length;
  // 急激な変化を抑えるため EMA（指数移動平均）で緩和
  const alpha = 0.3;
  const newVal = alpha * avgAlert + (1 - alpha) * GS.meters.enemyAlertness;
  GS.meters.enemyAlertness = Math.max(0, Math.min(1, newVal));
}
 
/**
 * 監視によるインテル取得（プレイヤー操作）
 * @param {string} targetNpcId - 監視対象NPC ID
 * @param {number} surveillanceSkill - 捜査員スキル 0〜100
 * @param {number} missionPhaseLevel - GS.missionPhaseLevel
 * @param {object} diff
 * @returns {object[]} 取得した intelPool エントリ
 */
export function performSurveillance(targetNpcId, surveillanceSkill, missionPhaseLevel, diff) {
  const method    = `surveillance_${targetNpcId}`;
  const threshold = surveillanceSkill + (diff.intelNoiseRate < 0.05 ? 10 : 0);  // ENCRYPTED ボーナス
 
  const eligible = worldEvents.filter(ev =>
    ev.discoverable &&
    !ev.discovered &&
    ev.discoveryMethods.includes(method) &&
    ev.phaseRequired <= missionPhaseLevel &&
    (ev.expiresDay == null || ev.expiresDay >= GS.day)
  );
 
  const results = [];
  for (const ev of eligible) {
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll <= threshold) {
      ev.discovered    = true;
      ev.discoveredDay = GS.day;
      // 対応する intel を返す
      const intelEntry = addIntel({
        linkedEvent:  ev.id,
        content:      ev.description,
        reliability:  Math.max(0.4, (surveillanceSkill / 100) * (1 - diff.intelNoiseRate)),
        source:       "surveillance",
        accessLevel:  0,
      });
      results.push(intelEntry);
    }
  }
  return results;
}
 
/**
 * 通信傍受（SIGINT）によるインテル取得
 * @param {number} missionPhaseLevel
 * @param {boolean} hasWarrant
 * @param {object} diff
 * @returns {object[]}
 */
export function performSIGINT(missionPhaseLevel, hasWarrant, diff) {
  const warrantFactor = hasWarrant ? 1.0 : 0.2;
  const eligible = worldEvents.filter(ev =>
    ev.discoverable &&
    !ev.discovered &&
    ev.discoveryMethods.includes("sigint") &&
    ev.phaseRequired <= missionPhaseLevel &&
    (ev.expiresDay == null || ev.expiresDay >= GS.day)
  );
 
  const results = [];
  for (const ev of eligible) {
    if (Math.random() < 0.6 * warrantFactor) {
      ev.discovered    = true;
      ev.discoveredDay = GS.day;
      const intelEntry = addIntel({
        linkedEvent:  ev.id,
        content:      ev.description,
        reliability:  diff.humintReliability * warrantFactor,
        source:       "sigint",
        accessLevel:  1,
      });
      results.push(intelEntry);
    }
  }
  return results;
}