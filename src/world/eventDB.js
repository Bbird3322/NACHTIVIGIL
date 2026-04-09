// src/world/eventDB.js
// EventDef・抽選パイプライン
// LLM不使用。DSLで条件記述、毎ターン確率抽選。
 
// ─────────────────────────────────────────────
// レアリティ係数
// ─────────────────────────────────────────────
 
const RARITY_COEF = {
  common:   1.00,
  uncommon: 0.60,
  rare:     0.30,
  epic:     0.12,
  mythic:   0.05,
};
 
// ─────────────────────────────────────────────
// EventDef レジストリ
// ─────────────────────────────────────────────
 
/** @type {Map<string, object>} */
const _eventDefs = new Map();
 
/** クールダウン管理 { eventId: lastTriggeredDay } */
const _cooldowns = {};
 
/** カテゴリ別連続発生カウント（減衰用） */
const _categoryStreak = {};
 
/** 連鎖スケジュール [{ eventId, triggerAfterDay }] */
const _chainQueue = [];
 
/**
 * EventDef を登録する
 * @param {object} def - EventDef スキーマ準拠のオブジェクト
 */
export function registerEvent(def) {
  _eventDefs.set(def.id, def);
}
 
/**
 * 複数の EventDef を一括登録する（JSON配列から）
 * @param {object[]} defs
 */
export function registerEvents(defs) {
  for (const def of defs) registerEvent(def);
}
 
// ─────────────────────────────────────────────
// 条件評価DSL
// ─────────────────────────────────────────────
 
/**
 * meters DSL を評価する
 * 例: { PressHeat: ">=0.5", M_legal: "<0.3" }
 * @param {object} meterConds
 * @param {object} GS
 * @returns {boolean}
 */
function evalMeterConds(meterConds, GS) {
  if (!meterConds) return true;
  for (const [key, expr] of Object.entries(meterConds)) {
    const val = GS.meters?.[key];
    if (val == null) return false;
    const match = String(expr).match(/^([><=!]+)([\d.]+)$/);
    if (!match) continue;
    const [, op, numStr] = match;
    const num = parseFloat(numStr);
    if (op === ">="  && !(val >= num)) return false;
    if (op === "<="  && !(val <= num)) return false;
    if (op === ">"   && !(val >  num)) return false;
    if (op === "<"   && !(val <  num)) return false;
    if (op === "=="  && !(val === num)) return false;
    if (op === "!="  && !(val !== num)) return false;
  }
  return true;
}
 
/**
 * prereq 条件を評価する
 * @param {object} prereq
 * @param {object} GS
 * @param {string} difficulty
 * @returns {boolean}
 */
function evalPrereq(prereq, GS, difficulty) {
  if (!prereq) return true;
  if (prereq.difficulty?.length && !prereq.difficulty.includes(difficulty)) return false;
  if (!evalMeterConds(prereq.meters, GS)) return false;
  if (prereq.flags?.some(f => !GS.scenarioVars?.[f])) return false;
  return true;
}
 
/**
 * blacklist 条件を評価する（いずれかに該当したら除外）
 * @param {object} blacklist
 * @param {object} GS
 * @returns {boolean} true = 除外しない
 */
function evalBlacklist(blacklist, GS) {
  if (!blacklist) return true;
  if (blacklist.status?.includes(GS.missionStatus)) return false;
  if (blacklist.flags?.some(f => GS.scenarioVars?.[f])) return false;
  return true;
}
 
// ─────────────────────────────────────────────
// 抽選パイプライン
// ─────────────────────────────────────────────
 
/**
 * 毎ターン呼ばれるイベント抽選
 * @param {object} GS
 * @param {object} diff - 難易度設定オブジェクト
 * @param {number} [maxEvents=3] - 1ターンに発生させる最大数
 * @returns {object[]} 発生したEventDef[]
 */
export function drawEvents(GS, diff, maxEvents = 3) {
  const day        = GS.day;
  const difficulty = GS.difficulty;
  const candidates = [];
 
  // 1. 連鎖スケジュールを処理
  const chainTriggered = _processChainQueue(day);
 
  // 2. 全EventDefを走査して重みを計算
  for (const def of _eventDefs.values()) {
    // クールダウンチェック
    const lastDay = _cooldowns[def.id] ?? -Infinity;
    if (day - lastDay < (def.cooldown ?? 0)) continue;
 
    // 前提条件チェック
    if (!evalPrereq(def.prereq, GS, difficulty)) continue;
 
    // ブラックリストチェック
    if (!evalBlacklist(def.blacklist, GS)) continue;
 
    // 重み計算
    let weight = (def.weight ?? 1.0) * (RARITY_COEF[def.rarity] ?? 1.0);
 
    // カテゴリ連続減衰（3回連続で 0.5倍）
    const streak = _categoryStreak[def.category] ?? 0;
    if (streak >= 3) weight *= 0.5;
 
    // AIディレクター係数（外部から注入可能）
    weight *= def._directorCoef ?? 1.0;
 
    if (weight > 0) candidates.push({ def, weight });
  }
 
  // 3. Multinomial サンプリング
  const triggered = [...chainTriggered];
  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
 
  for (let i = 0; i < maxEvents && candidates.length > 0; i++) {
    let rand = Math.random() * totalWeight;
    for (const cand of candidates) {
      rand -= cand.weight;
      if (rand <= 0) {
        triggered.push(cand.def);
        _cooldowns[cand.def.id] = day;
        _categoryStreak[cand.def.category] = (_categoryStreak[cand.def.category] ?? 0) + 1;
        // 連鎖スケジュール登録
        if (cand.def.chain?.next?.length) {
          for (const nextId of cand.def.chain.next) {
            _chainQueue.push({ eventId: nextId, triggerAfterDay: day + (cand.def.chain.window ?? 1) });
          }
        }
        break;
      }
    }
  }
 
  // 4. 発動したイベントのエフェクトを適用
  for (const def of triggered) {
    _applyEffects(def.effects ?? [], GS);
  }
 
  // カテゴリ連続カウントの自然リセット（発動なしカテゴリは減衰）
  for (const cat of Object.keys(_categoryStreak)) {
    if (!triggered.some(d => d.category === cat)) {
      _categoryStreak[cat] = Math.max(0, _categoryStreak[cat] - 1);
    }
  }
 
  return triggered;
}
 
function _processChainQueue(day) {
  const triggered = [];
  const remaining = [];
  for (const item of _chainQueue) {
    if (item.triggerAfterDay <= day) {
      const def = _eventDefs.get(item.eventId);
      if (def) triggered.push(def);
    } else {
      remaining.push(item);
    }
  }
  _chainQueue.length = 0;
  _chainQueue.push(...remaining);
  return triggered;
}
 
/**
 * EventDef の effects を GS に適用する
 * @param {Array<{type:string, "+":number}|{type:string, "-":number}>} effects
 * @param {object} GS
 */
function _applyEffects(effects, GS) {
  for (const eff of effects) {
    const key   = eff.type;
    const delta = (eff["+"] ?? 0) - (eff["-"] ?? 0);
    if (key in GS.meters) {
      GS.meters[key] = Math.max(0, Math.min(1, GS.meters[key] + delta));
    } else if (key in GS.scenarioVars) {
      GS.scenarioVars[key] = GS.scenarioVars[key] + delta;
    }
  }
}
 
// ─────────────────────────────────────────────
// 組み込みイベント定義（共通）
// ─────────────────────────────────────────────
 
registerEvents([
  {
    id: "ev.press.leak",
    category: "press",
    rarity: "uncommon",
    weight: 1.0,
    cooldown: 5,
    prereq: { meters: { PressHeat: ">=0.3" } },
    blacklist: { status: ["gameover"] },
    effects: [{ type: "PressHeat", "+": 0.08 }],
    ui: "news",
  },
  {
    id: "ev.legal.warrant_delay",
    category: "legal",
    rarity: "common",
    weight: 0.8,
    cooldown: 7,
    prereq: { meters: { M_legal: "<=0.6" } },
    blacklist: {},
    effects: [{ type: "M_legal", "-": 0.03 }],
    ui: "brief",
  },
  {
    id: "ev.ops.enemy_counter",
    category: "ops",
    rarity: "uncommon",
    weight: 0.9,
    cooldown: 4,
    prereq: { meters: { enemyAlertness: ">=0.5" } },
    blacklist: {},
    effects: [{ type: "exposureRate", "+": 0.05 }],
    ui: "feed",
  },
  {
    id: "ev.budget.audit",
    category: "economy",
    rarity: "rare",
    weight: 0.7,
    cooldown: 14,
    prereq: { meters: { auditHeat: ">=0.4" } },
    blacklist: {},
    effects: [{ type: "auditHeat", "+": 0.10 }],
    ui: "popup",
  },
  {
    id: "ev.personnel.fatigue_incident",
    category: "personnel",
    rarity: "uncommon",
    weight: 0.6,
    cooldown: 6,
    prereq: {},
    blacklist: {},
    effects: [],
    ui: "brief",
  },
  {
    id: "ev.press.good_coverage",
    category: "press",
    rarity: "common",
    weight: 0.5,
    cooldown: 8,
    prereq: { meters: { M_legal: ">=0.8", PressHeat: "<=0.3" } },
    blacklist: {},
    effects: [{ type: "PressHeat", "-": 0.05 }],
    ui: "news",
  },
]);
 
// ─────────────────────────────────────────────
// リセット
// ─────────────────────────────────────────────
 
export function resetEventDB() {
  for (const key of Object.keys(_cooldowns))      delete _cooldowns[key];
  for (const key of Object.keys(_categoryStreak)) delete _categoryStreak[key];
  _chainQueue.length = 0;
}