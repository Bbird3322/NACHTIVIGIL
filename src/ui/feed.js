// src/ui/feed.js
// メッセージフィード — ゲームの主要表示領域
 
/** @type {HTMLElement|null} */
let _feedEl = null;
 
export function initFeed(containerEl) {
  _feedEl = containerEl;
}
 
/**
 * フィードにメッセージを追加する
 * @param {string} html - HTMLまたはテキスト
 * @param {"gm"|"player"|"system"|"intel"|"alert"|"op"} [type="gm"]
 */
export function addMessage(html, type = "gm") {
  if (!_feedEl) return;
 
  const el = document.createElement("div");
  el.className = `feed-msg feed-msg--${type}`;
  el.innerHTML = escapeAndFormat(html);
  _feedEl.appendChild(el);
  _feedEl.scrollTop = _feedEl.scrollHeight;
}
 
/**
 * 作戦提案カードをフィードに表示する（インラインパネル）
 * @param {object} op - OPERATIONタグのオブジェクト
 * @param {function} onAccept - 承認コールバック
 * @param {function} onReject - 却下コールバック
 */
export function addOperationCard(op, onAccept, onReject) {
  if (!_feedEl) return;
 
  const el = document.createElement("div");
  el.className = "feed-msg feed-msg--op op-card";
  el.innerHTML = `
    <div class="op-card__header">📋 作戦提案: ${esc(op.name)}</div>
    <div class="op-card__body">
      <div class="op-card__row"><span class="op-card__label">概要</span><span>${esc(op.description)}</span></div>
      <div class="op-card__row"><span class="op-card__label">期間</span><span>${op.days}日間</span></div>
      <div class="op-card__row"><span class="op-card__label">要員</span><span>${op.personnel}名</span></div>
      <div class="op-card__row"><span class="op-card__label">費用</span><span>${Number(op.cost).toLocaleString()}円</span></div>
      <div class="op-card__row op-card__risk"><span class="op-card__label">リスク</span><span>${esc(op.risk)}</span></div>
      ${op.method ? `<div class="op-card__row"><span class="op-card__label">方式</span><span class="op-card__method op-card__method--${op.method}">${op.method === "legal" ? "合法" : "違法"}</span></div>` : ""}
    </div>
    <div class="op-card__actions">
      <button class="btn btn--accept" data-action="accept">承認</button>
      <button class="btn btn--reject" data-action="reject">却下</button>
    </div>
  `;
 
  el.querySelector("[data-action=accept]").addEventListener("click", () => {
    el.querySelectorAll("button").forEach(b => b.disabled = true);
    el.querySelector("[data-action=accept]").textContent = "✓ 承認済み";
    onAccept(op);
  });
  el.querySelector("[data-action=reject]").addEventListener("click", () => {
    el.querySelectorAll("button").forEach(b => b.disabled = true);
    el.querySelector("[data-action=reject]").textContent = "✗ 却下済み";
    onReject(op);
  });
 
  _feedEl.appendChild(el);
  _feedEl.scrollTop = _feedEl.scrollHeight;
}
 
/**
 * ローディングインジケータを追加し、削除用関数を返す
 * @returns {function} removeLoader
 */
export function addLoader() {
  if (!_feedEl) return () => {};
  const el = document.createElement("div");
  el.className = "feed-msg feed-msg--loading";
  el.innerHTML = `<span class="loader-dot"></span><span class="loader-dot"></span><span class="loader-dot"></span>`;
  _feedEl.appendChild(el);
  _feedEl.scrollTop = _feedEl.scrollHeight;
  return () => el.remove();
}
 
/**
 * フィードをクリアする
 */
export function clearFeed() {
  if (_feedEl) _feedEl.innerHTML = "";
}
 
// ─────────────────────────────────────────────
// 内部ユーティリティ
// ─────────────────────────────────────────────
 
/** HTMLエスケープ */
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
 
/**
 * GMテキストを簡易フォーマット（改行→<br>、**bold**対応）
 * @param {string} text
 * @returns {string}
 */
function escapeAndFormat(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}