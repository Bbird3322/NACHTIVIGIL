const createInitialState = () => ({
  scenarioId: "scenario_jp2025",
  day: 1,
  date: "2025-04-07",
  rank: "Chief",
  assignment: "Intelligence Operations",
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
    enemyAlertness: 0.15,
    exposureRate: 0,
    PressHeat: 0,
    M_legal: 1,
    chainIntegrity: 1,
    auditHeat: 0,
  },
  leaks: false,
  exposureResult: "No exposure",
  bureaucracyPressure: {},
  intelMeeting: false,
  jointMeeting: false,
  lastD100: null,
  lastD6: null,
  missionName: "Unassigned",
  missionStage: "Planning",
  missionPhaseLevel: 0,
  missionStatus: "Active",
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
  difficulty: "DECRYPTED",
  difficultyConfig: null,
});

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
    if (partial.meters && typeof partial.meters === "object") {
      for (const [k, v] of Object.entries(partial.meters)) {
        if (typeof v === "number") setMeter(k, v);
      }
    }
    if (typeof partial.leaks === "boolean") GS.leaks = partial.leaks;
    if (typeof partial.missionName === "string") GS.missionName = partial.missionName;
    if (typeof partial.missionStage === "string") GS.missionStage = partial.missionStage;
    if (typeof partial.missionStatus === "string") GS.missionStatus = partial.missionStatus;
    if (typeof partial.missionPhaseLevel === "number") GS.missionPhaseLevel = partial.missionPhaseLevel;
    if (Array.isArray(partial.sideMissions)) GS.sideMissions = partial.sideMissions;
    if (partial.bureaucracyPressure && typeof partial.bureaucracyPressure === "object") {
      GS.bureaucracyPressure = partial.bureaucracyPressure;
    }
    if (partial.scenarioVars && typeof partial.scenarioVars === "object") {
      GS.scenarioVars = { ...GS.scenarioVars, ...partial.scenarioVars };
    }
  } catch (error) {
    console.warn("[GS] Failed to merge state tag:", error.message);
  }
}

export function resetGS(scenarioInitVars = {}, scenarioId = "scenario_jp2025", difficulty = "DECRYPTED") {
  Object.assign(GS, createInitialState(), {
    scenarioId,
    difficulty,
    scenarioVars: { ...scenarioInitVars },
  });
  Object.assign(playerKnowledge, createInitialKnowledge());
}
