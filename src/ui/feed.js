let feedEl = null;

export function initFeed(containerEl) {
  feedEl = containerEl;
}

export function addMessage(html, type = "gm") {
  if (!feedEl) return;

  const el = document.createElement("div");
  el.className = `feed-msg feed-msg--${type}`;
  el.innerHTML = escapeAndFormat(html);
  feedEl.appendChild(el);
  feedEl.scrollTop = feedEl.scrollHeight;
}

export function addOperationCard(op, onAccept, onReject) {
  if (!feedEl) return;

  const el = document.createElement("div");
  el.className = "feed-msg feed-msg--op op-card";
  el.innerHTML = `
    <div class="op-card__header">Operation Proposal: ${esc(op.name)}</div>
    <div class="op-card__body">
      <div class="op-card__row"><span class="op-card__label">Desc</span><span>${esc(op.description ?? "")}</span></div>
      <div class="op-card__row"><span class="op-card__label">Days</span><span>${Number(op.days ?? 0)} days</span></div>
      <div class="op-card__row"><span class="op-card__label">Staff</span><span>${Number(op.personnel ?? 0)}</span></div>
      <div class="op-card__row"><span class="op-card__label">Cost</span><span>${Number(op.cost ?? 0).toLocaleString()}</span></div>
      <div class="op-card__row op-card__risk"><span class="op-card__label">Risk</span><span>${esc(op.risk ?? "Unknown")}</span></div>
      ${op.method ? `<div class="op-card__row"><span class="op-card__label">Method</span><span class="op-card__method op-card__method--${esc(op.method)}">${esc(op.method)}</span></div>` : ""}
    </div>
    <div class="op-card__actions">
      <button class="btn btn--accept" data-action="accept">Accept</button>
      <button class="btn btn--reject" data-action="reject">Reject</button>
    </div>
  `;

  el.querySelector("[data-action=accept]")?.addEventListener("click", () => {
    el.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    onAccept(op);
  });

  el.querySelector("[data-action=reject]")?.addEventListener("click", () => {
    el.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    onReject(op);
  });

  feedEl.appendChild(el);
  feedEl.scrollTop = feedEl.scrollHeight;
}

export function addLoader() {
  if (!feedEl) return () => {};
  const el = document.createElement("div");
  el.className = "feed-msg feed-msg--loading";
  el.innerHTML = "<span class=\"loader-dot\"></span><span class=\"loader-dot\"></span><span class=\"loader-dot\"></span>";
  feedEl.appendChild(el);
  feedEl.scrollTop = feedEl.scrollHeight;
  return () => el.remove();
}

export function clearFeed() {
  if (feedEl) feedEl.innerHTML = "";
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAndFormat(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}
