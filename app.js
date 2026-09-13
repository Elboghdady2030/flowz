const STORAGE_KEY = "tweet-comment-flow-v1";

const demoReplies = [
  ["@maya", "The motion on this board feels alive without getting noisy."],
  ["@omar", "This is exactly how live social proof should land on a launch page."],
  ["@nora", "Approve-first moderation is the right move for a public display."],
  ["@zane", "The branded cards make the replies feel part of the campaign."],
  ["@lina", "Can we run this during the webinar? It would look great on the big screen."],
  ["@samir", "Love that the live list stays readable while the cards move."],
  ["@talia", "The flow gives real-time energy without sacrificing control."],
  ["@idris", "This would be perfect for product drops and event recaps."]
];

const accents = ["#ff684f", "#1aa997", "#f4c95d", "#3978e7", "#6b4fc8"];
const tokens = ["FlowProof", "Live", "Launch", "Signal", "Verified"];

const state = loadState();
let liveTimer = null;
let brandTimer = null;

const els = {
  tweetForm: document.querySelector("#tweet-form"),
  tweetUrl: document.querySelector("#tweet-url"),
  sourceLabel: document.querySelector("#source-label"),
  replyBatch: document.querySelector("#reply-batch"),
  importReplies: document.querySelector("#import-replies"),
  toggleLive: document.querySelector("#toggle-live"),
  queueList: document.querySelector("#queue-list"),
  flowStage: document.querySelector("#flow-stage"),
  emptyState: document.querySelector("#empty-state"),
  publishedList: document.querySelector("#published-list"),
  pendingCount: document.querySelector("#pending-count"),
  publishedCount: document.querySelector("#published-count"),
  rejectedCount: document.querySelector("#rejected-count"),
  clearBoard: document.querySelector("#clear-board"),
  exportJson: document.querySelector("#export-json")
};

hydrate();
render();
seedBrandTokens();

els.tweetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.tweetUrl = els.tweetUrl.value.trim();
  saveState();
  renderSource();
});

els.importReplies.addEventListener("click", () => {
  const lines = els.replyBatch.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    demoReplies.slice(0, 3).forEach(([author, text]) => addPending(author, text));
  } else {
    lines.forEach((line, index) => {
      const match = line.match(/^(@?[\w.-]+)\s*:\s*(.+)$/);
      const author = match ? normalizeAuthor(match[1]) : `@guest${index + 1}`;
      const text = match ? match[2].trim() : line;
      addPending(author, text);
    });
  }

  els.replyBatch.value = "";
  saveState();
  render();
});

els.toggleLive.addEventListener("click", () => {
  if (liveTimer) {
    stopLiveDemo();
    return;
  }

  els.toggleLive.textContent = "Stop Live Demo";
  let index = 0;
  liveTimer = window.setInterval(() => {
    const reply = demoReplies[index % demoReplies.length];
    addPending(reply[0], reply[1]);
    index += 1;
    saveState();
    render();
  }, 2600);
});

els.queueList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const id = event.target.closest("[data-id]")?.dataset.id;

  if (!action || !id) return;

  if (action === "approve") approveComment(id);
  if (action === "reject") rejectComment(id);

  saveState();
  render();
});

els.clearBoard.addEventListener("click", () => {
  stopLiveDemo();
  state.pending = [];
  state.approved = [];
  state.rejected = [];
  state.tweetUrl = "";
  els.tweetUrl.value = "";
  saveState();
  document.querySelectorAll(".live-card, .brand-token").forEach((node) => node.remove());
  seedBrandTokens();
  render();
});

els.exportJson.addEventListener("click", () => {
  const payload = JSON.stringify({
    tweetUrl: state.tweetUrl,
    exportedAt: new Date().toISOString(),
    approved: state.approved
  }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "approved-comments.json";
  link.click();
  URL.revokeObjectURL(url);
});

function hydrate() {
  els.tweetUrl.value = state.tweetUrl;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      tweetUrl: saved?.tweetUrl || "",
      pending: Array.isArray(saved?.pending) ? saved.pending : [],
      approved: Array.isArray(saved?.approved) ? saved.approved : [],
      rejected: Array.isArray(saved?.rejected) ? saved.rejected : []
    };
  } catch {
    return { tweetUrl: "", pending: [], approved: [], rejected: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeAuthor(author) {
  const clean = author.trim().replace(/^@*/, "");
  return `@${clean || "guest"}`;
}

function addPending(author, text) {
  state.pending.unshift({
    id: crypto.randomUUID(),
    author: normalizeAuthor(author),
    text: text.slice(0, 220),
    createdAt: new Date().toISOString()
  });
}

function approveComment(id) {
  const comment = takePending(id);
  if (!comment) return;

  const approved = {
    ...comment,
    approvedAt: new Date().toISOString()
  };
  state.approved.unshift(approved);
  launchCard(approved);
}

function rejectComment(id) {
  const comment = takePending(id);
  if (!comment) return;

  state.rejected.unshift({
    ...comment,
    rejectedAt: new Date().toISOString()
  });
}

function takePending(id) {
  const index = state.pending.findIndex((comment) => comment.id === id);
  if (index === -1) return null;
  const [comment] = state.pending.splice(index, 1);
  return comment;
}

function render() {
  renderSource();
  renderQueue();
  renderPublished();
  renderCounts();
  els.emptyState.hidden = state.approved.length > 0;
}

function renderSource() {
  els.sourceLabel.textContent = state.tweetUrl
    ? `Connected source: ${state.tweetUrl}`
    : "No tweet connected yet.";
}

function renderQueue() {
  if (!state.pending.length) {
    els.queueList.innerHTML = `<p class="source-label">Incoming comments wait here until an admin approves them.</p>`;
    return;
  }

  els.queueList.innerHTML = state.pending.map((comment) => `
    <article class="queue-card" data-id="${comment.id}">
      <header class="comment-meta">
        <span class="comment-topic">Incoming</span>
        <span class="author-chip">
          <span class="comment-avatar" aria-hidden="true">${escapeHtml(getInitial(comment.author))}</span>
          ${escapeHtml(comment.author)}
        </span>
      </header>
      <p class="comment-copy">${escapeHtml(comment.text)}</p>
      <div class="card-actions">
        <button type="button" data-action="approve">Approve & Publish</button>
        <button class="reject" type="button" data-action="reject">Reject</button>
      </div>
    </article>
  `).join("");
}

function renderPublished() {
  if (!state.approved.length) {
    els.publishedList.innerHTML = `<li>No live comments yet.</li>`;
    return;
  }

  els.publishedList.innerHTML = state.approved.slice(0, 12).map((comment) => `
    <li>
      <span class="comment-avatar" aria-hidden="true">${escapeHtml(getInitial(comment.author))}</span>
      <span><strong>${escapeHtml(comment.author)}</strong>${escapeHtml(comment.text)}</span>
    </li>
  `).join("");
}

function renderCounts() {
  els.pendingCount.textContent = state.pending.length;
  els.publishedCount.textContent = state.approved.length;
  els.rejectedCount.textContent = state.rejected.length;
}

function launchCard(comment) {
  const card = document.createElement("article");
  card.className = "live-card";
  card.style.top = `${randomInt(8, 68)}%`;
  card.style.setProperty("--duration", `${randomInt(15, 26)}s`);
  card.style.setProperty("--rise", `${randomInt(-44, 34)}px`);
  card.style.setProperty("--tilt", `${randomInt(-3, 3)}deg`);
  card.style.setProperty("--tilt-end", `${randomInt(-3, 3)}deg`);
  card.innerHTML = `
    <header class="comment-meta">
      <span class="comment-topic">Live reply</span>
      <span class="author-chip">
        <span class="comment-avatar" aria-hidden="true">${escapeHtml(getInitial(comment.author))}</span>
        ${escapeHtml(comment.author)}
      </span>
    </header>
    <p class="comment-copy">${escapeHtml(comment.text)}</p>
    <footer>
      <span>Approved for the live board</span>
      <span>${new Date(comment.approvedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </footer>
  `;
  card.addEventListener("animationend", () => card.remove());
  els.flowStage.append(card);
  maybeLaunchToken();
}

function seedBrandTokens() {
  if (brandTimer) return;
  brandTimer = window.setInterval(maybeLaunchToken, 5200);
}

function maybeLaunchToken() {
  const token = document.createElement("span");
  token.className = "brand-token";
  token.textContent = tokens[randomInt(0, tokens.length - 1)];
  token.style.top = `${randomInt(10, 76)}%`;
  token.style.setProperty("--duration", `${randomInt(17, 30)}s`);
  token.style.setProperty("--rise", `${randomInt(-24, 24)}px`);
  token.style.setProperty("--tilt", `${randomInt(-5, 5)}deg`);
  token.style.setProperty("--tilt-end", `${randomInt(-5, 5)}deg`);
  token.style.setProperty("--token-bg", accents[randomInt(0, accents.length - 1)]);
  token.addEventListener("animationend", () => token.remove());
  els.flowStage.append(token);
}

function stopLiveDemo() {
  window.clearInterval(liveTimer);
  liveTimer = null;
  els.toggleLive.textContent = "Start Live Demo";
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getInitial(author) {
  return author.replace(/^@/, "").charAt(0).toUpperCase() || "?";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
