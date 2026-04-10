import { callGM } from "../llm/client.js";
import { GS, playerKnowledge, mergeStateFromTag, addLog } from "../core/gameState.js";

const GM_HISTORY_LIMIT = 20;
const gmHistory = [];

function buildKnowledgeSummary() {
  const facts = playerKnowledge.confirmedFacts;
  if (!facts.length) return "- No confirmed facts yet.";
  return facts
    .slice(-10)
    .map((fact) => `- [Day ${fact.acquiredDay}] ${fact.content}`)
    .join("\n");
}

function buildGMSystemPrompt() {
  return [
    "You are the GM for NACHTIVIGIL, a covert-intelligence simulation.",
    "Respond with grounded, terse narrative and maintain operational realism.",
    "If you propose an operation, include one <OPERATION>{...}</OPERATION> JSON tag.",
    "If the world state changes, include one <STATE>{...}</STATE> JSON tag.",
    `Current day: ${GS.day} (${GS.date}).`,
    `Mission: ${GS.missionName} / ${GS.missionStage} / ${GS.missionStatus}.`,
    `Budget: ${GS.budget}. Available personnel: ${GS.personnel.available}/${GS.personnel.total}.`,
    `Meters: enemyAlertness=${GS.meters.enemyAlertness}, exposureRate=${GS.meters.exposureRate}, PressHeat=${GS.meters.PressHeat}, M_legal=${GS.meters.M_legal}, chainIntegrity=${GS.meters.chainIntegrity}, auditHeat=${GS.meters.auditHeat}.`,
    "Known facts:",
    buildKnowledgeSummary(),
  ].join("\n");
}

export function parseGMResponse(raw) {
  const result = {
    text: extractTextOnly(raw),
    state: null,
    operation: null,
    npcEvents: null,
    worldActions: null,
  };

  const stateMatch = raw.match(/<STATE>([\s\S]*?)<\/STATE>/);
  if (stateMatch) result.state = safeParseJSON(stateMatch[1], "STATE");

  const opMatch = raw.match(/<OPERATION>([\s\S]*?)<\/OPERATION>/);
  if (opMatch) result.operation = safeParseJSON(opMatch[1], "OPERATION");

  const npcMatch = raw.match(/<NPCEVENTS>([\s\S]*?)<\/NPCEVENTS>/);
  if (npcMatch) result.npcEvents = safeParseJSON(npcMatch[1], "NPCEVENTS");

  const worldActionRegex = /<WORLDACTION>([\s\S]*?)<\/WORLDACTION>/g;
  const worldActions = [];
  let match;
  while ((match = worldActionRegex.exec(raw)) !== null) {
    const parsed = safeParseJSON(match[1], "WORLDACTION");
    if (parsed) worldActions.push(parsed);
  }
  if (worldActions.length) result.worldActions = worldActions;

  return result;
}

function extractTextOnly(raw) {
  return raw
    .replace(/<STATE>[\s\S]*?<\/STATE>/g, "")
    .replace(/<OPERATION>[\s\S]*?<\/OPERATION>/g, "")
    .replace(/<NPCEVENTS>[\s\S]*?<\/NPCEVENTS>/g, "")
    .replace(/<WORLDACTION>[\s\S]*?<\/WORLDACTION>/g, "")
    .trim();
}

function safeParseJSON(str, tagName) {
  try {
    return JSON.parse(str.trim());
  } catch (error) {
    console.warn(`[GM] Failed to parse ${tagName}:`, error.message);
    return null;
  }
}

function pushGMHistory(role, content) {
  gmHistory.push({ role, content });
  if (gmHistory.length > GM_HISTORY_LIMIT * 2) {
    gmHistory.splice(0, gmHistory.length - GM_HISTORY_LIMIT);
  }
}

export function clearGMHistory() {
  gmHistory.length = 0;
}

export async function sendToGM(playerInput, opts = {}) {
  pushGMHistory("user", playerInput);

  const raw = await callGM(buildGMSystemPrompt(), [...gmHistory], {
    retries: 3,
    signal: opts.signal,
  });

  pushGMHistory("assistant", raw);

  const parsed = parseGMResponse(raw);
  if (parsed.state) {
    mergeStateFromTag(parsed.state);
  }

  addLog("info", `GM response processed on Day ${GS.day}`);

  return {
    text: parsed.text,
    operation: parsed.operation,
    npcEvents: parsed.npcEvents,
    worldActions: parsed.worldActions,
  };
}

export async function getOpeningMessage(scenarioTitle) {
  const result = await sendToGM(`Open the scenario: ${scenarioTitle}`);
  return result.text;
}
