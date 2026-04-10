import { resolveDifficultyProfile } from "./difficulty.js";

const createInitialState = () => {
  const { difficulty, profile } = resolveDifficultyProfile("DECRYPTED");
  return {
    scenarioId: "scenario_jp2025",
    day: 1,
    date: "2025-04-07",
    rank: "チーフ",
    assignment: "情報収集班",
    promotionPoints: 0,
    budget: 50_000_000,
    monthlyBudget: 50_000_000,
    pocketMoney: 2_000_000,
    salary: 7_000_000,
    personnel: { available: 20, total: 20 },
    equipment: [
      { name: "Surveillance Drone", count: 2 },
      { name: "Vehicle", count: 5 },
      { name: "Cover ID", count: 3 },
      { name: "Forensic Kit", count: 1 },
    ],
    meters: {
      enemyAlertness: 0,
      exposureRate: 0,
      PressHeat: 0,
      M_legal: 1,
      chainIntegrity: 1,
      auditHeat: 0,
    },
    leaks: false,
    exposureResult: "未露見",
    bureaucracyPressure: {},
    intelMeeting: false,
    jointMeeting: false,
    lastD100: null,
    lastD6: null,
    missionName: "未設定",
    missionStage: "情報収集",
    missionPhaseLevel: 0,
    missionStatus: "進行中",
    sideMissions: [],
    currentOp: null,
    evalAxes: {
      mission: 0,
      legality: 0,
      exposure: 0,
      civil: 0,
      budget: 0,
      time: 0,
      procedure: 0,
      chain: 0,
    },
    evalTotal: 0,
    evalRank: null,
    pendingEndings: [],
    unlockedAchievements: [],
    log: [],
    scenarioVars: {},
    violations: [],
    difficulty,
    difficultyConfig: profile,
  };
};

const createInitialKnowledge = () => ({
  confirmedFacts: [],
  suspicions: [],
  leads: [],
  knownNpcs: [],
  reportedToSuperior: [],
});

export const GS = createInitialState();
export const playerKnowledge = createInitialKnowledge();

export function addLog(type, desc) {
  GS.log.push({ day: GS.day, type, desc });
  if (GS.log.length > 60) GS.log.shift();
}

export function setMeter(key, value) {
  if (!(key in GS.meters)) {
    console.warn(`[GS] Unknown meter: ${key}`);
    return;
  }
  GS.meters[key] = Math.max(0, Math.min(1, value));
}

export function mergeStateFromTag(partial) {
  try {
    if (!partial || typeof partial !== "object") return;

    if (partial.meters && typeof partial.meters === "object") {
      for (const [key, value] of Object.entries(partial.meters)) {
        if (typeof value === "number" && Number.isFinite(value)) setMeter(key, value);
      }
    }

    for (const key of ["scenarioId", "date", "rank", "assignment", "missionName", "missionStage", "missionStatus", "exposureResult", "evalRank"]) {
      if (typeof partial[key] === "string") GS[key] = partial[key];
    }

    for (const key of ["day", "promotionPoints", "budget", "monthlyBudget", "pocketMoney", "salary", "missionPhaseLevel", "evalTotal"]) {
      if (typeof partial[key] === "number" && Number.isFinite(partial[key])) {
        GS[key] = Math.max(0, partial[key]);
      }
    }

    if (typeof partial.leaks === "boolean") GS.leaks = partial.leaks;
    if (typeof partial.intelMeeting === "boolean") GS.intelMeeting = partial.intelMeeting;
    if (typeof partial.jointMeeting === "boolean") GS.jointMeeting = partial.jointMeeting;

    if (partial.personnel && typeof partial.personnel === "object") {
      const nextTotal = typeof partial.personnel.total === "number" && Number.isFinite(partial.personnel.total)
        ? Math.max(0, partial.personnel.total)
        : GS.personnel.total;
      const nextAvailableRaw = typeof partial.personnel.available === "number" && Number.isFinite(partial.personnel.available)
        ? Math.max(0, partial.personnel.available)
        : GS.personnel.available;
      GS.personnel = {
        available: Math.min(nextAvailableRaw, nextTotal),
        total: nextTotal,
      };
    }

    if (Array.isArray(partial.equipment)) {
      GS.equipment = partial.equipment
        .filter((item) => item && typeof item === "object" && typeof item.name === "string" && typeof item.count === "number" && Number.isFinite(item.count))
        .map((item) => ({ name: item.name, count: Math.max(0, Math.floor(item.count)) }));
    }

    if (Array.isArray(partial.sideMissions)) {
      GS.sideMissions = partial.sideMissions
        .filter((item) => item && typeof item === "object")
        .map((item) => ({ ...item }));
    }

    if (partial.currentOp && typeof partial.currentOp === "object") {
      GS.currentOp = mergeCurrentOp(partial.currentOp);
    } else if (partial.currentOp === null) {
      GS.currentOp = null;
    }

    if (partial.evalAxes && typeof partial.evalAxes === "object") {
      for (const [key, value] of Object.entries(partial.evalAxes)) {
        if (key in GS.evalAxes && typeof value === "number" && Number.isFinite(value)) {
          GS.evalAxes[key] = value;
        }
      }
    }

    if (Array.isArray(partial.pendingEndings)) {
      GS.pendingEndings = partial.pendingEndings.filter((item) => typeof item === "string");
    }

    if (Array.isArray(partial.unlockedAchievements)) {
      GS.unlockedAchievements = partial.unlockedAchievements.filter((item) => typeof item === "string");
    }

    if (Array.isArray(partial.violations)) {
      GS.violations = partial.violations.filter(isViolationLike).map(normalizeViolation);
    }

    if (typeof partial.difficulty === "string") {
      syncDifficulty(partial.difficulty);
    }

    if (partial.bureaucracyPressure && typeof partial.bureaucracyPressure === "object") {
      GS.bureaucracyPressure = Object.fromEntries(
        Object.entries(partial.bureaucracyPressure).filter(([, value]) => typeof value === "number" && Number.isFinite(value)),
      );
    }

    if (partial.scenarioVars && typeof partial.scenarioVars === "object") {
      GS.scenarioVars = { ...GS.scenarioVars, ...partial.scenarioVars };
    }
  } catch (error) {
    console.warn("[GS] Failed to merge state tag:", error.message);
  }
}

export function resetGS(scenarioInitVars = {}, scenarioId = "scenario_jp2025", difficulty = "DECRYPTED") {
  const { difficulty: resolvedDifficulty, profile } = resolveDifficultyProfile(difficulty);
  Object.assign(GS, createInitialState(), {
    scenarioId,
    difficulty: resolvedDifficulty,
    difficultyConfig: profile,
    scenarioVars: { ...scenarioInitVars },
  });
  Object.assign(playerKnowledge, createInitialKnowledge());
}

export function syncDifficulty(difficultyKey) {
  const { difficulty, profile } = resolveDifficultyProfile(difficultyKey);
  GS.difficulty = difficulty;
  GS.difficultyConfig = profile;
  return profile;
}

function mergeCurrentOp(partialOp) {
  const base = GS.currentOp && typeof GS.currentOp === "object"
    ? { ...GS.currentOp }
    : {
        name: "未設定作戦",
        days: 1,
        daysRemaining: 1,
        personnel: 0,
        cost: 0,
        dailyCost: 0,
        status: "active",
        description: "",
        risk: "不明",
        method: "legal",
        evidenceValid: true,
      };

  const next = { ...base };

  for (const key of ["name", "status", "description", "risk", "method"]) {
    if (typeof partialOp[key] === "string") next[key] = partialOp[key];
  }

  for (const key of ["days", "daysRemaining", "personnel", "cost", "dailyCost"]) {
    if (typeof partialOp[key] === "number" && Number.isFinite(partialOp[key])) {
      next[key] = Math.max(0, partialOp[key]);
    }
  }

  if (typeof partialOp.evidenceValid === "boolean") next.evidenceValid = partialOp.evidenceValid;
  if (next.daysRemaining > next.days) next.daysRemaining = next.days;

  return next;
}

function isViolationLike(value) {
  return value && typeof value === "object" && typeof value.type === "string";
}

function normalizeViolation(entry) {
  return {
    day: typeof entry.day === "number" && Number.isFinite(entry.day) ? Math.max(0, entry.day) : GS.day,
    type: entry.type,
    sev: typeof entry.sev === "number" && Number.isFinite(entry.sev) ? Math.max(0, entry.sev) : 1,
  };
}
