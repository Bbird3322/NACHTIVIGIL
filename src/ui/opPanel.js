import { GS } from "../core/gameState.js";
import { addMessage } from "./feed.js";

let panelEl = null;

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
  addMessage(`**Operation started:** ${GS.currentOp.name}`, "system");
}

export function completeOperation() {
  if (!GS.currentOp) return;
  const op = GS.currentOp;
  GS.personnel.available += op.personnel;
  GS.currentOp = { ...op, status: "complete", daysRemaining: 0 };
  renderOpPanel();
  addMessage(`**Operation complete:** ${op.name}`, "system");
}

export function abortOperation() {
  if (!GS.currentOp) return;
  const op = GS.currentOp;
  GS.personnel.available += op.personnel;
  const refund = Math.floor(op.dailyCost * op.daysRemaining * 0.5);
  GS.budget += refund;
  GS.currentOp = null;
  renderOpPanel();
  addMessage(`**Operation aborted:** ${op.name} (refund ${refund.toLocaleString()})`, "system");
}

export function tickOperation() {
  if (!GS.currentOp || GS.currentOp.status !== "active") return;
  GS.currentOp.daysRemaining = Math.max(0, GS.currentOp.daysRemaining - 1);
  if (GS.currentOp.daysRemaining === 0) completeOperation();
  else renderOpPanel();
}

function buildNoOpHTML() {
  return "<div class=\"op-panel__empty\">No active operation.</div>";
}

function buildActiveOpHTML() {
  const op = GS.currentOp;
  const isComplete = op.status === "complete";
  const progress = isComplete ? 100 : Math.round((1 - op.daysRemaining / op.days) * 100);

  return `
<div class="op-panel ${isComplete ? "op-panel--complete" : ""}">
  <div class="op-panel__name">${esc(op.name)}</div>
  <div class="op-panel__status ${isComplete ? "op-panel__status--done" : ""}">
    ${isComplete ? "Complete" : `In progress - ${op.daysRemaining} days left`}
  </div>
  <div class="op-panel__progress-bar">
    <div class="op-panel__progress-fill" style="width:${progress}%"></div>
  </div>
  <div class="op-panel__meta">
    <div class="op-panel__row"><span class="op-panel__label">Personnel</span><span>${op.personnel}</span></div>
    <div class="op-panel__row"><span class="op-panel__label">Method</span><span class="op-panel__method--${esc(op.method)}">${esc(op.method)}</span></div>
    <div class="op-panel__row"><span class="op-panel__label">Evidence</span><span class="${op.evidenceValid ? "" : "op-panel__invalid"}">${op.evidenceValid ? "Valid" : "Compromised"}</span></div>
    <div class="op-panel__row"><span class="op-panel__label">Risk</span><span class="op-panel__risk">${esc(op.risk)}</span></div>
  </div>
  ${!isComplete ? "<button class=\"btn btn--abort\" id=\"btn-abort-op\">Abort</button>" : ""}
</div>`;
}

document.addEventListener("click", (event) => {
  if (event.target?.id === "btn-abort-op" && GS.currentOp) {
    if (confirm(`Abort operation \"${GS.currentOp.name}\"? You recover 50% of the remaining cost.`)) {
      abortOperation();
    }
  }
});

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
