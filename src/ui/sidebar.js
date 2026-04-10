import { GS } from "../core/gameState.js";
import { getCfg } from "../llm/client.js";
import { t } from "../core/i18n.js";

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
  const moneyLocale = lang === "en" ? "en-US" : "ja-JP";
  const meters = GS.meters;
  const instantFail = GS.difficultyConfig?.instantFailPolicy;

  return `
<section class="sb-section">
  <div class="sb-title">NACHTIVIGIL</div>
  <div class="sb-sub">${t("sidebar.day")} ${GS.day} - ${GS.date}</div>
  <div class="sb-sub">${esc(GS.rank)} / ${esc(GS.assignment)}</div>
  <div class="sb-sub sb-mission">${esc(GS.missionName)} [${esc(GS.missionStage)}]</div>
  <div class="sb-sub">${t("sidebar.difficulty")}: ${esc(GS.difficulty)}${instantFail ? ` / ${esc(instantFail)}` : ""}</div>
</section>

<section class="sb-section">
  <div class="sb-label">${t("sidebar.status")}</div>
  ${meter(t("sidebar.enemyAlertness"), meters.enemyAlertness, false)}
  ${meter(t("sidebar.exposure"), meters.exposureRate, false)}
  ${meter(t("sidebar.pressHeat"), meters.PressHeat, false)}
  ${meter(t("sidebar.legality"), meters.M_legal, true)}
  ${meter(t("sidebar.chainIntegrity"), meters.chainIntegrity, true)}
  ${meter(t("sidebar.auditHeat"), meters.auditHeat, false)}
</section>

<section class="sb-section">
  <div class="sb-label">${t("sidebar.resources")}</div>
  <div class="sb-row"><span>${t("sidebar.budget")}</span><span class="${GS.budget < 10_000_000 ? "sb-val--warn" : ""}">${GS.budget.toLocaleString(moneyLocale)}</span></div>
  <div class="sb-row"><span>${t("sidebar.pocket")}</span><span>${GS.pocketMoney.toLocaleString(moneyLocale)}</span></div>
</section>

<section class="sb-section">
  <div class="sb-label">${t("sidebar.personnel")}</div>
  <div class="sb-row"><span>${t("sidebar.available")}</span><span>${GS.personnel.available} / ${GS.personnel.total}</span></div>
</section>

<section class="sb-section">
  <div class="sb-label">${t("sidebar.equipment")}</div>
  ${GS.equipment.map((item) => `<div class="sb-row"><span>${esc(item.name)}</span><span class="${item.count === 0 ? "sb-val--zero" : ""}">${item.count}</span></div>`).join("")}
</section>

${GS.violations.length ? `
<section class="sb-section sb-section--violations">
  <div class="sb-label sb-label--danger">${t("sidebar.violations")}</div>
  ${GS.violations.slice(-5).map((item) => `<div class="sb-violation">${t("sidebar.day")} ${item.day}: ${esc(item.type)}</div>`).join("")}
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
