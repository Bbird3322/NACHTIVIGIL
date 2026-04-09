// src/ui/intelPanel.js
// 入手情報一覧・信頼度表示パネル
 
import { intelPool } from "../world/worldDB.js";
import { playerKnowledge } from "../core/gameState.js";
 
/** @type {HTMLElement|null} */
let _panelEl = null;
 
export function initIntelPanel(containerEl) {
  _panelEl = containerEl;
  render();
}
 
/**
 * パネルを再描画する
 */
export function render() {
  if (!_panelEl) return;
  _panelEl.innerHTML = buildHTML();
}
 
// ─────────────────────────────────────────────
// HTML生成
// ─────────────────────────────────────────────
 
function buildHTML() {
  const claimed  = intelPool.filter(i => i.claimed);
  const unclaimed = intelPool.filter(i => !i.claimed);
 
  const confirmedFacts = playerKnowledge.confirmedFacts;
  const suspicions     = playerKnowledge.suspicions;
 
  if (claimed.length === 0 && confirmedFacts.length === 0) {
    return `<div class="intel-empty">情報なし</div>`;
  }
 
  return `
${confirmedFacts.length > 0 ? `
<div class="intel-section">
  <div class="intel-section__label">確認済み情報 (${confirmedFacts.length}件)</div>
  ${confirmedFacts.slice().reverse().map(f => buildFactCard(f)).join("")}
</div>` : ""}
 
${suspicions.length > 0 ? `
<div class="intel-section">
  <div class="intel-section__label intel-section__label--gray">疑惑・未確認 (${suspicions.length}件)</div>
  ${suspicions.slice().reverse().map(s => buildSuspicionCard(s)).join("")}
</div>` : ""}
 
${claimed.length > 0 ? `
<div class="intel-section">
  <div class="intel-section__label">入手済みインテル (${claimed.length}件)</div>
  ${claimed.slice().reverse().map(i => buildIntelCard(i)).join("")}
</div>` : ""}
 
${unclaimed.length > 0 ? `
<div class="intel-section intel-section--unclaimed">
  <div class="intel-section__label intel-section__label--dim">未取得 (${unclaimed.length}件) — 操作して取得</div>
</div>` : ""}
`;
}
 
function buildIntelCard(intel) {
  const reliabilityClass = intel.reliability >= 0.7 ? "high" : intel.reliability >= 0.4 ? "mid" : "low";
  const reliabilityLabel = Math.round(intel.reliability * 100) + "%";
  const sourceLabel = formatSource(intel.source);
 
  return `
<div class="intel-card intel-card--${reliabilityClass}">
  <div class="intel-card__content">${esc(intel.content)}</div>
  <div class="intel-card__meta">
    <span class="intel-card__source">${esc(sourceLabel)}</span>
    <span class="intel-card__reliability intel-card__reliability--${reliabilityClass}">信頼度 ${reliabilityLabel}</span>
  </div>
</div>`;
}
 
function buildFactCard(fact) {
  return `
<div class="intel-card intel-card--fact">
  <div class="intel-card__content">${esc(fact.content)}</div>
  <div class="intel-card__meta">
    <span class="intel-card__source">Day ${fact.acquiredDay}</span>
    <span class="intel-card__tag">${(fact.tags ?? []).map(t => `<span class="intel-tag">${esc(t)}</span>`).join("")}</span>
  </div>
</div>`;
}
 
function buildSuspicionCard(s) {
  return `
<div class="intel-card intel-card--suspicion">
  <div class="intel-card__content">${esc(s.content)}</div>
  <div class="intel-card__meta">
    <span class="intel-card__source">Day ${s.acquiredDay ?? "?"}</span>
    <span class="intel-card__reliability intel-card__reliability--low">要確認</span>
  </div>
</div>`;
}
 
function formatSource(source) {
  const map = {
    surveillance: "監視",
    sigint:       "通信傍受",
    investigator: "捜査員",
    informant:    "協力者",
    humint:       "人的情報",
    osint:        "公開情報",
    unknown:      "不明",
  };
  if (source.startsWith("surveillance_")) return "監視";
  return map[source] ?? source;
}
 
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
 
// ─────────────────────────────────────────────
// CSS（index.html に追記が必要なスタイル定義を export）
// ─────────────────────────────────────────────
 
export const INTEL_PANEL_CSS = `
.intel-empty { color: var(--text-dim); font-size: 12px; text-align: center; padding: 20px 0; }
.intel-section { margin-bottom: 14px; }
.intel-section--unclaimed { opacity: 0.5; }
.intel-section__label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-dim); margin-bottom: 6px;
}
.intel-section__label--gray { color: var(--text-muted); }
.intel-section__label--dim  { color: var(--text-dim); }
 
.intel-card {
  background: var(--bg-input);
  border-left: 3px solid var(--border);
  border-radius: 4px;
  padding: 7px 10px;
  margin-bottom: 5px;
  font-size: 12px;
}
.intel-card--high       { border-color: var(--good); }
.intel-card--mid        { border-color: var(--warn); }
.intel-card--low        { border-color: var(--danger); }
.intel-card--fact       { border-color: var(--accent-dim); background: var(--bg-panel); }
.intel-card--suspicion  { border-color: var(--text-dim); }
 
.intel-card__content { margin-bottom: 4px; line-height: 1.5; color: var(--text); }
.intel-card__meta    { display: flex; justify-content: space-between; align-items: center; }
.intel-card__source  { color: var(--text-dim); font-size: 10px; }
.intel-card__reliability { font-size: 10px; }
.intel-card__reliability--high { color: var(--good); }
.intel-card__reliability--mid  { color: var(--warn); }
.intel-card__reliability--low  { color: var(--danger); }
 
.intel-tag {
  display: inline-block;
  background: var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 9px;
  color: var(--text-muted);
  margin-left: 3px;
}
`;