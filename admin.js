const loginView = document.querySelector("#login-view");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const queueList = document.querySelector("#queue-list");
const toast = document.querySelector("#toast");

const ui = {
  sourceForm: document.querySelector("#source-form"), tweetUrl: document.querySelector("#tweet-url"),
  sourceCard: document.querySelector("#source-card"), sync: document.querySelector("#sync-replies"),
  import: document.querySelector("#import-replies"), batch: document.querySelector("#reply-batch"),
  refresh: document.querySelector("#refresh-queue"), clear: document.querySelector("#clear-comments"),
  logout: document.querySelector("#logout"), pending: document.querySelector("#pending-count"),
  approved: document.querySelector("#approved-count"), rejected: document.querySelector("#rejected-count")
};

let state = { source: null, pending: [], counts: { pending: 0, approved: 0, rejected: 0 }, xConfigured: false };

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function initials(name = "?") { return name.replace(/^@/, "").slice(0, 1).toUpperCase() || "?"; }
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "Request failed"); error.status = response.status; throw error; }
  return data;
}

function setBusy(button, busy, text = "Working...") {
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = text; button.disabled = true; }
  else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
}

let toastTimer;
function notify(message, kind = "success") {
  window.clearTimeout(toastTimer); toast.textContent = message; toast.dataset.kind = kind;
  toast.classList.add("toast--visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("toast--visible"), 3200);
}

function avatar(comment) {
  if (comment.avatarUrl) return `<img class="admin-avatar" src="${escapeHtml(comment.avatarUrl)}" alt="" referrerpolicy="no-referrer">`;
  return `<span class="admin-avatar admin-avatar--fallback">${escapeHtml(initials(comment.author))}</span>`;
}

function render() {
  ui.pending.textContent = state.counts.pending; ui.approved.textContent = state.counts.approved; ui.rejected.textContent = state.counts.rejected;
  ui.tweetUrl.value = state.source?.url || "";
  ui.sourceCard.innerHTML = state.source
    ? `<strong>${escapeHtml(state.source.author || "Connected X post")}</strong><a href="${escapeHtml(state.source.url)}" target="_blank" rel="noopener">View source &#8599;</a>${state.source.text ? `<p>${escapeHtml(state.source.text)}</p>` : ""}`
    : "No post connected.";
  ui.sync.disabled = !state.source;
  ui.sync.title = state.xConfigured ? "Sync recent replies" : "Add X_BEARER_TOKEN in Vercel to enable syncing";

  if (!state.pending.length) {
    queueList.innerHTML = `<div class="queue-empty"><span>&#10003;</span><h3>Queue is clear</h3><p>Newly collected replies will wait here for approval.</p></div>`;
    return;
  }
  queueList.innerHTML = state.pending.map((comment) => `<article class="approval-card" data-id="${escapeHtml(comment.id)}">
    <header>${avatar(comment)}<span><strong>${escapeHtml(comment.name || comment.author)}</strong><small>${escapeHtml(comment.author)} &middot; ${escapeHtml(formatDate(comment.createdAt))}</small></span><em>Pending</em></header>
    <p>${escapeHtml(comment.text)}</p><footer><button class="button--approve" type="button" data-action="approved">Approve & publish</button><button class="button--reject" type="button" data-action="rejected">Reject</button></footer>
  </article>`).join("");
}

async function loadAdmin() {
  try {
    state = await request("/api/admin"); loginView.hidden = true; adminApp.hidden = false; render();
  } catch (error) {
    if (error.status === 401) { loginView.hidden = false; adminApp.hidden = true; return; }
    loginError.textContent = error.message;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = loginForm.querySelector("button"); setBusy(button, true, "Signing in..."); loginError.textContent = "";
  try { await request("/api/login", { method: "POST", body: JSON.stringify({ password: loginForm.password.value }) }); loginForm.reset(); await loadAdmin(); }
  catch (error) { loginError.textContent = error.message; } finally { setBusy(button, false); }
});

ui.sourceForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = ui.sourceForm.querySelector("button"); setBusy(button, true, "Connecting...");
  try { await request("/api/source", { method: "POST", body: JSON.stringify({ url: ui.tweetUrl.value }) }); await loadAdmin(); notify("Source connected"); }
  catch (error) { notify(error.message, "error"); } finally { setBusy(button, false); }
});

ui.sync.addEventListener("click", async () => {
  setBusy(ui.sync, true, "Syncing...");
  try { const result = await request("/api/sync", { method: "POST", body: "{}" }); await loadAdmin(); notify(`${result.added} new ${result.added === 1 ? "reply" : "replies"} added`); }
  catch (error) { notify(error.message, "error"); } finally { setBusy(ui.sync, false); }
});

ui.import.addEventListener("click", async () => {
  const lines = ui.batch.value.split("\n").map((line) => line.trim()).filter(Boolean);
  const items = lines.map((line, index) => { const match = line.match(/^(@?[\w.-]+)\s*:\s*(.+)$/); return match ? { author: `@${match[1].replace(/^@/, "")}`, text: match[2] } : { author: `@guest${index + 1}`, text: line }; });
  if (!items.length) return notify("Add at least one comment", "error");
  setBusy(ui.import, true, "Adding...");
  try { const result = await request("/api/import", { method: "POST", body: JSON.stringify({ items }) }); ui.batch.value = ""; await loadAdmin(); notify(`${result.added} ${result.added === 1 ? "comment" : "comments"} added for approval`); }
  catch (error) { notify(error.message, "error"); } finally { setBusy(ui.import, false); }
});

queueList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]"); const card = button?.closest("[data-id]"); if (!button || !card) return;
  setBusy(button, true, button.dataset.action === "approved" ? "Publishing..." : "Rejecting...");
  try { await request("/api/moderate", { method: "POST", body: JSON.stringify({ id: card.dataset.id, status: button.dataset.action }) }); await loadAdmin(); notify(button.dataset.action === "approved" ? "Comment is live" : "Comment rejected"); }
  catch (error) { notify(error.message, "error"); setBusy(button, false); }
});

ui.refresh.addEventListener("click", loadAdmin);
ui.clear.addEventListener("click", async () => {
  if (!window.confirm("Clear every pending, approved, and rejected comment?")) return;
  setBusy(ui.clear, true, "Clearing...");
  try { await request("/api/state", { method: "DELETE", body: "{}" }); await loadAdmin(); notify("All comments cleared"); }
  catch (error) { notify(error.message, "error"); } finally { setBusy(ui.clear, false); }
});
ui.logout.addEventListener("click", async () => { await request("/api/logout", { method: "POST", body: "{}" }); window.location.reload(); });
loadAdmin();
