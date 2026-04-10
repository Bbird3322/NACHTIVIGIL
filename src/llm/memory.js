import { callNPC } from "./client.js";
import { registry } from "../agents/registry.js";
import { GS } from "../core/gameState.js";

const HISTORY_LIMIT = 10;
const SUMMARY_SYSTEM = [
  "You summarize a relationship history for an intelligence sim NPC.",
  "Return one concise paragraph describing trust, tension, leverage, and recent developments.",
].join(" ");

export async function summarizeContact(npcId) {
  const npc = registry.get(npcId);
  if (!npc) return;

  const history = npc.recentHistory ?? [];
  if (history.length === 0) return;

  try {
    const summary = await callNPC(
      SUMMARY_SYSTEM,
      [{ role: "user", content: JSON.stringify(history, null, 2) }],
      { retries: 2 },
    );

    npc.memories = npc.memories ?? [];
    npc.memories.push({ day: GS.day, event: summary.trim() });
    npc.recentHistory = history.slice(-HISTORY_LIMIT);
  } catch (error) {
    console.warn(`[memory] Failed to summarize ${npcId}:`, error.message);
    npc.memories = npc.memories ?? [];
    npc.memories.push({
      day: GS.day,
      event: `Summary failed. Stored raw history count: ${history.length}`,
    });
    npc.recentHistory = history.slice(-HISTORY_LIMIT);
  }
}

export function pushHistory(npcId, role, content) {
  const npc = registry.get(npcId);
  if (!npc) return;

  npc.recentHistory = npc.recentHistory ?? [];
  npc.recentHistory.push({ role, content });

  if (npc.recentHistory.length > HISTORY_LIMIT * 2) {
    summarizeContact(npcId).catch(console.warn);
  }
}

export function formatMemories(memories) {
  if (!memories?.length) return "No recorded memories.";
  return memories.map((memory) => `Day ${memory.day}: ${memory.event}`).join("\n");
}

export function formatHistory(history) {
  if (!history?.length) return "No recent history.";
  return history.map((item) => `[${item.role}] ${item.content}`).join("\n");
}
