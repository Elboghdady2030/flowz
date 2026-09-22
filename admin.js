const loginView = document.querySelector("#login-view");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const queueList = document.querySelector("#queue-list");
const toast = document.querySelector("#toast");

const ui = {
  sourceForm: document.querySelector("#source-form"), tweetUrl: document.querySelector("#tweet-url"),
  sourceCard: document.querySelector("#source-card"), sync: document.querySelector("#sync-replies"),
  syncStatus: document.querySelector("#sync-status"), syncDetails: document.querySelector("#sync-details"), syncDot: document.querySelector("#sync-dot"),
  autoSync: document.querySelector("#auto-sync"), import: document.querySelector("#import-replies"),
  batch: document.querySelector("#reply-batch"), refresh: document.querySelector("#refresh-queue"),
  clear: document.querySelector("#clear-comments"), logout: document.querySelector("#logout"),
  showHeader: document.querySelector("#show-header"), showFooter: document.querySelector("#show-footer"),
  pending: document.querySelector("#pending-count"), approved: document.querySelector("#approved-count"),
  rejected: document.querySelector("#rejected-count")
};

let state = { source: null, pending: [], counts: { pending: 0, approved: 0, rejected: 0 }, settings: { headerVisible: true, footerVisible: true }, xConfigured: false, xMode: "public" };
let syncRunning = false;
let autoSyncTimer;
let loadSequence = 0;

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function initials(name = "?") { return name.replace(/^@/, "").slice(0, 1).toUpperCase() || "?"; }
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

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

function renderSyncState() {
  let mode = "idle";
  let label = "Connect a post";
  let details = "";
  if (state.source && !state.xConfigured) {
    mode = state.source.lastSyncStatus === "partial" ? "partial" : "offline";
    label = state.source.lastSyncStatus === "partial" ? "Partial public results" : "X API connection required";
    details = state.source.lastSyncStatus === "partial"
      ? `${state.source.lastSyncFound || 0} replies were visible publicly. Full conversation access requires X API.`
      : "Public-page syncing can return only a small part of the conversation.";
  }
  if (state.source && state.xConfigured) {
    mode = "live";
    label = state.source.lastSyncedAt ? `X API · ${formatDate(state.source.lastSyncedAt)}` : "X API ready";
    details = state.source.lastSyncedAt
      ? `${state.source.syncTotal || 0} collected · ${state.source.lastSyncPages || 1} ${state.source.lastSyncPages === 1 ? "page" : "pages"} scanned`
      : "The first sync will scan the complete conversation archive.";
  }
  if (state.source?.lastSyncStatus === "failed") {
    mode = "offline";
    label = "X sync needs attention";
    details = state.source.lastSyncError || "The last X sync failed.";
  }
  if (syncRunning) { mode = "syncing"; label = "Receiving replies..."; }
  ui.syncStatus.textContent = label;
  ui.syncDetails.textContent = syncRunning ? "Scanning every available results page..." : details;
  ui.syncDot.dataset.state = mode;
  ui.sync.disabled = !state.source || syncRunning;
  ui.sync.title = state.xConfigured ? "Collect all replies through X API" : "Collect the replies exposed on the public X page";
  ui.autoSync.disabled = !state.source;
}

function render() {
  ui.pending.textContent = state.counts.pending;
  ui.approved.textContent = state.counts.approved;
  ui.rejected.textContent = state.counts.rejected;
  ui.showHeader.checked = state.settings?.headerVisible !== false;
  ui.showFooter.checked = state.settings?.footerVisible !== false;
  ui.tweetUrl.value = state.source?.url || "";
  ui.sourceCard.innerHTML = state.source
    ? `<strong>${escapeHtml(state.source.author || "Connected X post")}</strong><a href="${escapeHtml(state.source.url)}" target="_blank" rel="noopener">View source &#8599;</a>${state.source.text ? `<p dir="auto">${escapeHtml(state.source.text)}</p>` : ""}`
    : "No post connected.";
  renderSyncState();

  if (!state.pending.length) {
    queueList.innerHTML = `<div class="queue-empty"><span>&#10003;</span><h3>Queue is clear</h3><p>Newly collected replies will wait here for approval.</p></div>`;
    return;
  }
  queueList.innerHTML = state.pending.map((comment) => `<article class="approval-card" data-id="${escapeHtml(comment.id)}">
    <header>${avatar(comment)}<span><strong>${escapeHtml(comment.name || comment.author)}</strong><small>${escapeHtml(comment.author)} &middot; ${escapeHtml(formatDate(comment.createdAt))}</small></span><em>Pending</em></header>
    <p dir="auto">${escapeHtml(comment.text)}</p><footer><button class="button--approve" type="button" data-action="approved">Approve & publish</button><button class="button--reject" type="button" data-action="rejected">Reject</button></footer>
  </article>`).join("");
}

function restartAutoSync() {
  window.clearInterval(autoSyncTimer);
  if (!ui.autoSync.checked || !state.source) return;
  autoSyncTimer = window.setInterval(() => {
    if (!document.hidden) syncReplies({ quiet: true });
  }, 30_000);
}

async function loadAdmin() {
  const sequence = ++loadSequence;
  try {
    const first = await request("/api/admin?offset=0");
    if (sequence !== loadSequence) return;
    state = { ...first, pending: [...(first.pending || [])] };
    loginView.hidden = true;
    adminApp.hidden = false;
    render();

    let nextOffset = first.nextOffset;
    while (nextOffset !== null && nextOffset !== undefined) {
      const page = await request(`/api/admin?offset=${nextOffset}`);
      if (sequence !== loadSequence) return;
      state.pending.push(...(page.pending || []));
      state.counts = page.counts;
      state.source = page.source;
      state.xConfigured = page.xConfigured;
      state.xMode = page.xMode;
      nextOffset = page.nextOffset;
      render();
    }
    restartAutoSync();
  } catch (error) {
    if (error.status === 401) { loginView.hidden = false; adminApp.hidden = true; return; }
    loginError.textContent = error.message;
  }
}

async function syncReplies({ quiet = false } = {}) {
  if (syncRunning || !state.source) return;
  syncRunning = true;
  if (!quiet) setBusy(ui.sync, true, "Syncing every reply...");
  renderSyncState();
  try {
    const result = await request("/api/sync", { method: "POST", body: "{}" });
    if (!result.busy) {
      await loadAdmin();
      if (result.added > 0) notify(`${result.added} new ${result.added === 1 ? "reply" : "replies"} received`);
      else if (!quiet && result.complete) notify("The complete conversation is up to date");
      else if (!quiet) notify(result.limitation || "Public results may be incomplete", "error");
    }
  } catch (error) {
    await loadAdmin();
    if (!quiet) notify(error.message, "error");
  } finally {
    syncRunning = false;
    if (!quiet) setBusy(ui.sync, false);
    renderSyncState();
    restartAutoSync();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = loginForm.querySelector("button"); setBusy(button, true, "Signing in..."); loginError.textContent = "";
  try {
    await request("/api/login", { method: "POST", body: JSON.stringify({ password: loginForm.password.value }) });
    loginForm.reset(); await loadAdmin(); await syncReplies({ quiet: true });
  } catch (error) { loginError.textContent = error.message; } finally { setBusy(button, false); }
});

ui.sourceForm.addEventListener("submit", async (event) => {
  event.preventDefault(); const button = ui.sourceForm.querySelector("button"); setBusy(button, true, "Connecting...");
  try {
    await request("/api/source", { method: "POST", body: JSON.stringify({ url: ui.tweetUrl.value }) });
    await loadAdmin(); notify("Source connected"); await syncReplies({ quiet: true });
  } catch (error) { notify(error.message, "error"); } finally { setBusy(button, false); }
});

ui.sync.addEventListener("click", () => syncReplies());
ui.autoSync.addEventListener("change", () => {
  try { localStorage.setItem("flowz:auto-sync", ui.autoSync.checked ? "on" : "off"); } catch {}
  restartAutoSync();
  if (ui.autoSync.checked) syncReplies({ quiet: true });
});

async function saveDisplaySettings() {
  const previous = { ...state.settings };
  const settings = { headerVisible: ui.showHeader.checked, footerVisible: ui.showFooter.checked };
  ui.showHeader.disabled = true;
  ui.showFooter.disabled = true;
  try {
    const result = await request("/api/state", { method: "PATCH", body: JSON.stringify(settings) });
    state.settings = result.settings;
    render();
    notify("Live wall display updated");
  } catch (error) {
    state.settings = previous;
    render();
    notify(error.message, "error");
  } finally {
    ui.showHeader.disabled = false;
    ui.showFooter.disabled = false;
  }
}

ui.showHeader.addEventListener("change", saveDisplaySettings);
ui.showFooter.addEventListener("change", saveDisplaySettings);

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
ui.logout.addEventListener("click", async () => { window.clearInterval(autoSyncTimer); await request("/api/logout", { method: "POST", body: "{}" }); window.location.reload(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncReplies({ quiet: true }); });

try { ui.autoSync.checked = localStorage.getItem("flowz:auto-sync") !== "off"; } catch {}
loadAdmin().then(() => { if (ui.autoSync.checked) syncReplies({ quiet: true }); });
