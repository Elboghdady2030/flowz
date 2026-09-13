const flow = document.querySelector("#comment-flow");
const empty = document.querySelector("#wall-empty");
const count = document.querySelector("#live-count");
const sourceTitle = document.querySelector("#source-title");
const lastUpdated = document.querySelector("#last-updated");

const visibleCardLimit = 9;

let signature = "";

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

function render(data) {
  const comments = Array.isArray(data.comments) ? data.comments.slice(0, visibleCardLimit) : [];
  const nextSignature = comments.map((item) => `${item.id}:${item.moderatedAt || item.createdAt}`).join("|");
  count.textContent = String(data.total || comments.length);
  sourceTitle.textContent = data.source?.author ? `Replies to ${data.source.author}` : "Community replies";
  lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  empty.hidden = comments.length > 0;
  if (nextSignature === signature) return;
  signature = nextSignature;

  flow.innerHTML = comments.map((comment, index) => {
    return `<article class="flow-card flow-card--${index + 1}">
      <p>${escapeHtml(comment.text)}</p>
      <footer>${avatar(comment)}<span><strong>${escapeHtml(comment.name || comment.author)}</strong><small>${escapeHtml(comment.author)}</small></span><b aria-label="Approved">&#10003;</b></footer>
    </article>`;
  }).join("");
}

async function refresh() {
  try {
    const response = await fetch("/api/public", { cache: "no-store" });
    if (!response.ok) throw new Error("Live feed unavailable");
    render(await response.json());
  } catch {
    lastUpdated.textContent = "Reconnecting...";
    empty.hidden = false;
  }
}

refresh();
window.setInterval(refresh, 5000);
