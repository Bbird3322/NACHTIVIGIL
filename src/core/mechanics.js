import { GS, addLog, setMeter, syncDifficulty } from "./gameState.js";
import { DEFAULT_DIFFICULTY, resolveDifficultyProfile } from "./difficulty.js";
import { tickOperation } from "../ui/opPanel.js";

const SCORE_PROFILES = {
  E1: { mission: 0.35, legality: 0.2, exposure: 0.15, civil: 0.1, budget: 0.08, time: 0.05, procedure: 0.04, chain: 0.03 },
  D1: { mission: 0.25, legality: 0.15, exposure: 0.2, civil: 0.1, budget: 0.1, time: 0.08, procedure: 0.06, chain: 0.06 },
  X1: { mission: 0.2, legality: 0.15, exposure: 0.25, civil: 0.15, budget: 0.05, time: 0.05, procedure: 0.05, chain: 0.1 },
};

let difficultyTablePromise = null;

export async function loadDifficultyTable() {
  if (!difficultyTablePromise) {
    difficultyTablePromise = fetch("./config/difficulty.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        console.warn("[difficulty] Falling back to built-in defaults:", error.message);
        return DEFAULT_DIFFICULTY;
      });
  }
  return difficultyTablePromise;
}

export async function initDifficulty(difficultyKey = GS.difficulty) {
  const table = await loadDifficultyTable();
  return applyDifficultyProfile(difficultyKey, table);
}

export function getDifficultyProfile(difficultyKey = GS.difficulty, table = DEFAULT_DIFFICULTY) {
  return resolveDifficultyProfile(difficultyKey, table).profile;
}

export function applyDifficultyProfile(difficultyKey = GS.difficulty, table = DEFAULT_DIFFICULTY) {
  const { difficulty, profile } = resolveDifficultyProfile(difficultyKey, table);

  syncDifficulty(difficulty);
  GS.difficultyConfig = profile;
  GS.meters.enemyAlertness = clamp01(Math.max(GS.meters.enemyAlertness ?? 0, profile.enemyAlertnessBase ?? 0));

  if (!GS.bureaucracyPressure || typeof GS.bureaucracyPressure !== "object") {
    GS.bureaucracyPressure = {};
  }
  if (Object.keys(GS.bureaucracyPressure).length === 0) {
    GS.bureaucracyPressure.default = profile.bureaucracyPressureInit ?? 0;
  }

  return profile;
}

export function rollD100() {
  GS.lastD100 = Math.floor(Math.random() * 100) + 1;
  return GS.lastD100;
}

export function rollD6() {
  GS.lastD6 = Math.floor(Math.random() * 6) + 1;
  return GS.lastD6;
}

export function skillCheck(skill, modifier = 0) {
  const roll = rollD100();
  const threshold = clamp(skill + modifier, 5, 95);
  if (roll <= Math.floor(threshold * 0.1)) return "critical_success";
  if (roll <= threshold) return "success";
  if (roll >= 96) return "critical_failure";
  return "failure";
}

export function advanceDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function applyMonthlyBudget() {
  const date = new Date(`${GS.date}T00:00:00`);
  if (date.getDate() !== 21) return;
  GS.budget += GS.monthlyBudget;
  addLog("info", `Monthly budget allocated: +${GS.monthlyBudget.toLocaleString()}`);
}

export function advanceDay(diff = GS.difficultyConfig ?? DEFAULT_DIFFICULTY.DECRYPTED) {
  GS.day += 1;
  GS.date = advanceDate(GS.date);
  applyMonthlyBudget();
  tickOperation();
  processBackgroundTurn(diff);
  checkScenarioMechanics(diff);
}

function processBackgroundTurn(diff) {
  if (!GS.leaks && Math.random() < (diff.leakChancePerTurn ?? 0)) {
    GS.leaks = true;
    addLog("alert", "Internal leak indicators have surfaced.");
  }

  if (GS.meters.enemyAlertness > 0.6) {
    const counterChance = (GS.meters.enemyAlertness - 0.6) * 0.15;
    if (Math.random() < counterChance) {
      setMeter("exposureRate", GS.meters.exposureRate + 0.05 * (diff.exposureMult ?? 1));
      addLog("warning", "Enemy countermeasures increased your exposure risk.");
    }
  }

  if (GS.meters.PressHeat > 0) {
    setMeter("PressHeat", GS.meters.PressHeat - 0.01 * (diff.pressDecayMult ?? 1));
  }

  if (GS.currentOp && GS.meters.auditHeat < 1) {
    setMeter("auditHeat", GS.meters.auditHeat + 0.005);
  }
}

export function calcWarrantScore(hasValidWarrant, fit = 1, overreach = 0) {
  if (!hasValidWarrant) return 0;
  return clamp01(fit * (1 - overreach));
}

export function applyViolation(violationType, sev = 1, diff = GS.difficultyConfig ?? DEFAULT_DIFFICULTY.DECRYPTED) {
  const table = {
    warrant_missing: { mLegalDelta: -0.1, pressHeatDelta: 0.05 },
    overreach: { mLegalDelta: -0.07, pressHeatDelta: 0.04 },
    custody_break: { mLegalDelta: -0.05, pressHeatDelta: 0.03 },
    brutality: { mLegalDelta: -0.15, pressHeatDelta: 0.1 },
  };

  const entry = table[violationType];
  if (!entry) return;

  setMeter("M_legal", GS.meters.M_legal + entry.mLegalDelta * sev);
  setMeter("PressHeat", GS.meters.PressHeat + entry.pressHeatDelta * sev * (diff.pressSensitivity ?? 1));
  GS.violations.push({ day: GS.day, type: violationType, sev });
  addLog("alert", `Violation recorded: ${violationType} (severity ${sev})`);
}

export function calcChargeProb({
  readiness = 0.5,
  judgeBias = 0,
  pressTilt = 0,
  procedureFaults = 0,
} = {}) {
  const alpha = 1.2;
  const beta = 0.6;
  const gamma = 0.4;
  const delta = 0.8;
  const epsilon = 0.7;
  const x = alpha * readiness + beta * judgeBias + gamma * pressTilt + delta * GS.meters.M_legal - epsilon * procedureFaults;
  return 1 / (1 + Math.exp(-x));
}

export function checkInstantFail(diff = GS.difficultyConfig ?? DEFAULT_DIFFICULTY.DECRYPTED) {
  if (diff.instantFailPolicy !== "Strict") return false;
  const meters = GS.meters;
  if (meters.M_legal < 0.2 && meters.PressHeat >= 0.7) return "legal_press_fail";
  if (meters.exposureRate >= 0.85 && meters.enemyAlertness >= 0.7) return "exposure_enemy_fail";
  if (meters.chainIntegrity <= 0.6 && GS.violations.some((entry) => entry.sev >= 2)) return "chain_violation_fail";
  return false;
}

export function checkScenarioMechanics(diff = GS.difficultyConfig ?? DEFAULT_DIFFICULTY.DECRYPTED) {
  const sv = GS.scenarioVars;
  switch (GS.scenarioId) {
    case "scenario_jp2025":
      checkJp2025Scenario(sv, diff);
      break;
    case "scenario_stasi1985":
      checkStasiScenario(sv);
      break;
    case "scenario_sid1970":
      checkSidScenario(sv);
      break;
    case "scenario_dea1990":
      checkDeaScenario(sv);
      break;
    default:
      break;
  }
}

function checkJp2025Scenario(sv) {
  if (sv.publicOpinion == null) sv.publicOpinion = 50;
  if (GS.meters.PressHeat > 0.6) sv.publicOpinion = Math.max(0, sv.publicOpinion - 1);
  if (GS.meters.M_legal < 0.5) sv.publicOpinion = Math.max(0, sv.publicOpinion - 1);
  if (sv.publicOpinion <= 0) {
    addLog("alert", "Public support has collapsed.");
    GS.pendingEndings.push("end_public_fail");
  }
}

function checkStasiScenario(sv) {
  if (sv.paranoiaLevel == null) sv.paranoiaLevel = 1;
  sv.paranoiaLevel = Math.max(1, sv.paranoiaLevel);
  if (sv.paranoiaLevel >= 3) addLog("alert", "Internal surveillance pressure is rising.");
  if (sv.paranoiaLevel >= 5) GS.pendingEndings.push("purge");
}

function checkSidScenario(sv) {
  if (!sv.factionBalance) return;
  const fb = sv.factionBalance;
  if (fb.partiti >= 90) addLog("alert", "Party pressure has become overwhelming.");
  if (fb.popolo >= 90) addLog("alert", "Street unrest is becoming unmanageable.");
  if (fb.mafia >= 90) addLog("alert", "Organized crime influence is peaking.");
  if (fb.destraViolence >= 90) addLog("alert", "Far-right violence is spiking.");
  if (fb.sinistraViolence >= 90) addLog("alert", "Far-left violence is spiking.");
}

function checkDeaScenario(sv) {
  if (sv.exposure == null) sv.exposure = 0;
  if (sv.assassinationRisk == null) sv.assassinationRisk = 5;
  if (sv.exposure >= 3 && Math.random() < sv.assassinationRisk / 100) {
    addLog("alert", "An assassination attempt has been triggered.");
    GS.pendingEndings.push("assassination_attempt");
  }
}

export function processWarrant(op) {
  if (!op) return;

  if (op.method === "legal") {
    const extension = Math.floor(Math.random() * 2) + 2;
    op.days += extension;
    op.daysRemaining = op.days;
    op.evidenceValid = true;
    addLog("info", `Warrant process extended the operation by ${extension} days.`);
    return;
  }

  if (op.method === "illegal") {
    op.evidenceValid = false;
    setMeter("exposureRate", GS.meters.exposureRate + 0.15);
    GS.scenarioVars.illegalOpsCount = (GS.scenarioVars.illegalOpsCount ?? 0) + 1;
    addLog("warning", "Illegal operation increased exposure and evidence risk.");
  }
}

export function calcEvaluation(diff = GS.difficultyConfig ?? DEFAULT_DIFFICULTY.DECRYPTED) {
  const profile = SCORE_PROFILES[diff.scoreWeightsProfile] ?? SCORE_PROFILES.D1;
  const total = Object.entries(profile).reduce((sum, [key, weight]) => {
    return sum + (GS.evalAxes[key] ?? 0) * weight;
  }, 0);

  GS.evalTotal = Math.round(total);
  GS.evalRank = total >= 85 ? "S" : total >= 70 ? "A" : total >= 50 ? "B" : "C";
  return { total: GS.evalTotal, rank: GS.evalRank };
}

export const clamp01 = (value) => clamp(value, 0, 1);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
