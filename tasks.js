// ========================================
// TASKS + INCOME - COMPLETE WITH FIREBASE
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, increment,
  collection, getDocs, addDoc, query, where, orderBy,
  onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { enforceAccountGuard } from "./accountGuard.js";
import { uiAlert, uiConfirm } from "./ui.js";

const firebaseConfig = {
    apiKey: "AIzaSyCfKvla4_5nt-XZcdNe0reZTjOvMF7yAfw",
    authDomain: "taskearn0012.firebaseapp.com",
    projectId: "taskearn0012",
    storageBucket: "taskearn0012.firebasestorage.app",
    messagingSenderId: "269601831416",
    appId: "1:269601831416:web:86735b964a5ecf43e7fe0d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const MAIN_BALANCE_FIELD = "balance";
const TASK_WALLET_FIELD = "taskWallet";
const TASKS_COLLECTION = "tasks";
const TASK_WITHDRAWALS_COLLECTION = "taskWithdrawals";

const SETTINGS_DOC = "settings/withdrawal";
const REWARD_SETTINGS_DOC = "settings/taskPricing";
const TASK_APPROVAL_DOC = "settings/taskApproval";
const REDIRECT_COUNTDOWN_SECONDS = 10;

let currentUid = null;
let completedTaskIds = new Set();
let currentTaskWallet = 0;
let withdrawLocked = true;
let withdrawLockMessage = "Withdrawals are currently locked. Check back soon.";
let taskMinWithdrawal = 0;
let hasBankDetails = false;
let advertiserPricePerSlot = 0;
let workerRewardPerTask = 0;
let taskApprovalRequired = false;
let isAdminUser = false;
let adminPanelInitialized = false;

// ========================================
// AUTH
// ========================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const blocked = await enforceAccountGuard(db, auth, user.uid);
    if (blocked) return;

  currentUid = user.uid;

  await ensureUserDoc(currentUid);
  listenToUserDoc(currentUid);
  listenToWithdrawalLock();
  listenToRewardSetting();
  listenToTaskApprovalSetting();
  await loadCompletedTaskIds(currentUid);
  loadAvailableTasks();
  loadMyPostedTasks();
  listenToTaskHistory();
  listenToWithdrawalHistory();
});

async function ensureUserDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const updates = {};
  if (!snap.exists()) {
    updates[MAIN_BALANCE_FIELD] = 0;
    updates[TASK_WALLET_FIELD] = 0;
    await setDoc(ref, updates, { merge: true });
    return;
  }
  const data = snap.data();
  if (data[TASK_WALLET_FIELD] === undefined) {
    await updateDoc(ref, { [TASK_WALLET_FIELD]: 0 });
  }
}

function listenToUserDoc(uid) {
  const ref = doc(db, "users", uid);
  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const mainBalance = data[MAIN_BALANCE_FIELD] || 0;
    currentTaskWallet = data[TASK_WALLET_FIELD] || 0;

    const topBalanceEl = document.getElementById("topBalance");
    if (topBalanceEl) topBalanceEl.textContent = formatAmount(mainBalance);

    const taskWalletEl = document.getElementById("taskWalletAmount");
    if (taskWalletEl) taskWalletEl.textContent = formatAmount(currentTaskWallet);

    isAdminUser = data.isAdmin === true;
    applyAdminVisibility();

    hasBankDetails = !!data.bankDetails;
  });
}

// ========================================
// ADMIN PANEL
// ========================================
function applyAdminVisibility() {
  const tabBtn = document.getElementById("adminTabBtn");
  const content = document.getElementById("admin-content");
  if (!tabBtn || !content) return;

  if (isAdminUser) {
    tabBtn.classList.remove("admin-only");
    content.classList.remove("admin-only");
    if (!adminPanelInitialized) {
      adminPanelInitialized = true;
      initAdminPanel();
    }
  } else {
    tabBtn.classList.add("admin-only");
    content.classList.add("admin-only");
  }
}

async function getUserDisplay(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return uid.slice(0, 8);
    const d = snap.data();
    return d.email || d.name || d.fullName || uid.slice(0, 8);
  } catch {
    return uid.slice(0, 8);
  }
}

function initAdminPanel() {
  const adminSubButtons = document.querySelectorAll(".admin-subtab-btn");
  const adminSubContents = document.querySelectorAll(".admin-subtab-content");
  adminSubButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      adminSubButtons.forEach((b) => b.classList.remove("active"));
      adminSubContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`admin-${btn.dataset.adminSubtab}-subcontent`).classList.add("active");
    });
  });

  document.getElementById("rewardSettingForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const advInput = document.getElementById("advertiserPriceInput");
    const workerInput = document.getElementById("workerRewardInput");
    const msg = document.getElementById("rewardSettingMessage");
    const btn = document.getElementById("rewardSettingSubmit");
    const advValue = Number(advInput.value);
    const workerValue = Number(workerInput.value);

    if (!advValue || advValue <= 0 || !workerValue || workerValue <= 0) {
      msg.textContent = "Enter valid amounts for both fields.";
      msg.className = "form-message error";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const [c, d] = REWARD_SETTINGS_DOC.split("/");
      await setDoc(doc(db, c, d), {
        advertiserPricePerSlot: advValue,
        workerRewardPerTask: workerValue
      }, { merge: true });
      msg.textContent = "Pricing updated.";
      msg.className = "form-message success";
    } catch (err) {
      msg.textContent = err.message || "Couldn't save. Try again.";
      msg.className = "form-message error";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-save"></i> Save Price`;
    }
  });

  document.getElementById("withdrawLockForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("withdrawLockSaveMessage");
    const btn = document.getElementById("withdrawLockSaveBtn");
    const locked = document.getElementById("withdrawLockToggle").checked;
    const message = document.getElementById("withdrawLockMessageInput").value.trim();
    const minAmount = Number(document.getElementById("minWithdrawalInput").value) || 0;

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const [c, d] = SETTINGS_DOC.split("/");
      await setDoc(doc(db, c, d), { locked, message, minAmount }, { merge: true });
      msg.textContent = locked ? "Withdrawals are now locked." : "Withdrawals are now open.";
      msg.className = "form-message success";
    } catch (err) {
      msg.textContent = err.message || "Couldn't save. Try again.";
      msg.className = "form-message error";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-save"></i> Save`;
    }
  });

  document.getElementById("taskApprovalForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("taskApprovalMessage");
    const btn = document.getElementById("taskApprovalSaveBtn");
    const required = document.getElementById("taskApprovalToggle").checked;

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const [c, d] = TASK_APPROVAL_DOC.split("/");
      await setDoc(doc(db, c, d), { required }, { merge: true });
      msg.textContent = required
        ? "New advertiser tasks now need your approval before going live."
        : "New advertiser tasks go live immediately again.";
      msg.className = "form-message success";
    } catch (err) {
      msg.textContent = err.message || "Couldn't save. Try again.";
      msg.className = "form-message error";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-save"></i> Save`;
    }
  });

  document.getElementById("adminTaskForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("adminTaskMessage");
    const btn = document.getElementById("adminTaskSubmit");

    const title = document.getElementById("adminTaskTitle").value.trim();
    const description = document.getElementById("adminTaskDescription").value.trim();
    const link = document.getElementById("adminTaskLink").value.trim();
    const reward = Number(document.getElementById("adminTaskReward").value);
    const slots = Number(document.getElementById("adminTaskSlots").value);

    if (!title || !description || !link || !reward || !slots || reward <= 0 || slots <= 0) {
      msg.textContent = "Please fill in every field with valid values.";
      msg.className = "form-message error";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Posting...";
    try {
      await addDoc(collection(db, TASKS_COLLECTION), {
        title, description, link, reward,
        slotsTotal: slots,
        slotsFilled: 0,
        status: "active",
        createdBy: currentUid,
        createdByAdmin: true,
        createdAt: serverTimestamp()
      });
      msg.textContent = "Task posted — free, no wallet charged.";
      msg.className = "form-message success";
      e.target.reset();
    } catch (err) {
      msg.textContent = err.message || "Couldn't post this task. Try again.";
      msg.className = "form-message error";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-bullhorn"></i> Post Task (Free)`;
    }
  });

  loadAdminManageTasks();
  loadAdminWithdrawalRequests();
}

function loadAdminManageTasks() {
  const listEl = document.getElementById("adminAllTasksList");
  if (!listEl) return;

  onSnapshot(query(collection(db, TASKS_COLLECTION), orderBy("createdAt", "desc")), (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No tasks posted yet.</div>`;
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const task = docSnap.data();
      const id = docSnap.id;
      const status = task.status || "active";
      const item = document.createElement("div");
      item.className = "task-item";

      let actionsHtml = "";
      if (status === "pending") {
        actionsHtml = `
          <button class="btn-admin-action approve" data-action="approve">Approve</button>
          <button class="btn-admin-action reject" data-action="reject">Reject</button>`;
      } else if (status === "active") {
        actionsHtml = `
          <button class="btn-admin-action close" data-action="close">Close</button>
          <button class="btn-admin-action delete" data-action="delete">Delete</button>`;
      } else if (status === "closed") {
        actionsHtml = `
          <button class="btn-admin-action reopen" data-action="reopen">Reopen</button>
          <button class="btn-admin-action delete" data-action="delete">Delete</button>`;
      } else {
        actionsHtml = `<button class="btn-admin-action delete" data-action="delete">Delete</button>`;
      }

      item.innerHTML = `
        <div class="task-item-top">
          <div class="task-item-title">${escapeHtml(task.title || "Untitled")}</div>
          <span class="reward-badge"><i class="fas fa-coins"></i> pays ${formatAmount(task.reward)}</span>
        </div>
        <div class="task-item-desc">${escapeHtml(task.description || "")}</div>
        <div class="task-item-meta">
          <span><i class="fas fa-users"></i> ${task.slotsFilled || 0}/${task.slotsTotal || 0}</span>
          <span class="status-badge ${status}">${status}</span>
          ${task.createdByAdmin ? "<span>admin posted (free)</span>" : `<span>advertiser paid ${formatAmount(task.pricePerSlot)}/slot</span>`}
        </div>
        <div class="admin-action-row">${actionsHtml}</div>
      `;

      item.querySelector('[data-action="approve"]')?.addEventListener("click", () =>
        updateDoc(doc(db, TASKS_COLLECTION, id), { status: "active" }).catch(async (err) => {
          await uiAlert({ title: 'Action Failed', message: err.message, type: 'danger' });
        }));
      item.querySelector('[data-action="reject"]')?.addEventListener("click", () => rejectAdvertiserTask(id, task));
      item.querySelector('[data-action="close"]')?.addEventListener("click", () =>
        updateDoc(doc(db, TASKS_COLLECTION, id), { status: "closed" }).catch(async (err) => {
          await uiAlert({ title: 'Action Failed', message: err.message, type: 'danger' });
        }));
      item.querySelector('[data-action="reopen"]')?.addEventListener("click", () =>
        updateDoc(doc(db, TASKS_COLLECTION, id), { status: "active" }).catch(async (err) => {
          await uiAlert({ title: 'Action Failed', message: err.message, type: 'danger' });
        }));
      item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
        const ok = await uiConfirm({
          title: 'Delete Task',
          type: 'danger',
          confirmText: 'Delete',
          confirmStyle: 'danger',
          cancelText: 'Cancel',
          message: 'This task will be permanently deleted. This cannot be undone.'
        });
        if (!ok) return;
        deleteDoc(doc(db, TASKS_COLLECTION, id)).catch(async (err) => {
          await uiAlert({ title: 'Delete Failed', message: err.message, type: 'danger' });
        });
      });
      listEl.appendChild(item);
    });
  }, (err) => {
    listEl.innerHTML = `<div class="empty-state">Couldn't load tasks (${err.message}).</div>`;
  });
}

async function rejectAdvertiserTask(id, task) {
  if (task.createdByAdmin) {
    const ok = await uiConfirm({
      title: 'Delete Task',
      type: 'danger',
      confirmText: 'Delete',
      confirmStyle: 'danger',
      cancelText: 'Cancel',
      message: 'This admin-posted task will be permanently deleted.'
    });
    if (!ok) return;
    deleteDoc(doc(db, TASKS_COLLECTION, id)).catch(async (err) => {
      await uiAlert({ title: 'Delete Failed', message: err.message, type: 'danger' });
    });
    return;
  }

  const refund = (task.pricePerSlot || 0) * (task.slotsTotal || 0);

  const ok = await uiConfirm({
    title: 'Reject Task',
    type: 'danger',
    confirmText: 'Reject & Refund',
    confirmStyle: 'danger',
    cancelText: 'Cancel',
    message: `
      <p>Reject this advertiser's task?</p>
      <p>The advertiser will be refunded <span class="te-amount">₦${formatAmount(refund)}</span> to their main wallet.</p>
    `
  });
  if (!ok) return;

  try {
    await runTransaction(db, async (tx) => {
      const taskRef = doc(db, TASKS_COLLECTION, id);
      const taskSnap = await tx.get(taskRef);
      if (!taskSnap.exists() || taskSnap.data().status !== "pending") {
        throw new Error("This task has already been reviewed.");
      }
      tx.update(taskRef, { status: "rejected" });
      tx.update(doc(db, "users", task.createdBy), { [MAIN_BALANCE_FIELD]: increment(refund) });
    });
  } catch (err) {
    await uiAlert({ title: "Couldn't Reject Task", message: err.message || 'Something went wrong.', type: 'danger' });
  }
}

function loadAdminWithdrawalRequests() {
  const pendingEl = document.getElementById("adminPendingWithdrawalsList");
  const reviewedEl = document.getElementById("adminReviewedWithdrawalsList");
  if (!pendingEl || !reviewedEl) return;

  onSnapshot(query(collection(db, TASK_WITHDRAWALS_COLLECTION), where("status", "==", "pending")), async (snap) => {
    if (snap.empty) {
      pendingEl.innerHTML = `<div class="empty-state">No pending requests.</div>`;
      return;
    }
    const cards = await Promise.all(snap.docs.map(async (docSnap) => {
      const w = docSnap.data();
      const id = docSnap.id;
      const who = await getUserDisplay(w.uid);
      return { id, w, who };
    }));
    pendingEl.innerHTML = "";
    cards.forEach(({ id, w, who }) => {
      const item = document.createElement("div");
      item.className = "task-item";
      item.innerHTML = `
        <div class="task-item-top">
          <div class="task-item-title">${escapeHtml(who)}</div>
          <span class="reward-badge"><i class="fas fa-coins"></i> ${formatAmount(w.amount)}</span>
        </div>
        <div class="admin-action-row">
          <button class="btn-admin-action approve" data-action="approve">Approve</button>
          <button class="btn-admin-action reject" data-action="reject">Reject</button>
        </div>
      `;
      item.querySelector('[data-action="approve"]').addEventListener("click", () => approveTaskWithdrawal(id));
      item.querySelector('[data-action="reject"]').addEventListener("click", () => rejectTaskWithdrawal(id, w.uid, w.amount));
      pendingEl.appendChild(item);
    });
  }, (err) => {
    pendingEl.innerHTML = `<div class="empty-state">Couldn't load requests (${err.message}).</div>`;
  });

  onSnapshot(query(collection(db, TASK_WITHDRAWALS_COLLECTION), where("status", "in", ["approved", "rejected"])), async (snap) => {
    if (snap.empty) {
      reviewedEl.innerHTML = `<div class="empty-state">Nothing reviewed yet.</div>`;
      return;
    }
    const docs = snap.docs.slice(0, 20);
    const cards = await Promise.all(docs.map(async (docSnap) => {
      const w = docSnap.data();
      const who = await getUserDisplay(w.uid);
      return { w, who };
    }));
    reviewedEl.innerHTML = "";
    cards.forEach(({ w, who }) => {
      const item = document.createElement("div");
      item.className = "task-item";
      item.innerHTML = `
        <div class="task-item-top">
          <div class="task-item-title">${escapeHtml(who)}</div>
          <span class="status-badge ${w.status}">${w.status}</span>
        </div>
        <div class="task-item-meta"><span>${formatAmount(w.amount)}</span></div>
      `;
      reviewedEl.appendChild(item);
    });
  });
}

async function approveTaskWithdrawal(id) {
  try {
    await updateDoc(doc(db, TASK_WITHDRAWALS_COLLECTION, id), {
      status: "approved",
      reviewedAt: serverTimestamp()
    });
  } catch (err) {
    await uiAlert({ title: "Couldn't Approve", message: err.message || 'Something went wrong.', type: 'danger' });
  }
}

async function rejectTaskWithdrawal(id, uid, amount) {
  const ok = await uiConfirm({
    title: 'Reject Withdrawal',
    type: 'danger',
    confirmText: 'Reject & Refund',
    confirmStyle: 'danger',
    cancelText: 'Cancel',
    message: `Refund <span class="te-amount">₦${formatAmount(amount)}</span> to this user's task wallet and mark the request rejected?`
  });
  if (!ok) return;

  try {
    await updateDoc(doc(db, "users", uid), { [TASK_WALLET_FIELD]: increment(amount) });
    await updateDoc(doc(db, TASK_WITHDRAWALS_COLLECTION, id), {
      status: "rejected",
      reviewedAt: serverTimestamp()
    });
  } catch (err) {
    await uiAlert({ title: "Couldn't Reject", message: err.message || 'Something went wrong.', type: 'danger' });
  }
}

function formatAmount(n) {
  return Number(n || 0).toLocaleString();
}

// ========================================
// COMPLETED TASK TRACKING
// ========================================
async function loadCompletedTaskIds(uid) {
  const snap = await getDocs(collection(db, "users", uid, "taskHistory"));
  completedTaskIds = new Set(snap.docs.map(d => d.id));
}

// ========================================
// AVAILABLE TASKS
// ========================================
function loadAvailableTasks() {
  const listEl = document.getElementById("tasksList");
  if (!listEl) return;

  const q = query(collection(db, TASKS_COLLECTION), where("status", "==", "active"));
  onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i>No tasks available right now. Check back later.</div>`;
      return;
    }

    listEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const task = { id: docSnap.id, ...docSnap.data() };
      listEl.appendChild(renderTaskItem(task));
    });
  }, (err) => {
    console.error("Available tasks listener error:", err);
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i>Couldn't load tasks. This is usually a Firestore permissions issue — check the browser console.</div>`;
  });
}

function renderTaskItem(task) {
  const wrapper = document.createElement("div");
  wrapper.className = "task-item";

  const slotsLeft = (task.slotsTotal || 0) - (task.slotsFilled || 0);
  const isOwnTask = task.createdBy === currentUid;
  const isCompleted = completedTaskIds.has(task.id);
  const isFull = slotsLeft <= 0;

  let buttonHtml = "";
  if (isOwnTask) {
    buttonHtml = `<button class="btn-task-action own-task" disabled>Your Task</button>`;
  } else if (isCompleted) {
    buttonHtml = `<button class="btn-task-action completed" disabled><i class="fas fa-check"></i> Completed</button>`;
  } else if (isFull) {
    buttonHtml = `<button class="btn-task-action full" disabled>Slots Full</button>`;
  } else {
    buttonHtml = `<button class="btn-task-action" data-task-id="${task.id}">Start Task</button>`;
  }

  wrapper.innerHTML = `
    <div class="task-item-top">
      <div class="task-item-title">${escapeHtml(task.title || "Untitled task")}</div>
      <span class="reward-badge"><i class="fas fa-coins"></i> +${formatAmount(task.reward)}</span>
    </div>
    <div class="task-item-desc">${escapeHtml(task.description || "")}</div>
    <div class="task-item-meta">
      <span><i class="fas fa-users"></i> ${Math.max(slotsLeft, 0)} / ${task.slotsTotal || 0} slots left</span>
    </div>
    <div class="task-item-actions">${buttonHtml}</div>
  `;

  const btn = wrapper.querySelector("button[data-task-id]");
  if (btn) {
    btn.addEventListener("click", () => startTaskCountdown(btn, task));
  }

  return wrapper;
}

async function startTaskCountdown(button, task) {
  if (!task.link) {
    await uiAlert({
      title: 'Task Unavailable',
      message: 'This task has no link configured. Please try another task.',
      type: 'warn'
    });
    return;
  }

  window.open(task.link, "_blank");

  let secondsLeft = REDIRECT_COUNTDOWN_SECONDS;
  button.disabled = true;
  button.textContent = `Verifying... ${secondsLeft}s`;

  const interval = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      clearInterval(interval);
      button.textContent = "Confirming...";
      completeTask(task, button);
    } else {
      button.textContent = `Verifying... ${secondsLeft}s`;
    }
  }, 1000);
}

async function completeTask(task, button) {
  const uid = currentUid;
  const taskRef = doc(db, TASKS_COLLECTION, task.id);
  const historyRef = doc(db, "users", uid, "taskHistory", task.id);
  const userRef = doc(db, "users", uid);

  try {
    await runTransaction(db, async (tx) => {
      const [taskSnap, historySnap] = await Promise.all([
        tx.get(taskRef),
        tx.get(historyRef)
      ]);

      if (!taskSnap.exists()) throw new Error("This task no longer exists.");
      if (historySnap.exists()) throw new Error("You've already completed this task.");

      const taskData = taskSnap.data();
      const slotsFilled = taskData.slotsFilled || 0;
      const slotsTotal = taskData.slotsTotal || 0;

      if (taskData.status !== "active" || slotsFilled >= slotsTotal) {
        throw new Error("This task is no longer available.");
      }

      const newSlotsFilled = slotsFilled + 1;
      tx.update(taskRef, {
        slotsFilled: newSlotsFilled,
        status: newSlotsFilled >= slotsTotal ? "closed" : "active"
      });

      tx.set(historyRef, {
        taskId: task.id,
        title: taskData.title,
        reward: taskData.reward,
        completedAt: serverTimestamp()
      });

      tx.update(userRef, {
        [TASK_WALLET_FIELD]: increment(taskData.reward)
      });
    });

    completedTaskIds.add(task.id);
    button.className = "btn-task-action completed";
    button.textContent = "Completed";
  } catch (err) {
    await uiAlert({
      title: 'Task Error',
      message: err.message || "Couldn't complete this task. Please try again.",
      type: 'danger'
    });
    button.disabled = false;
    button.textContent = "Start Task";
  }
}

// ========================================
// ADVERTISER: POST A TASK
// ========================================
const advertiserForm = document.getElementById("advertiserForm");
const advSlots = document.getElementById("advSlots");
const advCostPreview = document.getElementById("advCostPreview");
const advMessage = document.getElementById("advMessage");

function updateCostPreview() {
  const slots = Number(advSlots?.value) || 0;
  if (advCostPreview) advCostPreview.textContent = formatAmount(advertiserPricePerSlot * slots);
}
advSlots?.addEventListener("input", updateCostPreview);

advertiserForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("advSubmitBtn");
  advMessage.textContent = "";
  advMessage.className = "form-message";

  const title = document.getElementById("advTitle").value.trim();
  const description = document.getElementById("advDescription").value.trim();
  const link = document.getElementById("advLink").value.trim();
  const slots = Number(advSlots.value);

  if (!title || !description || !link || !slots || slots <= 0) {
    advMessage.textContent = "Please fill in every field with valid values.";
    advMessage.className = "form-message error";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Posting...";

  const userRef = doc(db, "users", currentUid);
  const [rewardCollection, rewardDocId] = REWARD_SETTINGS_DOC.split("/");
  const rewardRef = doc(db, rewardCollection, rewardDocId);
  const [approvalCollection, approvalDocId] = TASK_APPROVAL_DOC.split("/");
  const approvalRef = doc(db, approvalCollection, approvalDocId);

  try {
    await runTransaction(db, async (tx) => {
      const [userSnap, rewardSnap, approvalSnap] = await Promise.all([
        tx.get(userRef), tx.get(rewardRef), tx.get(approvalRef)
      ]);
      const pricingData = rewardSnap.exists() ? rewardSnap.data() : {};
      const pricePerSlot = Number(pricingData.advertiserPricePerSlot) || 0;
      const workerReward = Number(pricingData.workerRewardPerTask) || 0;
      const needsApproval = approvalSnap.exists() && approvalSnap.data().required === true;

      if (pricePerSlot <= 0 || workerReward <= 0) {
        throw new Error("Task pricing hasn't been set up by the admin yet.");
      }

      const cost = pricePerSlot * slots;
      const balance = userSnap.data()?.[MAIN_BALANCE_FIELD] || 0;

      if (balance < cost) {
        throw new Error(`Insufficient main wallet balance. You need ${formatAmount(cost)} but have ${formatAmount(balance)}.`);
      }

      tx.update(userRef, { [MAIN_BALANCE_FIELD]: increment(-cost) });

      const newTaskRef = doc(collection(db, TASKS_COLLECTION));
      tx.set(newTaskRef, {
        title, description, link,
        reward: workerReward,
        pricePerSlot,
        slotsTotal: slots,
        slotsFilled: 0,
        status: needsApproval ? "pending" : "active",
        createdBy: currentUid,
        createdAt: serverTimestamp()
      });
    });

    advMessage.textContent = taskApprovalRequired
      ? "Task submitted for admin review. It'll go live once approved."
      : "Task posted successfully.";
    advMessage.className = "form-message success";
    advertiserForm.reset();
    updateCostPreview();
  } catch (err) {
    advMessage.textContent = err.message || "Couldn't post this task. Try again.";
    advMessage.className = "form-message error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Post Task`;
  }
});

function loadMyPostedTasks() {
  const listEl = document.getElementById("myTasksList");
  if (!listEl) return;

  const q = query(collection(db, TASKS_COLLECTION), where("createdBy", "==", currentUid));
  onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No tasks posted yet.</div>`;
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const task = docSnap.data();
      const slotsLeft = (task.slotsTotal || 0) - (task.slotsFilled || 0);
      const item = document.createElement("div");
      item.className = "task-item";
      item.innerHTML = `
        <div class="task-item-top">
          <div class="task-item-title">${escapeHtml(task.title)}</div>
          <span class="status-badge ${task.status || "active"}">${task.status || "active"}</span>
        </div>
        <div class="task-item-desc">${escapeHtml(task.description)}</div>
        <div class="task-item-meta">
          <span><i class="fas fa-users"></i> ${task.slotsFilled || 0}/${task.slotsTotal || 0} completed</span>
          <span><i class="fas fa-coins"></i> ${formatAmount(task.pricePerSlot ?? task.reward)} paid per slot</span>
        </div>
      `;
      listEl.appendChild(item);
    });
  });
}

// ========================================
// ADVERTISER: ADMIN-CONTROLLED PRICING
// ========================================
function listenToRewardSetting() {
  const [collectionName, docId] = REWARD_SETTINGS_DOC.split("/");
  const ref = doc(db, collectionName, docId);
  onSnapshot(ref, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    advertiserPricePerSlot = Number(data.advertiserPricePerSlot) || 0;
    workerRewardPerTask = Number(data.workerRewardPerTask) || 0;

    const costEl = document.getElementById("advFixedReward");
    if (costEl) costEl.textContent = formatAmount(advertiserPricePerSlot);

    const workerEarnEl = document.getElementById("advWorkerEarnInfo");
    if (workerEarnEl) workerEarnEl.textContent = formatAmount(workerRewardPerTask);

    const adminAdvInput = document.getElementById("advertiserPriceInput");
    if (adminAdvInput && document.activeElement !== adminAdvInput) adminAdvInput.value = advertiserPricePerSlot || "";

    const adminWorkerInput = document.getElementById("workerRewardInput");
    if (adminWorkerInput && document.activeElement !== adminWorkerInput) adminWorkerInput.value = workerRewardPerTask || "";

    updateCostPreview();
  });
}

// ========================================
// TASK APPROVAL SETTING
// ========================================
function listenToTaskApprovalSetting() {
  const [c, d] = TASK_APPROVAL_DOC.split("/");
  onSnapshot(doc(db, c, d), (snap) => {
    taskApprovalRequired = snap.exists() && snap.data().required === true;
    const adminToggle = document.getElementById("taskApprovalToggle");
    if (adminToggle && document.activeElement !== adminToggle) adminToggle.checked = taskApprovalRequired;
  });
}

function listenToWithdrawalLock() {
  const [collectionName, docId] = SETTINGS_DOC.split("/");
  const ref = doc(db, collectionName, docId);
  onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      withdrawLocked = snap.data().locked !== false;
      withdrawLockMessage = snap.data().message || withdrawLockMessage;
      taskMinWithdrawal = Number(snap.data().minAmount) || 0;
    } else {
      withdrawLocked = true;
      taskMinWithdrawal = 0;
    }

    const adminToggle = document.getElementById("withdrawLockToggle");
    const adminMsgInput = document.getElementById("withdrawLockMessageInput");
    const adminMinInput = document.getElementById("minWithdrawalInput");
    if (adminToggle && document.activeElement !== adminToggle) adminToggle.checked = withdrawLocked;
    if (adminMsgInput && document.activeElement !== adminMsgInput) adminMsgInput.value = withdrawLockMessage;
    if (adminMinInput && document.activeElement !== adminMinInput) adminMinInput.value = taskMinWithdrawal || "";

    const noticeEl = document.getElementById("withdrawLockNotice");
    if (!noticeEl) return;

    if (withdrawLocked) {
      noticeEl.className = "lock-notice locked";
      noticeEl.innerHTML = `<i class="fas fa-lock"></i><span>${escapeHtml(withdrawLockMessage)}</span>`;
    } else {
      noticeEl.className = "lock-notice unlocked";
      noticeEl.innerHTML = `<i class="fas fa-lock-open"></i><span>Withdrawals are open. Requests are reviewed by an admin before payout. Minimum: ₦${formatAmount(taskMinWithdrawal)}</span>`;
    }
    noticeEl.style.display = "flex";
  });
}

// ========================================
// INCOME TAB: WITHDRAW FORM
// ========================================
const openWithdrawBtn = document.getElementById("openWithdrawBtn");
const withdrawForm = document.getElementById("withdrawForm");
const withdrawMessage = document.getElementById("withdrawMessage");

openWithdrawBtn?.addEventListener("click", () => {
  if (withdrawLocked) {
    withdrawMessage.textContent = withdrawLockMessage;
    withdrawMessage.className = "form-message error";
    withdrawForm.style.display = "flex";
    return;
  }
  if (!hasBankDetails) {
    withdrawMessage.innerHTML = `Set up your payout details first on the <a href="withdraw.html" style="color:#00d4ff;">Withdraw page</a> before requesting a task-wallet withdrawal.`;
    withdrawMessage.className = "form-message error";
    withdrawForm.style.display = "flex";
    return;
  }
  withdrawForm.style.display = withdrawForm.style.display === "none" ? "flex" : "none";
});

withdrawForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  withdrawMessage.textContent = "";
  withdrawMessage.className = "form-message";

  if (withdrawLocked) {
    withdrawMessage.textContent = withdrawLockMessage;
    withdrawMessage.className = "form-message error";
    return;
  }

  if (!hasBankDetails) {
    withdrawMessage.innerHTML = `Set up your payout details first on the <a href="withdraw.html" style="color:#00d4ff;">Withdraw page</a> before requesting a task-wallet withdrawal.`;
    withdrawMessage.className = "form-message error";
    return;
  }

  const amount = Number(document.getElementById("withdrawAmount").value);
  const submitBtn = document.getElementById("withdrawSubmitBtn");

  if (!amount || amount <= 0) {
    withdrawMessage.textContent = "Enter a valid amount.";
    withdrawMessage.className = "form-message error";
    return;
  }

  if (taskMinWithdrawal > 0 && amount < taskMinWithdrawal) {
    withdrawMessage.textContent = `Minimum withdrawal is ₦${formatAmount(taskMinWithdrawal)}.`;
    withdrawMessage.className = "form-message error";
    return;
  }

  if (amount > currentTaskWallet) {
    withdrawMessage.textContent = "Amount exceeds your task wallet balance.";
    withdrawMessage.className = "form-message error";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  const userRef = doc(db, "users", currentUid);

  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const wallet = userSnap.data()?.[TASK_WALLET_FIELD] || 0;
      if (wallet < amount) {
        throw new Error("Amount exceeds your task wallet balance.");
      }
      tx.update(userRef, { [TASK_WALLET_FIELD]: increment(-amount) });

      const withdrawRef = doc(collection(db, TASK_WITHDRAWALS_COLLECTION));
      tx.set(withdrawRef, {
        uid: currentUid,
        amount,
        status: "pending",
        createdAt: serverTimestamp()
      });
    });

    withdrawMessage.textContent = "Withdrawal request submitted. Awaiting admin approval.";
    withdrawMessage.className = "form-message success";
    withdrawForm.reset();
  } catch (err) {
    withdrawMessage.textContent = err.message || "Couldn't submit this request. Try again.";
    withdrawMessage.className = "form-message error";
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit Withdrawal Request`;
  }
});

function listenToWithdrawalHistory() {
  const listEl = document.getElementById("withdrawalHistoryList");
  if (!listEl) return;

  const q = query(
    collection(db, TASK_WITHDRAWALS_COLLECTION),
    where("uid", "==", currentUid)
  );

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No withdrawal requests yet.</div>`;
      return;
    }
    const docs = snap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

    listEl.innerHTML = "";
    docs.forEach((w) => {
      const item = document.createElement("div");
      item.className = "task-item";
      item.innerHTML = `
        <div class="task-item-top">
          <div class="task-item-title">${formatAmount(w.amount)}</div>
          <span class="status-badge ${w.status}">${w.status}</span>
        </div>
      `;
      listEl.appendChild(item);
    });
  }, (err) => {
    console.error("Withdrawal history listener error:", err);
    listEl.innerHTML = `<div class="empty-state">Couldn't load withdrawal history. Check the browser console for details.</div>`;
  });
}

// ========================================
// INCOME TAB: COMPLETED TASK HISTORY
// ========================================
function listenToTaskHistory() {
  const listEl = document.getElementById("taskHistoryList");
  if (!listEl) return;

  const q = query(
    collection(db, "users", currentUid, "taskHistory"),
    orderBy("completedAt", "desc")
  );

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">You haven't completed any tasks yet.</div>`;
      return;
    }
    listEl.innerHTML = "";
    snap.forEach((docSnap) => {
      const h = docSnap.data();
      const item = document.createElement("div");
      item.className = "task-item";
      item.innerHTML = `
        <div class="task-item-top">
          <div class="task-item-title">${escapeHtml(h.title || "Task")}</div>
          <span class="reward-badge"><i class="fas fa-coins"></i> +${formatAmount(h.reward)}</span>
        </div>
      `;
      listEl.appendChild(item);
    });
  });
}

// ========================================
// UTIL
// ========================================
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ========================================
// UI Interactivity - Tabs / Sub-tabs
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-content`).classList.add('active');
    });
  });

  const subButtons = document.querySelectorAll('.subtab-btn');
  const subContents = document.querySelectorAll('.subtab-content');

  subButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      subButtons.forEach(b => b.classList.remove('active'));
      subContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`${btn.dataset.subtab}-subcontent`).classList.add('active');
    });
  });
});