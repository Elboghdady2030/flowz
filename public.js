const flow = document.querySelector("#comment-flow");
const empty = document.querySelector("#wall-empty");
const count = document.querySelector("#live-count");
const sourceTitle = document.querySelector("#source-title");
const lastUpdated = document.querySelector("#last-updated");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileLayout = window.matchMedia("(max-width: 760px)");
const tabletLayout = window.matchMedia("(max-width: 1100px)");
const activeIds = new Set();
const priorityIds = [];
let comments = [];
let knownIds = new Set();
let cursor = 0;
let lane = 0;
let spawnTimer;

function syncFlowTravel() {
  const height = Math.max(flow.clientHeight, 320);
  flow.style.setProperty("--flow-mid", `${Math.round(height * 0.48)}px`);
  flow.style.setProperty("--flow-high", `${Math.round(height * 0.84)}px`);
  flow.style.setProperty("--flow-travel", `${height}px`);
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function initials(name = "?") {
  return name.replace(/^@/, "").slice(0, 1).toUpperCase() || "?";
}

function avatar(comment) {
  if (comment.avatarUrl) {
    return `<img class="flow-avatar" src="${escapeHtml(comment.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return `<span class="flow-avatar flow-avatar--fallback" aria-hidden="true">${escapeHtml(initials(comment.author))}</span>`;
}

function cardMarkup(comment) {
  return `<header class="flow-author">${avatar(comment)}<span><strong>${escapeHtml(comment.name || comment.author)}</strong><small>${escapeHtml(comment.author)}</small></span><b aria-label="Approved">&#10003;</b></header>
    <p dir="auto">${escapeHtml(comment.text)}</p>`;
}

function cardSize(comment) {
  const length = Array.from(String(comment.text || "").trim()).length;
  if (length <= 58) return "flow-size--compact";
  if (length >= 145) return "flow-size--long";
  return "flow-size--regular";
}

function nextComment() {
  while (priorityIds.length) {
    const id = priorityIds.shift();
    const priority = comments.find((comment) => comment.id === id);
    if (priority && !activeIds.has(priority.id)) return priority;
  }

  for (let attempts = 0; attempts < comments.length; attempts += 1) {
    const comment = comments[cursor % comments.length];
    cursor += 1;
    if (!activeIds.has(comment.id)) return comment;
  }
  return null;
}

function spawnComment() {
  if (!comments.length || document.hidden) return;
  const comment = nextComment();
  if (!comment) return;

  const card = document.createElement("article");
  const laneCount = mobileLayout.matches ? 1 : tabletLayout.matches ? 2 : 3;
  const laneClass = `flow-lane--${(lane % laneCount) + 1}`;
  const depthClass = `flow-depth--${(lane % 3) + 1}`;
  const sideClass = lane % 2 ? "flow-side--end" : "flow-side--start";
  lane += 1;
  card.className = `flow-card ${laneClass} ${depthClass} ${sideClass} ${cardSize(comment)}`;
  card.dataset.commentId = comment.id;
  card.innerHTML = cardMarkup(comment);

  if (prefersReducedMotion.matches) {
    flow.replaceChildren(card);
    return;
  }

  activeIds.add(comment.id);
  card.addEventListener("animationend", () => {
    activeIds.delete(comment.id);
    card.remove();
  }, { once: true });
  flow.append(card);
}

function restartFlow() {
  window.clearInterval(spawnTimer);
  syncFlowTravel();
  flow.replaceChildren();
  activeIds.clear();
  cursor = 0;
  lane = 0;
  if (!comments.length) return;

  spawnComment();
  const interval = mobileLayout.matches ? 4000 : 2000;
  spawnTimer = window.setInterval(spawnComment, interval);
}

function applyFeed(data) {
  const incoming = Array.isArray(data.comments) ? data.comments : [];
  const incomingIds = new Set(incoming.map((comment) => comment.id));
  const firstLoad = knownIds.size === 0;

  if (!firstLoad) {
    for (const comment of incoming) {
      if (!knownIds.has(comment.id)) priorityIds.push(comment.id);
    }
  }

  const listChanged = incoming.length !== comments.length || incoming.some((comment, index) => comment.id !== comments[index]?.id);
  comments = incoming;
  knownIds = incomingIds;
  count.textContent = String(data.total || incoming.length);
  sourceTitle.textContent = data.source?.author ? `Replies to ${data.source.author}` : "Community replies";
  lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  empty.hidden = incoming.length > 0;

  if (listChanged || (!spawnTimer && incoming.length)) restartFlow();
}

async function refresh() {
  try {
    const firstResponse = await fetch("/api/public?offset=0", { cache: "no-store" });
    if (!firstResponse.ok) throw new Error("Live feed unavailable");
    const data = await firstResponse.json();
    const allComments = [...(data.comments || [])];
    let nextOffset = data.nextOffset;
    while (nextOffset !== null && nextOffset !== undefined) {
      const response = await fetch(`/api/public?offset=${nextOffset}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Live feed unavailable");
      const page = await response.json();
      allComments.push(...(page.comments || []));
      nextOffset = page.nextOffset;
    }
    applyFeed({ ...data, comments: allComments });
  } catch {
    lastUpdated.textContent = "Reconnecting...";
    if (!comments.length) empty.hidden = false;
  }
}

prefersReducedMotion.addEventListener("change", restartFlow);
mobileLayout.addEventListener("change", restartFlow);
tabletLayout.addEventListener("change", restartFlow);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && comments.length && !flow.children.length) spawnComment();
});

if ("ResizeObserver" in window) {
  const flowResizeObserver = new ResizeObserver(syncFlowTravel);
  flowResizeObserver.observe(flow);
} else {
  window.addEventListener("resize", syncFlowTravel);
}

syncFlowTravel();
refresh();
window.setInterval(refresh, 10000);
