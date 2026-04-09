// src/ui/opPanel.js
// 作戦状況パネル — 進行中の作戦の表示と管理
 
import { GS } from "../core/gameState.js";
import { addMessage } from "./feed.js";
 
/** @type {HTMLElement|null} */
let _panelEl = null;
 
export function initOpPanel(containerEl) {
  _panelEl = containerEl;
  render();
}
 
/**
 * パネルを現在のGSで再描画する
 */
export function render() {
  if (!_panelEl) return;
  _panelEl.innerHTML = GS.currentOp ? buildActiveOpHTML() : buildNoOpHTML();
}
 
/**
 * 作戦を開始する（GMの作戦提案を承認したときに呼ぶ）
 * @param {object} op - OPERATIONタグのオブジェクト
 */
export function startOperation(op) {
  GS.currentOp = {
    name:          op.name,
    days:          op.days,
    daysRemaining: op.days,
    personnel:     op.personnel,
    cost:          op.cost,
    dailyCost:     Math.floor(op.cost / Math.max(op.days, 1)),
    status:        "active",
    description:   op.description,
    risk:          op.risk,
    method:        op.method ?? "legal",
    evidenceValid: op.method !== "illegal",
  };
 
  // 予算・要員を消費
  GS.budget -= op.cost;
  GS.personnel.available -= op.personnel;
 
  render();
  addMessage(`📋 作戦「${op.name}」を開始しました。（${op.days}日間 / ${op.personnel}名 / ${Number(op.cost).toLocaleString()}円）`, "system");
}
 
/**
 * 作戦を完了する（worldSim からも呼ばれる）
 */
export function completeOperation() {
  if (!GS.currentOp) return;
  const op = GS.currentOp;
  GS.personnel.available += op.personnel;
  GS.currentOp = { ...op, status: "complete", daysRemaining: 0 };
  render();
  addMessage(`✅ 作戦「${op.name}」が完了しました。`, "system");
}
 
/**
 * 作戦を中止する
 */
export function abortOperation() {
  if (!GS.currentOp) return;
  const op = GS.currentOp;
  GS.personnel.available += op.personnel;
  // 残日数分の費用を一部返還（50%）
  const refund = Math.floor(op.dailyCost * op.daysRemaining * 0.5);
  GS.budget += refund;
  GS.currentOp = null;
  render();
  addMessage(`⛔ 作戦「${op.name}」を中止しました。（返還額: ${refund.toLocaleString()}円）`, "system");
}
 
/**
 * ターン経過処理（mechanics.js から毎日呼ばれる）
 */
export function tickOperation() {
  if (!GS.currentOp || GS.currentOp.status !== "active") return;
  GS.currentOp.daysRemaining = Math.max(0, GS.currentOp.daysRemaining - 1);
  if (GS.currentOp.daysRemaining === 0) {
    completeOperation();
  }
  render();
}
 
// ─────────────────────────────────────────────
// HTML生成
// ─────────────────────────────────────────────
 
function buildNoOpHTML() {
  return `<div class="op-panel__empty">進行中の作戦なし</div>`;
}
 
function buildActiveOpHTML() {
  const op = GS.currentOp;
  const isComplete = op.status === "complete";
  const progress = isComplete ? 100 : Math.round((1 - op.daysRemaining / op.days) * 100);
  const methodLabel = op.method === "legal" ? "合法" : "違法";
  const methodClass = op.method === "legal" ? "legal" : "illegal";
 
  return `
<div class="op-panel ${isComplete ? "op-panel--complete" : ""}">
  <div class="op-panel__name">${esc(op.name)}</div>
  <div class="op-panel__status ${isComplete ? "op-panel__status--done" : ""}">
    ${isComplete ? "✅ 完了" : `⚙️ 進行中 — 残${op.daysRemaining}日`}
  </div>
 
  <div class="op-panel__progress-bar">
    <div class="op-panel__progress-fill" style="width:${progress}%"></div>
  </div>
 
  <div class="op-panel__meta">
    <div class="op-panel__row">
      <span class="op-panel__label">要員</span>
      <span>${op.personnel}名</span>
    </div>
    <div class="op-panel__row">
      <span class="op-panel__label">方式</span>
      <span class="op-panel__method--${methodClass}">${methodLabel}</span>
    </div>
    <div class="op-panel__row">
      <span class="op-panel__label">証拠能力</span>
      <span class="${op.evidenceValid ? "" : "op-panel__invalid"}">${op.evidenceValid ? "有効" : "無効（違法取得）"}</span>
    </div>
    <div class="op-panel__row">
      <span class="op-panel__label">リスク</span>
      <span class="op-panel__risk">${esc(op.risk)}</span>
    </div>
  </div>
 
  ${!isComplete ? `<button class="btn btn--abort" id="btn-abort-op">中止</button>` : ""}
</div>`;
}
 
// 中止ボタンのイベント委譲
document.addEventListener("click", (e) => {
  if (e.target?.id === "btn-abort-op") {
    if (confirm(`作戦「${GS.currentOp?.name}」を中止しますか？（費用の50%を返還）`)) {
      abortOperation();
    }
  }
});
 
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}