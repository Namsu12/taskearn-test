// ========================================
// NOTIFICATIONS BELL - standalone, reusable
// ========================================
// Usage (inside your own dashboard.js / profile.js, after Firebase init):
//
//   import { initNotificationBell } from "./notifications.js";
//
//   onAuthStateChanged(auth, (user) => {
//     if (!user) { window.location.href = "login.html"; return; }
//     initNotificationBell(db, user.uid); // <-- add this one line
//     // ...rest of your existing page logic
//   });
//
// Requires an element with id="notificationBtn" already on the page
// (both dashboard.html and profile.html already have this). Nothing else
// needs to exist — this injects its own panel markup and styles.

import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

let injected = false;
let unsubscribe = null;

export function initNotificationBell(db, uid, bellId = "notificationBtn") {
  const bell = document.getElementById(bellId);
  if (!bell) {
    console.warn(`initNotificationBell: no element with id="${bellId}" found on this page.`);
    return;
  }

  injectStylesOnce();
  const { panel, badge } = buildPanel(bell);

  if (unsubscribe) unsubscribe(); // avoid stacking listeners if called twice

  const q = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const unreadCount = items.filter((n) => !n.read).length;

    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    badge.style.display = unreadCount > 0 ? "flex" : "none";

    renderList(panel, items, db, uid);
  }, (err) => {
    console.error("Notifications listener error:", err);
    panel.querySelector(".notif-list").innerHTML =
      `<div class="notif-empty">Couldn't load notifications.</div>`;
  });

  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("notif-panel-open");
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== bell) {
      panel.classList.remove("notif-panel-open");
    }
  });
}

function buildPanel(bell) {
  // Make the bell a positioning anchor for the unread badge.
  bell.style.position = "relative";
  bell.style.display = "inline-block";

  const badge = document.createElement("span");
  badge.className = "notif-badge";
  badge.style.display = "none";
  bell.appendChild(badge);

  const panel = document.createElement("div");
  panel.className = "notif-panel";
  panel.innerHTML = `
    <div class="notif-panel-header">
      <span>Notifications</span>
      <button type="button" class="notif-mark-all">Mark all read</button>
    </div>
    <div class="notif-list">
      <div class="notif-empty">No notifications yet.</div>
    </div>
  `;
  document.body.appendChild(panel);
  positionPanel(bell, panel);
  window.addEventListener("resize", () => positionPanel(bell, panel));

  return { panel, badge };
}

function positionPanel(bell, panel) {
  const rect = bell.getBoundingClientRect();
  const panelWidth = 320;
  let left = rect.right - panelWidth;
  left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));
  panel.style.top = `${rect.bottom + window.scrollY + 10}px`;
  panel.style.left = `${left + window.scrollX}px`;
}

function renderList(panel, items, db, uid) {
  const listEl = panel.querySelector(".notif-list");
  const markAllBtn = panel.querySelector(".notif-mark-all");

  if (!items.length) {
    listEl.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
    markAllBtn.style.display = "none";
    return;
  }

  markAllBtn.style.display = items.some((n) => !n.read) ? "block" : "none";
  markAllBtn.onclick = async () => {
    try {
      const batch = writeBatch(db);
      items.filter((n) => !n.read).forEach((n) => {
        batch.update(doc(db, "users", uid, "notifications", n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Mark all read error:", err);
    }
  };

  listEl.innerHTML = items.map((n) => `
    <div class="notif-item ${n.read ? "" : "unread"}" data-id="${n.id}">
      <p class="notif-message">${escapeHtml(n.message || "")}</p>
      <span class="notif-time">${timeAgo(n.createdAt)}</span>
    </div>
  `).join("");

  listEl.querySelectorAll(".notif-item").forEach((row) => {
    row.addEventListener("click", async () => {
      const id = row.dataset.id;
      const item = items.find((n) => n.id === id);
      if (item && !item.read) {
        try {
          await updateDoc(doc(db, "users", uid, "notifications", id), { read: true });
        } catch (err) {
          console.error("Mark read error:", err);
        }
      }
    });
  });
}

function timeAgo(timestamp) {
  if (!timestamp) return "";
  const ms = Date.now() - timestamp.toDate().getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return timestamp.toDate().toLocaleDateString("en-GB");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function injectStylesOnce() {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = `
    .notif-badge {
      position: absolute;
      top: -6px;
      right: -8px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 10px;
      background: #ff6b6b;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      align-items: center;
      justify-content: center;
      display: none;
    }
    .notif-panel {
      position: absolute;
      width: 320px;
      max-width: calc(100vw - 24px);
      max-height: 0;
      overflow: hidden;
      background: #141a26;
      border: 1px solid #1e2537;
      border-radius: 14px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      z-index: 1000;
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity 0.15s ease, transform 0.15s ease, max-height 0.15s ease;
      pointer-events: none;
    }
    .notif-panel.notif-panel-open {
      max-height: 420px;
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
      overflow-y: auto;
    }
    .notif-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid #1e2537;
      font-size: 13px;
      font-weight: 700;
      color: #e6f1ff;
      position: sticky;
      top: 0;
      background: #141a26;
    }
    .notif-mark-all {
      background: none;
      border: none;
      color: #00d4ff;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .notif-list {
      display: flex;
      flex-direction: column;
    }
    .notif-item {
      padding: 12px 16px;
      border-bottom: 1px solid #1a2030;
      cursor: pointer;
    }
    .notif-item:last-child { border-bottom: none; }
    .notif-item.unread { background: rgba(0, 212, 255, 0.06); }
    .notif-item.unread .notif-message { color: #e6f1ff; }
    .notif-message {
      font-size: 13px;
      color: #ccd6f6;
      line-height: 1.5;
      margin-bottom: 4px;
      word-break: break-word;
    }
    .notif-time {
      font-size: 11px;
      color: #4a5670;
    }
    .notif-empty {
      padding: 30px 16px;
      text-align: center;
      font-size: 13px;
      color: #4a5670;
    }
  `;
  document.head.appendChild(style);
}
