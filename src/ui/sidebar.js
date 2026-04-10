import { GS } from "../core/gameState.js";
import { getCfg } from "../llm/client.js";

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
  const lang = getCfg().language === "en" ? "en" : "ja";
  const labels = lang === "en"
    ? {
        day: "Day",
        status: "Status",
        resources: "Resources",
        personnel: "Personnel",
        available: "Available",
        equipment: "Equipment",
        budget: "Budget",
        pocket: "Pocket",
        difficulty: "Difficulty",
        violations: "Violations",
        enemyAlertness: "Enemy Alertness",
        exposure: "Exposure",
        pressHeat: "Press Heat",
        legality: "Legality",
        chainIntegrity: "Chain Integrity",
        auditHeat: "Audit Heat",
      }
    : {
        day: "Day",
        status: "\u72b6\u614b",
        resources: "\u8cc7\u6e90",
        personnel: "\u4eba\u54e1",
        available: "\u7a3c\u50cd",
        equipment: "\u88c5\u5099",
        budget: "\u4e88\u7b97",
        pocket: "\u6d3b\u52d5\u8cbb",
        difficulty: "\u96e3\u6613\u5ea6",
        violations: "\u9055\u53cd",
        enemyAlertness: "\u6575\u8b66\u6212\u5ea6",
        exposure: "\u9732\u898b\u7387",
        pressHeat: "\u5831\u9053\u71b1",
        legality: "\u5408\u6cd5\u6027",
        chainIntegrity: "\u6307\u63ee\u7cfb\u7d71",
        auditHeat: "\u76e3\u67fb\u71b1",
      };

  const moneyLocale = lang === "en" ? "en-US" : "ja-JP";
  const meters = GS.meters;
  const instantFail = GS.difficultyConfig?.instantFailPolicy;

  return `
<section class="sb-section">
  <div class="sb-title">NACHTIVIGIL</div>
  <div class="sb-sub">${labels.day} ${GS.day} - ${GS.date}</div>
  <div class="sb-sub">${esc(GS.rank)} / ${esc(GS.assignment)}</div>
  <div class="sb-sub sb-mission">${esc(GS.missionName)} [${esc(GS.missionStage)}]</div>
  <div class="sb-sub">${labels.difficulty}: ${esc(GS.difficulty)}${instantFail ? ` / ${esc(instantFail)}` : ""}</div>
</section>

<section class="sb-section">
  <div class="sb-label">${labels.status}</div>
  ${meter(labels.enemyAlertness, meters.enemyAlertness, false)}
  ${meter(labels.exposure, meters.exposureRate, false)}
  ${meter(labels.pressHeat, meters.PressHeat, false)}
  ${meter(labels.legality, meters.M_legal, true)}
  ${meter(labels.chainIntegrity, meters.chainIntegrity, true)}
  ${meter(labels.auditHeat, meters.auditHeat, false)}
</section>

<section class="sb-section">
  <div class="sb-label">${labels.resources}</div>
  <div class="sb-row"><span>${labels.budget}</span><span class="${GS.budget < 10_000_000 ? "sb-val--warn" : ""}">${GS.budget.toLocaleString(moneyLocale)}</span></div>
  <div class="sb-row"><span>${labels.pocket}</span><span>${GS.pocketMoney.toLocaleString(moneyLocale)}</span></div>
</section>

<section class="sb-section">
  <div class="sb-label">${labels.personnel}</div>
  <div class="sb-row"><span>${labels.available}</span><span>${GS.personnel.available} / ${GS.personnel.total}</span></div>
</section>

<section class="sb-section">
  <div class="sb-label">${labels.equipment}</div>
  ${GS.equipment.map((item) => `<div class="sb-row"><span>${esc(item.name)}</span><span class="${item.count === 0 ? "sb-val--zero" : ""}">${item.count}</span></div>`).join("")}
</section>

${GS.violations.length ? `
<section class="sb-section sb-section--violations">
  <div class="sb-label sb-label--danger">${labels.violations}</div>
  ${GS.violations.slice(-5).map((item) => `<div class="sb-violation">${labels.day} ${item.day}: ${esc(item.type)}</div>`).join("")}
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
