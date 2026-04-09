// src/ui/sidebar.js
// サイドバー — ゲームステート表示（メーター・予算・要員・装備）
 
import { GS } from "../core/gameState.js";
 
/** @type {HTMLElement|null} */
let _sidebarEl = null;
 
export function initSidebar(containerEl) {
  _sidebarEl = containerEl;
  render();
}
 
/**
 * サイドバーを現在のGSで再描画する
 */
export function render() {
  if (!_sidebarEl) return;
  _sidebarEl.innerHTML = buildHTML();
}
 
function buildHTML() {
  const m = GS.meters;
  return `
<section class="sb-section">
  <div class="sb-title">NACHTIVIGIL</div>
  <div class="sb-sub">Day ${GS.day} — ${GS.date}</div>
  <div class="sb-sub">${GS.rank} / ${GS.assignment}</div>
  <div class="sb-sub sb-mission">${GS.missionName} [${GS.missionStage}]</div>
</section>
 
<section class="sb-section">
  <div class="sb-label">ゲームメーター</div>
  ${meter("敵警戒度",   m.enemyAlertness,  "warn")}
  ${meter("露出率",     m.exposureRate,    "danger")}
  ${meter("報道熱量",   m.PressHeat,       "warn")}
  ${meter("適法性",     m.M_legal,         "good", true)}
  ${meter("証拠連鎖",   m.chainIntegrity,  "good", true)}
  ${meter("資金監査",   m.auditHeat,       "warn")}
</section>
 
<section class="sb-section">
  <div class="sb-label">財務</div>
  <div class="sb-row">
    <span>予算残額</span>
    <span class="${GS.budget < 10_000_000 ? "sb-val--warn" : ""}">${GS.budget.toLocaleString()}円</span>
  </div>
  <div class="sb-row">
    <span>機動費</span>
    <span>${GS.pocketMoney.toLocaleString()}円</span>
  </div>
</section>
 
<section class="sb-section">
  <div class="sb-label">要員</div>
  <div class="sb-row">
    <span>投入可能</span>
    <span>${GS.personnel.available} / ${GS.personnel.total}名</span>
  </div>
</section>
 
<section class="sb-section">
  <div class="sb-label">装備</div>
  ${GS.equipment.map(e => `
  <div class="sb-row">
    <span>${esc(e.name)}</span>
    <span class="${e.count === 0 ? "sb-val--zero" : ""}">${e.count}個</span>
  </div>`).join("")}
</section>
 
${GS.violations.length > 0 ? `
<section class="sb-section sb-section--violations">
  <div class="sb-label sb-label--danger">違反記録</div>
  ${GS.violations.slice(-5).map(v => `<div class="sb-violation">Day ${v.day}: ${esc(v.type)}</div>`).join("")}
</section>` : ""}
`;
}
 
function meter(label, value, colorClass, inverted = false) {
  // 反転メーター（適法性・証拠連鎖）: 高いほど良い → 低いと警告色
  const displayClass = inverted
    ? (value < 0.4 ? "danger" : value < 0.7 ? "warn" : "good")
    : (value > 0.7 ? "danger" : value > 0.4 ? "warn" : "good");
 
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