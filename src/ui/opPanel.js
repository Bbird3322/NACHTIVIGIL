import { GS } from "../core/gameState.js";
import { getCfg } from "../llm/client.js";
import { addMessage } from "./feed.js";

let panelEl = null;
const isEnglish = () => getCfg().language === "en";

export function initOpPanel(containerEl) {
  panelEl = containerEl;
  renderOpPanel();
}

export function renderOpPanel() {
  if (!panelEl) return;
  panelEl.innerHTML = GS.currentOp ? buildActiveOpHTML() : buildNoOpHTML();
}

export function startOperation(op) {
  const days = Math.max(1, Number(op.days ?? 1));
  const cost = Number(op.cost ?? 0);
  const personnel = Number(op.personnel ?? 0);

  GS.currentOp = {
    name: op.name ?? "Unnamed Operation",
    days,
    daysRemaining: days,
    personnel,
    cost,
    dailyCost: Math.floor(cost / days),
    status: "active",
    description: op.description ?? "",
    risk: op.risk ?? "Unknown",
    method: op.method ?? "legal",
    evidenceValid: op.method !== "illegal",
  };

  GS.budget -= cost;
  GS.personnel.available -= personnel;
  renderOpPanel();
  addMessage(`**${isEnglish() ? "Operation Started" : "作戦開始"}:** ${GS.currentOp.name}`, "system");
}

export function completeOperation() {
  if (!GS.currentOp) return;
  const op = GS.currentOp;
  GS.personnel.available += op.personnel;
  GS.currentOp = { ...op, status: "complete", daysRemaining: 0 };
  renderOpPanel();
  addMessage(`**${isEnglish() ? "Operation Complete" : "作戦完了"}:** ${op.name}`, "system");
}

export function abortOperation() {
  if (!GS.currentOp) return;
  const op = GS.currentOp;
  GS.personnel.available += op.personnel;
  const refund = Math.floor(op.dailyCost * op.daysRemaining * 0.5);
  GS.budget += refund;
  GS.currentOp = null;
  renderOpPanel();
  addMessage(`**${isEnglish() ? "Operation Aborted" : "作戦中止"}:** ${op.name} (${isEnglish() ? "refund" : "返却"} ${refund.toLocaleString()})`, "system");
}

export function tickOperation() {
  if (!GS.currentOp || GS.currentOp.status !== "active") return;
  GS.currentOp.daysRemaining = Math.max(0, GS.currentOp.daysRemaining - 1);
  if (GS.currentOp.daysRemaining === 0) completeOperation();
  else renderOpPanel();
}

function buildNoOpHTML() {
  return `<div class="op-panel__empty">${isEnglish() ? "No active operation." : "進行中の作戦はありません。"}</div>`;
}

function buildActiveOpHTML() {
  const op = GS.currentOp;
  const isComplete = op.status === "complete";
  const progress = isComplete ? 100 : Math.round((1 - op.daysRemaining / op.days) * 100);
  const en = isEnglish();

  return `
<div class="op-panel ${isComplete ? "op-panel--complete" : ""}">
  <div class="op-panel__name">${esc(op.name)}</div>
  <div class="op-panel__status ${isComplete ? "op-panel__status--done" : ""}">
    ${isComplete ? (en ? "Complete" : "完了") : (en ? `In progress - ${op.daysRemaining} days left` : `進行中 - 残り ${op.daysRemaining} 日`)}
  </div>
  <div class="op-panel__progress-bar">
    <div class="op-panel__progress-fill" style="width:${progress}%"></div>
  </div>
  <div class="op-panel__meta">
    <div class="op-panel__row"><span class="op-panel__label">${en ? "Personnel" : "人員"}</span><span>${op.personnel}</span></div>
    <div class="op-panel__row"><span class="op-panel__label">${en ? "Method" : "手法"}</span><span class="op-panel__method--${esc(op.method)}">${esc(op.method)}</span></div>
    <div class="op-panel__row"><span class="op-panel__label">${en ? "Evidence" : "証拠"}</span><span class="${op.evidenceValid ? "" : "op-panel__invalid"}">${op.evidenceValid ? (en ? "Valid" : "有効") : (en ? "Compromised" : "不備あり")}</span></div>
    <div class="op-panel__row"><span class="op-panel__label">${en ? "Risk" : "リスク"}</span><span class="op-panel__risk">${esc(op.risk)}</span></div>
  </div>
  ${!isComplete ? `<button class="btn btn--abort" id="btn-abort-op">${en ? "Abort" : "中止"}</button>` : ""}
</div>`;
}

document.addEventListener("click", (event) => {
  if (event.target?.id === "btn-abort-op" && GS.currentOp) {
    const ok = confirm(
      isEnglish()
        ? `Abort operation "${GS.currentOp.name}"? You will recover 50% of the remaining cost.`
        : `作戦「${GS.currentOp.name}」を中止しますか？ 未消化コストの50%が返却されます。`,
    );
    if (ok) abortOperation();
  }
});

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
