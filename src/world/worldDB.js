// src/world/worldDB.js
// ワールドデータベース — worldEvents / intelPool / npcStates
// プレイヤーには直接見せない。intelPool 経由で断片のみ渡す。
 
// ─────────────────────────────────────────────
// データストア
// ─────────────────────────────────────────────
 
/** 全NPCの裏側行動記録。プレイヤー不可視。 */
export const worldEvents = [];
 
/** 情報断片プール。操作によって可視化される。 */
export const intelPool = [];
 
/** 各NPCの現在状態スナップショット。 */
export const npcStates = {};
 
// ─────────────────────────────────────────────
// worldEvent 操作
// ─────────────────────────────────────────────
 
let _weCounter = 0;
 
/**
 * worldEvent を追加する
 * @param {object} params
 * @returns {object} 追加したイベント
 */
export function addWorldEvent({
  actor,
  action,
  target = null,
  location = "",
  description = "",
  significance = 1,
  discoverable = true,
  discoveryMethods = [],
  expiresDay = null,
  phaseRequired = 0,
}) {
  const event = {
    id:               `we_${String(++_weCounter).padStart(4, "0")}`,
    day:              null,  // worldSim が GS.day を注入する
    actor,
    action,
    target,
    location,
    description,
    significance:     Math.max(0, Math.min(5, significance)),
    discoverable,
    discoveryMethods,
    discovered:       false,
    discoveredDay:    null,
    expiresDay,
    phaseRequired,
  };
  worldEvents.push(event);
  return event;
}
 
/**
 * worldEvent を発見済みにマークする
 * @param {string} eventId
 * @param {number} currentDay
 */
export function markDiscovered(eventId, currentDay) {
  const ev = worldEvents.find(e => e.id === eventId);
  if (ev) {
    ev.discovered    = true;
    ev.discoveredDay = currentDay;
  }
}
 
/**
 * 指定の発見方法で発見可能なイベントを取得する
 * @param {string} method - "surveillance_{npcId}" | "sigint" | "investigator" など
 * @param {number} currentDay
 * @param {number} missionPhaseLevel
 * @returns {object[]}
 */
export function getDiscoverableEvents(method, currentDay, missionPhaseLevel) {
  return worldEvents.filter(ev =>
    ev.discoverable &&
    !ev.discovered &&
    ev.discoveryMethods.includes(method) &&
    ev.phaseRequired <= missionPhaseLevel &&
    (ev.expiresDay == null || ev.expiresDay >= currentDay)
  );
}
 
// ─────────────────────────────────────────────
// intelPool 操作
// ─────────────────────────────────────────────
 
let _intelCounter = 0;
 
/**
 * intelPool にエントリを追加する
 * @param {object} params
 * @returns {object}
 */
export function addIntel({
  linkedEvent = null,
  content,
  reliability = 0.8,
  source = "unknown",
  accessLevel = 0,
  npcRequired = null,
  skillRequired = null,
}) {
  const entry = {
    id:            `intel_${String(++_intelCounter).padStart(4, "0")}`,
    linkedEvent,
    content,
    reliability:   Math.max(0.0, Math.min(1.0, reliability)),
    source,
    accessLevel,
    npcRequired,
    skillRequired,
    claimed:       false,
  };
  intelPool.push(entry);
  return entry;
}
 
/**
 * アクセスレベルと要件を満たすインテルをフィルタして返す
 * @param {number} playerAccessLevel
 * @param {string|null} npcId
 * @param {string|null} skill
 * @returns {object[]}
 */
export function getAccessibleIntels(playerAccessLevel = 0, npcId = null, skill = null) {
  return intelPool.filter(intel =>
    !intel.claimed &&
    intel.accessLevel <= playerAccessLevel &&
    (intel.npcRequired == null || intel.npcRequired === npcId) &&
    (intel.skillRequired == null || intel.skillRequired === skill)
  );
}
 
/**
 * インテルを取得済みにする
 * @param {string} intelId
 */
export function claimIntel(intelId) {
  const intel = intelPool.find(i => i.id === intelId);
  if (intel) intel.claimed = true;
  return intel;
}
 
// ─────────────────────────────────────────────
// npcStates 操作
// ─────────────────────────────────────────────
 
/**
 * NPC状態を初期化 / 上書き
 * @param {string} npcId
 * @param {object} state
 */
export function setNpcState(npcId, state) {
  npcStates[npcId] = {
    location:               state.location ?? "不明",
    activity:               state.activity ?? "active",
    currentPlan:            state.currentPlan ?? null,
    alertLevel:             Math.max(0, Math.min(1, state.alertLevel ?? 0)),
    knownToPlayer:          state.knownToPlayer ?? false,
    knownInfoAboutPlayer:   state.knownInfoAboutPlayer ?? [],
  };
}
 
/**
 * NPC状態を部分更新
 * @param {string} npcId
 * @param {object} patch
 */
export function patchNpcState(npcId, patch) {
  if (!npcStates[npcId]) setNpcState(npcId, {});
  Object.assign(npcStates[npcId], patch);
  // alertLevel のクランプ
  if ("alertLevel" in patch) {
    npcStates[npcId].alertLevel = Math.max(0, Math.min(1, npcStates[npcId].alertLevel));
  }
}
 
/**
 * NPC状態を取得
 * @param {string} npcId
 * @returns {object|null}
 */
export function getNpcState(npcId) {
  return npcStates[npcId] ?? null;
}
 
// ─────────────────────────────────────────────
// ワールドDBリセット（新シナリオ開始時）
// ─────────────────────────────────────────────
 
export function resetWorldDB() {
  worldEvents.length = 0;
  intelPool.length   = 0;
  for (const key of Object.keys(npcStates)) delete npcStates[key];
  _weCounter    = 0;
  _intelCounter = 0;
}