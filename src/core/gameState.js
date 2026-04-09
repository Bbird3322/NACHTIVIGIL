// src/core/gameState.js
// ゲームステート（GS）と playerKnowledge の定義・初期値
 
// ─────────────────────────────────────────────
// GS — ゲームの全状態
// ─────────────────────────────────────────────
 
export const GS = {
  // メタ
  scenarioId:       "scenario_jp2025",
  day:              1,
  date:             "2025-04-07",
  rank:             "チーフ",
  assignment:       "警視庁公安部",
  promotionPoints:  0,
 
  // 財務（円単位）
  budget:        50_000_000,
  monthlyBudget: 50_000_000,
  pocketMoney:    2_000_000,
  salary:         7_000_000,
 
  // 要員
  personnel: { available: 20, total: 20 },
 
  // 装備
  equipment: [
    { name: "監視ドローン",   count: 2 },
    { name: "盗聴器",         count: 5 },
    { name: "偽造ID",         count: 3 },
    { name: "特殊通信装置",   count: 1 },
  ],
 
  // ゲームフラグ（0.0〜1.0 または boolean）
  meters: {
    enemyAlertness:  0.15,
    exposureRate:    0.0,
    PressHeat:       0.0,
    M_legal:         1.0,
    chainIntegrity:  1.0,
    auditHeat:       0.0,
  },
  leaks:            false,
  exposureResult:   "未発覚",
  bureaucracyPressure: {},
  intelMeeting:     false,
  jointMeeting:     false,
 
  // ダイス（診断用）
  lastD100: null,
  lastD6:   null,
 
  // 任務
  missionName:        "—",
  missionStage:       "情報収集",
  missionPhaseLevel:  0,
  missionStatus:      "進行中",
  sideMissions:       [],
 
  // 作戦
  currentOp: null,
 
  // 評価
  evalAxes: {
    mission:   0,
    legality:  0,
    exposure:  0,
    civil:     0,
    budget:    0,
    time:      0,
    procedure: 0,
    chain:     0,
  },
  evalTotal: 0,
  evalRank:  null,
 
  // エンディング・実績
  pendingEndings:       [],
  unlockedAchievements: [],
 
  // ログ（直近60件）
  log: [],
 
  // シナリオ固有変数（アクティブなシナリオのみ）
  scenarioVars: {},
 
  // 違反記録
  violations: [],
 
  // 現在の難易度
  difficulty: "DECRYPTED",
};
 
// ─────────────────────────────────────────────
// playerKnowledge — プレイヤーの既知情報ストア
// ─────────────────────────────────────────────
 
export const playerKnowledge = {
  // { id, content, sourceEvent, sourceIntel, acquiredDay, reliability, tags }
  confirmedFacts: [],
  suspicions:     [],
  leads:          [],
  knownNpcs:      [],
  reportedToSuperior: [],
};
 
// ─────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────
 
/**
 * ログに1件追加（直近60件を維持）
 * @param {"info"|"warning"|"alert"|"system"} type
 * @param {string} desc
 */
export function addLog(type, desc) {
  GS.log.push({ day: GS.day, type, desc });
  if (GS.log.length > 60) GS.log.shift();
}
 
/**
 * GS.meters の値を 0.0〜1.0 にクランプして更新する
 * @param {string} key
 * @param {number} value
 */
export function setMeter(key, value) {
  if (!(key in GS.meters)) {
    console.warn(`[GS] 未知のメーター: ${key}`);
    return;
  }
  GS.meters[key] = Math.max(0.0, Math.min(1.0, value));
}
 
/**
 * STATEタグから受け取った部分オブジェクトで GS を防御的にマージする
 * JSONパース失敗・不正値があっても前の状態を維持する
 * @param {object} partial
 */
export function mergeStateFromTag(partial) {
  try {
    if (partial.meters && typeof partial.meters === "object") {
      for (const [k, v] of Object.entries(partial.meters)) {
        if (k in GS.meters && typeof v === "number") {
          setMeter(k, v);
        }
      }
    }
    if (typeof partial.leaks === "boolean")         GS.leaks           = partial.leaks;
    if (typeof partial.missionName === "string")    GS.missionName     = partial.missionName;
    if (typeof partial.missionStage === "string")   GS.missionStage    = partial.missionStage;
    if (typeof partial.missionStatus === "string")  GS.missionStatus   = partial.missionStatus;
    if (typeof partial.missionPhaseLevel === "number") GS.missionPhaseLevel = partial.missionPhaseLevel;
    if (Array.isArray(partial.sideMissions))        GS.sideMissions    = partial.sideMissions;
    if (partial.bureaucracyPressure && typeof partial.bureaucracyPressure === "object") {
      GS.bureaucracyPressure = partial.bureaucracyPressure;
    }
    if (partial.scenarioVars && typeof partial.scenarioVars === "object") {
      GS.scenarioVars = { ...GS.scenarioVars, ...partial.scenarioVars };
    }
  } catch (e) {
    console.warn("[GS] mergeStateFromTag 失敗。前の状態を維持:", e.message);
  }
}
 
/**
 * GS をリセットして新しいシナリオ用の初期値にする
 * @param {object} scenarioInitVars - シナリオJSON の scenarioVarsInit
 * @param {string} scenarioId
 * @param {string} difficulty
 */
export function resetGS(scenarioInitVars = {}, scenarioId = "scenario_jp2025", difficulty = "DECRYPTED") {
  GS.scenarioId         = scenarioId;
  GS.day                = 1;
  GS.date               = "2025-04-07";
  GS.rank               = "チーフ";
  GS.promotionPoints    = 0;
  GS.budget             = 50_000_000;
  GS.personnel          = { available: 20, total: 20 };
  GS.meters             = {
    enemyAlertness: 0.15, exposureRate: 0.0,
    PressHeat: 0.0, M_legal: 1.0, chainIntegrity: 1.0, auditHeat: 0.0,
  };
  GS.leaks              = false;
  GS.exposureResult     = "未発覚";
  GS.bureaucracyPressure = {};
  GS.lastD100           = null;
  GS.lastD6             = null;
  GS.missionName        = "—";
  GS.missionStage       = "情報収集";
  GS.missionPhaseLevel  = 0;
  GS.missionStatus      = "進行中";
  GS.sideMissions       = [];
  GS.currentOp          = null;
  GS.evalAxes           = { mission:0, legality:0, exposure:0, civil:0, budget:0, time:0, procedure:0, chain:0 };
  GS.evalTotal          = 0;
  GS.evalRank           = null;
  GS.pendingEndings     = [];
  GS.unlockedAchievements = [];
  GS.log                = [];
  GS.violations         = [];
  GS.difficulty         = difficulty;
  GS.scenarioVars       = { ...scenarioInitVars };
 
  playerKnowledge.confirmedFacts    = [];
  playerKnowledge.suspicions        = [];
  playerKnowledge.leads             = [];
  playerKnowledge.knownNpcs         = [];
  playerKnowledge.reportedToSuperior = [];
}