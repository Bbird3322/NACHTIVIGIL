import { GS } from "../core/gameState.js";

let sidebarEl = null;

export function initSidebar(containerEl) {
  sidebarEl = containerEl;
  renderSidebar();
}

export function renderSidebar() {
  if (!sidebarEl) return;
  sidebarEl.innerHTML = buildHTML();
}

function buildHTML() {
  const m = GS.meters;
  return `
<section class="sb-section">
  <div class="sb-title">NACHTIVIGIL</div>
  <div class="sb-sub">Day ${GS.day} - ${GS.date}</div>
  <div class="sb-sub">${esc(GS.rank)} / ${esc(GS.assignment)}</div>
  <div class="sb-sub sb-mission">${esc(GS.missionName)} [${esc(GS.missionStage)}]</div>
</section>

<section class="sb-section">
  <div class="sb-label">Status</div>
  ${meter("Enemy Alertness", m.enemyAlertness, false)}
  ${meter("Exposure", m.exposureRate, false)}
  ${meter("Press Heat", m.PressHeat, false)}
  ${meter("Legality", m.M_legal, true)}
  ${meter("Chain Integrity", m.chainIntegrity, true)}
  ${meter("Audit Heat", m.auditHeat, false)}
</section>

<section class="sb-section">
  <div class="sb-label">Resources</div>
  <div class="sb-row"><span>Budget</span><span class="${GS.budget < 10_000_000 ? "sb-val--warn" : ""}">${GS.budget.toLocaleString()}</span></div>
  <div class="sb-row"><span>Pocket</span><span>${GS.pocketMoney.toLocaleString()}</span></div>
</section>

<section class="sb-section">
  <div class="sb-label">Personnel</div>
  <div class="sb-row"><span>Available</span><span>${GS.personnel.available} / ${GS.personnel.total}</span></div>
</section>

<section class="sb-section">
  <div class="sb-label">Equipment</div>
  ${GS.equipment.map((item) => `<div class="sb-row"><span>${esc(item.name)}</span><span class="${item.count === 0 ? "sb-val--zero" : ""}">${item.count}</span></div>`).join("")}
</section>

${GS.violations.length ? `
<section class="sb-section sb-section--violations">
  <div class="sb-label sb-label--danger">Violations</div>
  ${GS.violations.slice(-5).map((item) => `<div class="sb-violation">Day ${item.day}: ${esc(item.type)}</div>`).join("")}
</section>` : ""}
`;
}

function meter(label, value, inverted = false) {
  const displayClass = inverted
    ? value < 0.4 ? "danger" : value < 0.7 ? "warn" : "good"
    : value > 0.7 ? "danger" : value > 0.4 ? "warn" : "good";

  const pct = Math.round(value * 100);
  return `
<div class="sb-meter">
  <div class="sb-meter__header">
    <span>${esc(label)}</span>
    <span class="sb-meter__val sb-meter__val--${displayClass}">${pct}%</span>
  </div>
  <div class="sb-meter__bar">
    <div class="sb-meter__fill sb-meter__fill--${displayClass}" style="width:${pct}%"></div>
  </div>
</div>`;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
