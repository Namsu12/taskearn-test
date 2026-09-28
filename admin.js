// ========================================
// ADMIN PANEL - TASK EARN JAVASCRIPT
// ========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, updateDoc, increment, writeBatch,
    collection, collectionGroup, query, where, orderBy,
    getDocs, serverTimestamp, limit, onSnapshot, addDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { uiAlert, uiConfirm, uiPrompt } from "./ui.js";


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

let currentUser = null;
let currentType = 'deposits';

// ---------- REAL-TIME LISTENER STATE ----------
let pendingUnsubscribe = null;   // holds the current live listener
let knownPendingIds = new Set(); // tracks ids we've already seen, for sound/toast alerts
let firstPendingLoad = true;     // skip alert on the very first snapshot

// ---------- TOAST ----------
const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');
function showToast(message, type = 'success') {
    toast.className = 'toast-message show';
    if (type === 'error') toast.classList.add('error');
    toastText.textContent = message;
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ---------- ADMIN GUARD ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!userSnap.exists() || !userSnap.data().isAdmin) {
            await uiAlert({ title: 'Access Denied', message: 'Admins only.', type: 'danger' });
            window.location.href = 'dashboard.html';
            return;
        }
        currentUser = user;
        startPendingListener();   // ← live listener instead of one-time load
        loadReviewed();
        loadAdminStats();
    } catch (error) {
        console.error('Admin check failed:', error);
        window.location.href = 'dashboard.html';
    }
});

// ---------- SECTION SWITCHER ----------
document.querySelectorAll('.admin-section').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.admin-section').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const section = this.dataset.section;
        document.getElementById('requestsSection').style.display   = section === 'requests'    ? 'block' : 'none';
        document.getElementById('investmentsSection').style.display = section === 'investments' ? 'block' : 'none';
        document.getElementById('usersSection').style.display       = section === 'users'       ? 'block' : 'none';
        document.getElementById('partnerSection').style.display     = section === 'partner'     ? 'block' : 'none';
        document.getElementById('couponsSection').style.display     = section === 'coupons'     ? 'block' : 'none';
        document.getElementById('chatsSection').style.display       = section === 'chats'       ? 'block' : 'none';
        document.getElementById('bannerSection').style.display      = section === 'banner'      ? 'block' : 'none';
        document.getElementById('ratesSection').style.display       = section === 'rates'       ? 'block' : 'none';
        if (section === 'investments') { loadRunningInvestments(); loadCompletedInvestments(); }
        else if (section === 'users') loadUsers();
        else if (section === 'partner') loadPartnerTiers();
        else if (section === 'coupons') loadCoupons();
        else if (section === 'banner') loadBannerSettings();
        else if (section === 'rates') loadRatesSettings();
        else if (section === 'chats') {
            document.getElementById('chatListView').style.display = 'block';
            document.getElementById('chatConversationView').style.display = 'none';
            loadChatThreads();
        }
    });
});

// ---------- STATS ----------
async function loadAdminStats() {
    const [depResult, withResult, invResult, usersResult] = await Promise.allSettled([
        getDocs(query(collection(db, 'deposits'), where('status', '==', 'pending'))),
        getDocs(query(collection(db, 'withdrawals'), where('status', '==', 'pending'))),
        getDocs(query(collectionGroup(db, 'investments'), where('status', '==', 'running'))),
        getDocs(collection(db, 'users'))
    ]);

    if (depResult.status === 'fulfilled' && withResult.status === 'fulfilled') {
        document.getElementById('statPendingRequests').textContent = depResult.value.size + withResult.value.size;
    } else {
        document.getElementById('statPendingRequests').textContent = '—';
        if (depResult.status === 'rejected') console.error('Pending deposits stat error:', depResult.reason);
        if (withResult.status === 'rejected') console.error('Pending withdrawals stat error:', withResult.reason);
    }

    if (invResult.status === 'fulfilled') {
        document.getElementById('statActiveInvestments').textContent = invResult.value.size;
    } else {
        document.getElementById('statActiveInvestments').textContent = '—';
        console.error('Active investments stat error:', invResult.reason);
    }

    if (usersResult.status === 'fulfilled') {
        document.getElementById('statTotalUsers').textContent = usersResult.value.size;
    } else {
        document.getElementById('statTotalUsers').textContent = '—';
        console.error('Total users stat error:', usersResult.reason);
    }
}

// ---------- TYPE TABS ----------
document.querySelectorAll('.admin-tab[data-type]').forEach(tab => {
    tab.addEventListener('click', function () {
        document.querySelectorAll('.admin-tab[data-type]').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentType = this.dataset.type;
        document.querySelectorAll('.admin-tab[data-tab]').forEach(t => t.classList.remove('active'));
        document.querySelector('.admin-tab[data-tab="pending"]').classList.add('active');
        document.getElementById('pendingList').style.display  = 'flex';
        document.getElementById('reviewedList').style.display = 'none';
        startPendingListener();  // restart listener for new type
        loadReviewed();
    });
});

// ---------- INVESTMENT TABS ----------
document.querySelectorAll('.admin-tab[data-inv-tab]').forEach(tab => {
    tab.addEventListener('click', function () {
        document.querySelectorAll('.admin-tab[data-inv-tab]').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const target = this.dataset.invTab;
        document.getElementById('runningInvestmentsList').style.display   = target === 'running'   ? 'flex' : 'none';
        document.getElementById('completedInvestmentsList').style.display = target === 'completed' ? 'flex' : 'none';
    });
});

// ---------- USER INFO CACHE ----------
const userInfoCache = new Map();
async function getUserInfo(uid) {
    if (userInfoCache.has(uid)) return userInfoCache.get(uid);
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        const info = snap.exists()
            ? { name: `${snap.data().firstName || ''} ${snap.data().lastName || ''}`.trim() || 'Unknown', email: snap.data().email || '' }
            : { name: 'Unknown', email: '' };
        userInfoCache.set(uid, info);
        return info;
    } catch { return { name: 'Unknown', email: '' }; }
}

// ---------- LOAD RUNNING INVESTMENTS ----------
async function loadRunningInvestments() {
    const listEl = document.getElementById('runningInvestmentsList');
    listEl.innerHTML = `<div class="admin-loading"><span class="spinner"></span> Loading...</div>`;
    try {
        const q = query(collectionGroup(db, 'investments'), where('status', '==', 'running'), orderBy('startDate', 'asc'));
        const snap = await getDocs(q);

        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const stillRunning = [];
        await Promise.all(snap.docs.map(async (d) => {
            const inv = d.data();
            const endTime = inv.startDate ? inv.startDate.toDate().getTime() + (inv.totalDays || 14) * DAY_MS : null;
            if (endTime && now >= endTime) {
                try {
                    await updateDoc(d.ref, {
                        status: 'completed',
                        completedAt: serverTimestamp(),
                        expiredUnclaimed: (inv.totalDays || 14) - (inv.daysCompleted || 0) > 0
                    });
                } catch (err) {
                    console.error('Could not auto-close expired investment:', err);
                    stillRunning.push(d);
                }
            } else {
                stillRunning.push(d);
            }
        }));

        document.getElementById('runningCount').textContent = stillRunning.length;
        if (stillRunning.length === 0) { listEl.innerHTML = `<div class="admin-empty"><i class="fas fa-check-circle"></i><p>No running investments.</p></div>`; return; }
        const cards = await Promise.all(stillRunning.map(async d => {
            const inv = d.data();
            const uid = d.ref.parent.parent.id;
            const userInfo = await getUserInfo(uid);
            return renderInvestmentCard(d.id, uid, inv, userInfo);
        }));
        listEl.innerHTML = cards.join('');
        attachInvestmentListeners();
    } catch (err) {
        console.error('Investments error:', err);
        listEl.innerHTML = `<div class="admin-empty"><p>Could not load investments. You may need a Firestore index — check browser console for the link.</p></div>`;
    }
}

// ---------- LOAD COMPLETED INVESTMENTS ----------
async function loadCompletedInvestments() {
    const listEl = document.getElementById('completedInvestmentsList');
    try {
        const q = query(collectionGroup(db, 'investments'), where('status', '==', 'completed'), orderBy('completedAt', 'desc'), limit(30));
        const snap = await getDocs(q);
        if (snap.empty) { listEl.innerHTML = `<div class="admin-empty"><p>No completed investments yet.</p></div>`; return; }
        const cards = await Promise.all(snap.docs.map(async d => {
            const inv = d.data();
            const uid = d.ref.parent.parent.id;
            const userInfo = await getUserInfo(uid);
            const date = inv.completedAt ? inv.completedAt.toDate().toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }) : '';
            return `
                <div class="deposit-card">
                    <div class="deposit-card-header">
                        <div class="deposit-user">
                            <span class="deposit-user-name">${escapeHtml(userInfo.name)}</span>
                            <span class="deposit-user-email">${escapeHtml(userInfo.email)}</span>
                        </div>
                        <span class="deposit-amount-badge">+₦${(inv.profit || 0).toLocaleString()}</span>
                    </div>
                    <div class="deposit-meta-row">
                        <span class="deposit-meta-item">${escapeHtml(inv.planName || 'Plan')}</span>
                        <span class="deposit-meta-item">Invested ₦${(inv.amountInvested || 0).toLocaleString()}</span>
                        <span class="deposit-meta-item">${date}</span>
                    </div>
                </div>`;
        }));
        listEl.innerHTML = cards.join('');
    } catch (err) {
        console.error('Completed investments error:', err);
        listEl.innerHTML = `<div class="admin-empty"><p>Could not load completed investments. You may need a Firestore index — check browser console for the link.</p></div>`;
    }
}

function renderInvestmentCard(id, uid, inv, userInfo) {
    const startMs = inv.startDate ? inv.startDate.toMillis() : Date.now();
    const durationDays = inv.durationDays || 30;
    const elapsedDays = Math.floor((Date.now() - startMs) / 86400000);
    const progress = Math.min(100, Math.round((elapsedDays / durationDays) * 100));
    const isMature = elapsedDays >= durationDays;
    return `
        <div class="deposit-card" data-inv-id="${id}" data-uid="${uid}" data-amount="${inv.amountInvested || 0}" data-return-min="${inv.returnMinPct ?? 0}" data-return-max="${inv.returnMaxPct ?? 0}">
            <div class="deposit-card-header">
                <div class="deposit-user">
                    <span class="deposit-user-name">${escapeHtml(userInfo.name)}</span>
                    <span class="deposit-user-email">${escapeHtml(userInfo.email)}</span>
                </div>
                <span class="deposit-amount-badge">₦${(inv.amountInvested || 0).toLocaleString()}</span>
            </div>
            <div class="deposit-meta-row">
                <span class="deposit-meta-item">${escapeHtml(inv.planName || 'Plan')}</span>
                <span class="deposit-meta-item">Daily: ₦${(inv.dailyEarning || 0).toLocaleString()}</span>
            </div>
            <div class="invest-progress-row">
                <span>${elapsedDays}/${durationDays} days</span>
                <span>${progress}%${isMature ? ' · Ready to resolve' : ''}</span>
            </div>
            <div class="invest-progress-bar"><div class="invest-progress-fill" style="width:${progress}%;"></div></div>
            <div class="deposit-actions">
                <button class="btn-approve" data-action="resolve">
                    <i class="fas fa-flag-checkered"></i> ${isMature ? 'Resolve Now' : 'Resolve Early'}
                </button>
            </div>
        </div>`;
}

function attachInvestmentListeners() {
    document.querySelectorAll('#runningInvestmentsList [data-action="resolve"]').forEach(btn => {
        btn.addEventListener('click', function () { handleResolveInvestment(this.closest('.deposit-card')); });
    });
}

async function handleResolveInvestment(card) {
    const invId = card.dataset.invId;
    const uid = card.dataset.uid;
    const amount = parseFloat(card.dataset.amount) || 0;
    if (!(await uiConfirm({
        title: 'Resolve this investment?',
        message: `Principal: <span class="te-amount">₦${amount.toLocaleString()}</span><br><br>This will mark it completed. Users earn daily via claim button.`,
        confirmText: 'Resolve'
    }))) return;
    const btn = card.querySelector('[data-action="resolve"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Resolving...';
    try {
        await updateDoc(doc(db, 'users', uid, 'investments', invId), { status: 'completed', completedAt: serverTimestamp(), profit: 0 });
        showToast(`✅ Investment resolved and marked complete`);
        card.remove();
        loadAdminStats();
    } catch (err) {
        console.error('Resolve error:', err);
        showToast('❌ Could not resolve. Try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-flag-checkered"></i> Resolve Now';
    }
}

// ---------- USERS ----------
let allUsersCache = [];
async function loadUsers() {
    const listEl = document.getElementById('usersList');
    listEl.innerHTML = `<div class="admin-loading"><span class="spinner"></span> Loading users...</div>`;
    try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
        allUsersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUsersList(allUsersCache);
    } catch (err) { listEl.innerHTML = `<div class="admin-empty"><p>Could not load users.</p></div>`; }
}

function renderUsersList(users) {
    const listEl = document.getElementById('usersList');
    if (!users.length) { listEl.innerHTML = `<div class="admin-empty"><p>No users found.</p></div>`; return; }
    listEl.innerHTML = users.map(u => renderUserCard(u)).join('');
    attachUserCardListeners();
}

function renderUserCard(u) {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unnamed';
    const joined = u.createdAt ? u.createdAt.toDate().toLocaleDateString('en-GB') : '—';
    const suspended = u.suspended === true;
    return `
        <div class="user-card" data-uid="${u.id}" data-name="${escapeHtml(name)}" data-email="${escapeHtml(u.email || '')}">
            <div class="user-card-summary">
                <div class="user-card-header">
                    <span class="user-row-name">${escapeHtml(name)} ${u.isAdmin ? '<span class="user-admin-tag">ADMIN</span>' : ''}</span>
                    <span class="user-status-badge ${suspended ? 'suspended' : 'active'}">${suspended ? 'Suspended' : 'Active'}</span>
                </div>
                <div class="user-row-email">${escapeHtml(u.email || '')} · ${escapeHtml(u.phone || 'no phone')}</div>
                <div class="user-row-email">Joined ${joined} <span class="user-card-hint">— tap for options</span></div>
            </div>

            <div class="user-card-details">
                <div class="user-stats-row">
                    <span class="user-stat-chip">Balance: ₦${(u.balance || 0).toLocaleString()}</span>
                    <span class="user-stat-chip">Ref earnings: ₦${(u.referralEarnings || 0).toLocaleString()}</span>
                    <span class="user-stat-chip">Partner income: ₦${(u.totalPartnerEarned || 0).toLocaleString()}</span>
                </div>

                <div class="user-actions-grid">
                    <button class="btn-user-action" data-action="suspend">${suspended ? 'Unsuspend' : 'Suspend'}</button>
                    <button class="btn-user-action" data-action="reset-password">Reset Password</button>
                    <button class="btn-user-action" data-action="logout">Log Out User</button>
                    <button class="btn-user-action" data-action="history">Order History</button>
                    <button class="btn-user-action" data-action="notify">Notify</button>
                    <button class="btn-user-action" data-action="chat">Chat</button>
                </div>
            </div>
        </div>`;
}

function attachUserCardListeners() {
    document.querySelectorAll('.user-card').forEach(card => {
        card.querySelector('.user-card-summary')?.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });

        const uid = card.dataset.uid;
        const name = card.dataset.name;
        const email = card.dataset.email;
        const user = allUsersCache.find(u => u.id === uid);

        card.querySelector('[data-action="suspend"]')?.addEventListener('click', () => toggleSuspend(uid, user, card));
        card.querySelector('[data-action="reset-password"]')?.addEventListener('click', () => resetUserPassword(email));
        card.querySelector('[data-action="logout"]')?.addEventListener('click', () => forceLogoutUser(uid, name));
        card.querySelector('[data-action="history"]')?.addEventListener('click', () => openUserHistoryModal(uid, name));
        card.querySelector('[data-action="notify"]')?.addEventListener('click', () => sendUserNotification(uid, name));
        card.querySelector('[data-action="chat"]')?.addEventListener('click', () => chatWithUserFromCard(uid, name, email));
    });
}

// ---------- SUSPEND / UNSUSPEND ----------
async function toggleSuspend(uid, user, card) {
    const willSuspend = !(user?.suspended === true);
    if (!(await uiConfirm({
        title: willSuspend ? 'Suspend this user?' : 'Remove suspension for this user?',
        type: willSuspend ? 'danger' : 'warn',
        confirmStyle: willSuspend ? 'danger' : 'primary'
    }))) return;
    try {
        await updateDoc(doc(db, 'users', uid), { suspended: willSuspend });
        if (user) user.suspended = willSuspend;
        const badge = card.querySelector('.user-status-badge');
        const btn = card.querySelector('[data-action="suspend"]');
        badge.className = `user-status-badge ${willSuspend ? 'suspended' : 'active'}`;
        badge.textContent = willSuspend ? 'Suspended' : 'Active';
        btn.textContent = willSuspend ? 'Unsuspend' : 'Suspend';
        showToast(willSuspend ? '🚫 User suspended' : '✅ Suspension removed');
    } catch (err) {
        console.error('Suspend toggle error:', err);
        showToast(`❌ ${err.message || 'Could not update suspension.'}`, 'error');
    }
}

// ---------- RESET PASSWORD ----------
async function resetUserPassword(email) {
    if (!email) { showToast('❌ No email on file for this user.', 'error'); return; }
    if (!(await uiConfirm({ title: `Send a password reset email to ${escapeHtml(email)}?` }))) return;
    try {
        await sendPasswordResetEmail(auth, email);
        showToast(`✅ Reset email sent to ${email}`);
    } catch (err) {
        console.error('Reset password error:', err);
        showToast(`❌ ${err.message || 'Could not send reset email.'}`, 'error');
    }
}

// ---------- FORCE LOG OUT ----------
async function forceLogoutUser(uid, name) {
    if (!(await uiConfirm({ title: `Force log out ${escapeHtml(name)}?`, type: 'danger', confirmStyle: 'danger' }))) return;
    try {
        await updateDoc(doc(db, 'users', uid), { forceLogoutAt: serverTimestamp() });
        showToast(`✅ Logout flag set for ${name}`);
    } catch (err) {
        console.error('Force logout error:', err);
        showToast(`❌ ${err.message || 'Could not set logout flag.'}`, 'error');
    }
}

// ---------- NOTIFY ----------
async function sendUserNotification(uid, name) {
    const message = await uiPrompt({ title: `Notification message for ${escapeHtml(name)}:`, confirmText: 'Send' });
    if (!message || !message.trim()) return;
    try {
        await addDoc(collection(db, 'users', uid, 'notifications'), {
            message: message.trim(),
            read: false,
            sentByAdmin: true,
            createdAt: serverTimestamp()
        });
        showToast(`✅ Notification sent to ${name}`);
    } catch (err) {
        console.error('Notify error:', err);
        showToast('❌ Could not send notification.', 'error');
    }
}

// ---------- CHAT (jump straight to this user's conversation) ----------
function chatWithUserFromCard(uid, name, email) {
    document.querySelector('.admin-section[data-section="chats"]')?.click();
    openChatConversation(uid, name, email);
}

// ---------- ORDER HISTORY / USER DETAILS MODAL ----------
async function openUserHistoryModal(uid, name) {
    const overlay = document.getElementById('userHistoryModal');
    const titleEl = document.getElementById('userHistoryTitle');
    const bodyEl = document.getElementById('userHistoryBody');
    if (!overlay) return;

    titleEl.textContent = name;
    bodyEl.innerHTML = `<div class="admin-loading"><span class="spinner"></span> Loading...</div>`;
    overlay.style.display = 'flex';

    try {
        const [depositsSnap, withdrawalsSnap, investmentsSnap, userSnap] = await Promise.all([
            getDocs(query(collection(db, 'deposits'), where('uid', '==', uid), where('status', '==', 'approved'))),
            getDocs(query(collection(db, 'withdrawals'), where('uid', '==', uid), where('status', '==', 'approved'))),
            getDocs(collection(db, 'users', uid, 'investments')),
            getDoc(doc(db, 'users', uid))
        ]);

        const totalDeposited = depositsSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        const totalWithdrawn = withdrawalsSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        const refEarnings = userSnap.exists() ? (userSnap.data().referralEarnings || 0) : 0;
        const partnerEarnings = userSnap.exists() ? (userSnap.data().totalPartnerEarned || 0) : 0;
        const plans = investmentsSnap.docs.map(d => d.data());
        const runningPlans = plans.filter(p => p.status === 'running');

        const events = [
            ...depositsSnap.docs.map(d => ({ type: 'Deposit', amount: d.data().amount || 0, date: d.data().createdAt })),
            ...withdrawalsSnap.docs.map(d => ({ type: 'Withdrawal', amount: d.data().amount || 0, date: d.data().createdAt }))
        ].sort((a, b) => (b.date?.toMillis() || 0) - (a.date?.toMillis() || 0)).slice(0, 20);

        bodyEl.innerHTML = `
            <div class="user-stats-row" style="margin-bottom:14px;">
                <span class="user-stat-chip">Total deposited: ₦${totalDeposited.toLocaleString()}</span>
                <span class="user-stat-chip">Total ref income: ₦${refEarnings.toLocaleString()}</span>
                <span class="user-stat-chip">Total partner income: ₦${partnerEarnings.toLocaleString()}</span>
                <span class="user-stat-chip">Total withdrawn: ₦${totalWithdrawn.toLocaleString()}</span>
                <span class="user-stat-chip">Plans: ${plans.length} (${runningPlans.length} running)</span>
            </div>
            ${runningPlans.length ? `
                <h4 class="modal-subhead">Active Plans</h4>
                <div class="modal-mini-list">
                    ${runningPlans.map(p => `<div class="modal-mini-row">${escapeHtml(p.planName || 'Plan')} — ₦${(p.amountInvested || 0).toLocaleString()}</div>`).join('')}
                </div>` : ''}
            <h4 class="modal-subhead">Recent Transactions</h4>
            <div class="modal-mini-list">
                ${events.length ? events.map(e => {
                    const d = e.date ? e.date.toDate().toLocaleDateString('en-GB') : '';
                    return `<div class="modal-mini-row"><span>${e.type}</span><span>₦${e.amount.toLocaleString()} · ${d}</span></div>`;
                }).join('') : '<div class="modal-mini-row">No transactions yet.</div>'}
            </div>
        `;
    } catch (err) {
        console.error('User history error:', err);
        bodyEl.innerHTML = `<div class="admin-empty"><p>Could not load history. Check console — you may need a Firestore index.</p></div>`;
    }
}

document.getElementById('closeUserHistoryModal')?.addEventListener('click', () => {
    document.getElementById('userHistoryModal').style.display = 'none';
});
document.getElementById('userHistoryModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'userHistoryModal') e.currentTarget.style.display = 'none';
});

document.getElementById('userSearchInput')?.addEventListener('input', function () {
    const term = this.value.trim().toLowerCase();
    if (!term) { renderUsersList(allUsersCache); return; }
    renderUsersList(allUsersCache.filter(u => {
        const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
        return name.includes(term) || (u.email || '').toLowerCase().includes(term);
    }));
});

// ---------- BROADCAST TO ALL USERS ----------
document.getElementById('broadcastSendBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('broadcastMessageInput');
    const msg = document.getElementById('broadcastMessage');
    const btn = document.getElementById('broadcastSendBtn');
    const text = input.value.trim();

    if (!text) { msg.textContent = 'Write a message first.'; msg.className = 'form-message error'; return; }
    if (!allUsersCache.length) { msg.textContent = 'No users loaded yet.'; msg.className = 'form-message error'; return; }
    if (!(await uiConfirm({ title: `Send this notification to all ${allUsersCache.length} users?` }))) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Sending...';
    try {
        const chunkSize = 400;
        for (let i = 0; i < allUsersCache.length; i += chunkSize) {
            const chunk = allUsersCache.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach(u => {
                const ref = doc(collection(db, 'users', u.id, 'notifications'));
                batch.set(ref, { message: text, read: false, sentByAdmin: true, broadcast: true, createdAt: serverTimestamp() });
            });
            await batch.commit();
        }
        msg.textContent = `Sent to ${allUsersCache.length} users.`;
        msg.className = 'form-message success';
        input.value = '';
    } catch (err) {
        console.error('Broadcast error:', err);
        msg.textContent = err.message || 'Could not send to all users.';
        msg.className = 'form-message error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bullhorn"></i> Send to All Users';
    }
});

// ---------- STATUS TABS ----------
document.querySelectorAll('.admin-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', function () {
        document.querySelectorAll('.admin-tab[data-tab]').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const target = this.dataset.tab;
        document.getElementById('pendingList').style.display  = target === 'pending'  ? 'flex' : 'none';
        document.getElementById('reviewedList').style.display = target === 'reviewed' ? 'flex' : 'none';
    });
});

// ========================================
// ★ REAL-TIME PENDING LISTENER ★
// ========================================
// Replaces the old one-time loadPending(). Opens a live onSnapshot on
// whichever collection is active (deposits/withdrawals) filtered to
// status === 'pending'. Cards appear/disappear automatically — no refresh,
// no re-clicking the tab. Fires a toast when a brand-new request arrives
// (skipped on the very first snapshot so you don't get spammed on page load).
function startPendingListener() {
    // Kill any previous listener first (e.g. when switching deposits ↔ withdrawals)
    if (pendingUnsubscribe) {
        pendingUnsubscribe();
        pendingUnsubscribe = null;
    }
    knownPendingIds = new Set();
    firstPendingLoad = true;

    const listEl = document.getElementById('pendingList');
    const countEl = document.getElementById('pendingCount');
    listEl.innerHTML = `<div class="admin-loading"><span class="spinner"></span> Loading requests...</div>`;

    const q = query(
        collection(db, currentType),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'asc')
    );

    pendingUnsubscribe = onSnapshot(q, (snap) => {
        countEl.textContent = snap.size;

        // Detect brand-new arrivals (skip the initial snapshot)
        if (!firstPendingLoad) {
            snap.docs.forEach(d => {
                if (!knownPendingIds.has(d.id)) {
                    const data = d.data();
                    const label = currentType === 'deposits' ? 'deposit' : 'withdrawal';
                    showToast(`🔔 New ${label}: ₦${(data.amount || 0).toLocaleString()} from ${data.userName || data.email || 'user'}`);
                }
            });
        }
        knownPendingIds = new Set(snap.docs.map(d => d.id));
        firstPendingLoad = false;

        if (snap.empty) {
            listEl.innerHTML = `<div class="admin-empty"><i class="fas fa-check-circle"></i><p>No pending ${currentType}. All caught up!</p></div>`;
            return;
        }

        listEl.innerHTML = snap.docs.map(d => renderPendingCard(d.id, d.data())).join('');
        attachCardListeners();
    }, (err) => {
        console.error('Pending listener error:', err);
        listEl.innerHTML = `<div class="admin-empty"><p>Could not load ${currentType}. Check console — you may need a Firestore index.</p></div>`;
    });
}

// ---------- RENDER PENDING CARD ----------
function renderPendingCard(id, item) {
    const date = item.createdAt ? item.createdAt.toDate().toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    // Crypto deposit — show coin, network, and TXID
    const depositMeta = `
    <div class="deposit-meta-row">
        ${item.currency ? `<span class="deposit-meta-item">${escapeHtml(item.currency.toUpperCase())}${item.network && item.currency === 'usdt' ? ' · ' + escapeHtml(item.network.toUpperCase()) : ''}</span>` : ''}
        <span class="deposit-meta-item">${date}</span>
    </div>
    ${(item.amountUsd || item.amountCrypto) ? `
        <div class="deposit-meta-row" style="margin-top:-6px;">
            ${item.amountUsd ? `<span class="deposit-meta-item">≈ $${Number(item.amountUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>` : ''}
            ${item.amountCrypto ? `<span class="deposit-meta-item">${Number(item.amountCrypto).toLocaleString('en-US', { maximumFractionDigits: 8 })} ${escapeHtml((item.currency || '').toUpperCase())}</span>` : ''}
        </div>` : ''}
    ${item.reference ? `
        <div class="deposit-txid-row">
            <span>TXID: ${escapeHtml(item.reference)}</span>
            <button class="copy-txid-btn" data-copy="${escapeHtml(item.reference)}" title="Copy TXID"><i class="fas fa-copy"></i></button>
        </div>` : ''}
`;

    // Withdrawal — show payout details
    const withdrawalMeta = `
        <div class="deposit-meta-row">
            <span class="deposit-meta-item">${date}</span>
        </div>
        ${renderPayoutDetails(item)}
    `;

    const metaHtml = currentType === 'deposits' ? depositMeta : withdrawalMeta;

    return `
        <div class="deposit-card" data-id="${id}" data-uid="${item.uid || ''}" data-name="${escapeHtml(item.userName || item.userEmail || item.email || 'Unknown')}">
            <div class="deposit-card-header">
                <div class="deposit-user">
                    <span class="deposit-user-name">${escapeHtml(item.userName || item.userEmail || item.email || 'Unknown')}</span>
                    <span class="deposit-user-email">${escapeHtml(item.email || '')}</span>
                </div>
                <span class="deposit-amount-badge">₦${(item.amount || 0).toLocaleString()}</span>
            </div>
            ${metaHtml}
            <div class="deposit-actions">
                <button class="btn-approve" data-action="approve"><i class="fas fa-check"></i> Approve</button>
                <button class="btn-reject" data-action="reject"><i class="fas fa-times"></i> Reject</button>
            </div>
        </div>`;
}

// Builds the payout-detail rows for a withdrawal request.
function renderPayoutDetails(item) {
    const method = item.method || 'bank';
    const dest = item.destination || {};
    let rows = [];

    if (method === 'crypto') {
        rows = [
            ['Currency', dest.currency || ''],
            ['Wallet address', dest.walletAddress || '']
        ];
    } else if (method === 'mobile') {
        rows = [
            ['Provider', dest.provider || ''],
            ['Phone number', dest.phone || '']
        ];
    } else {
        rows = [
            ['Account name', dest.accountHolder || ''],
            ['Bank', dest.bankName || ''],
            ['Account number', dest.accountNumber || '']
        ];
    }

    return `
        <div class="payout-details">
            ${rows.map(([label, value]) => `
                <div class="payout-row">
                    <span class="payout-label">${label}</span>
                    <span class="payout-value">
                        <span>${escapeHtml(value)}</span>
                        <button type="button" class="copy-btn" data-copy="${escapeHtml(value)}" title="Copy"><i class="fas fa-copy"></i></button>
                    </span>
                </div>
            `).join('')}
        </div>
    `;
}

// ---------- LOAD REVIEWED (approved/rejected requests) ----------
async function loadReviewed() {
    const listEl = document.getElementById('reviewedList');
    listEl.innerHTML = `<div class="admin-loading"><span class="spinner"></span> Loading...</div>`;
    try {
        const q = query(
            collection(db, currentType),
            where('status', 'in', ['approved', 'rejected']),
            orderBy('reviewedAt', 'desc'),
            limit(30)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
            listEl.innerHTML = `<div class="admin-empty"><p>No reviewed ${currentType} yet.</p></div>`;
            return;
        }
        listEl.innerHTML = snap.docs.map(d => renderReviewedCard({ id: d.id, ...d.data() })).join('');
        attachReviewedCardListeners();
    } catch (err) {
        console.error('Load reviewed error:', err);
        listEl.innerHTML = `<div class="admin-empty"><p>Could not load reviewed ${currentType}. You may need a Firestore index — check browser console for the link.</p></div>`;
    }
}

// ---------- RENDER REVIEWED CARD ----------
function renderReviewedCard(item) {
    const isApproved = item.status === 'approved';
    const color = isApproved ? '#51cf66' : '#ff6b6b';
    const date = item.reviewedAt ? item.reviewedAt.toDate().toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `
        <div class="deposit-card" data-uid="${item.uid || ''}" data-name="${escapeHtml(item.userName || item.userEmail || item.email || 'Unknown')}">
            <div class="deposit-card-header">
                <div class="deposit-user">
                    <span class="deposit-user-name">${escapeHtml(item.userName || item.userEmail || item.email || 'Unknown')}</span>
                    <span class="deposit-user-email">${escapeHtml(item.email || '')}</span>
                </div>
                <span class="deposit-amount-badge">₦${(item.amount || 0).toLocaleString()}</span>
            </div>
            <div class="deposit-meta-row">
                <span class="deposit-meta-item">${currentType === 'deposits' ? `${escapeHtml((item.currency || '').toUpperCase())}${item.network && item.currency === 'usdt' ? ' · ' + escapeHtml(item.network.toUpperCase()) : ''}` : ''}</span>
                <span class="deposit-status-pill" style="color:${color}; border-color:${color};">${item.status}</span>
            </div>
            ${currentType !== 'deposits' ? renderPayoutDetails(item) : ''}
            ${item.rejectionReason ? `<div class="deposit-reviewed-note">Reason: ${escapeHtml(item.rejectionReason)}</div>` : ''}
            <div class="deposit-reviewed-note">Reviewed ${date}</div>
        </div>`;
}

// ---------- CARD LISTENERS ----------
function attachCardListeners() {
    document.querySelectorAll('#pendingList .deposit-card').forEach(card => {
        const id = card.dataset.id;
        card.querySelector('[data-action="approve"]')?.addEventListener('click', () => handleApprove(id, card));
        card.querySelector('[data-action="reject"]')?.addEventListener('click', () => handleReject(id, card));
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            if (card.dataset.uid) openUserHistoryModal(card.dataset.uid, card.dataset.name);
        });
    });
}

function attachReviewedCardListeners() {
    document.querySelectorAll('#reviewedList .deposit-card').forEach(card => {
        card.addEventListener('click', () => {
            if (card.dataset.uid) openUserHistoryModal(card.dataset.uid, card.dataset.name);
        });
    });
}

// ---------- APPROVE ----------
async function handleApprove(itemId, card) {
    const approveBtn = card.querySelector('[data-action="approve"]');
    const rejectBtn  = card.querySelector('[data-action="reject"]');
    const amountEl   = card.querySelector('.deposit-amount-badge');
    const amount     = amountEl ? parseFloat(amountEl.textContent.replace(/[^0-9.]/g, '')) || 0 : 0;
    const uidFromCard = await getItemUid(itemId);
    const typeLabel = currentType === 'deposits' ? 'deposit' : 'withdrawal';

    if (!uidFromCard) { showToast(`❌ Could not find ${typeLabel} owner.`, 'error'); return; }

    const confirmMsg = currentType === 'deposits'
        ? `Approve ₦${amount.toLocaleString()} deposit? Balance will be credited immediately.`
        : `Approve ₦${amount.toLocaleString()} withdrawal? Confirm you've sent the money.`;

    if (!(await uiConfirm({ title: confirmMsg, confirmStyle: 'success' }))) return;

    approveBtn.disabled = true;
    rejectBtn.disabled  = true;
    approveBtn.innerHTML = '<span class="spinner"></span> Approving...';

    try {
        await updateDoc(doc(db, currentType, itemId), {
            status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: currentUser.uid
        });

        if (currentType === 'deposits') {
            const preSnap = await getDoc(doc(db, 'users', uidFromCard));
            const isFirstDeposit = !(preSnap.exists() && preSnap.data().totalDeposited > 0);
            const level1Code = preSnap.exists() ? (preSnap.data().referredBy || '') : '';

            await updateDoc(doc(db, 'users', uidFromCard), { balance: increment(amount), totalDeposited: increment(amount) });

            try {
                await addDoc(collection(db, 'users', uidFromCard, 'notifications'), {
                    message: `Your deposit of ₦${amount.toLocaleString()} has been approved and credited to your wallet.`,
                    read: false, sentByAdmin: true, createdAt: serverTimestamp()
                });
            } catch (err) { console.error('Deposit notify error:', err); }

            // REFERRAL COMMISSION
            try {
                if (level1Code) {
                    const l1Snap = await getDocs(query(collection(db, 'users'), where('referralCode', '==', level1Code)));
                    if (!l1Snap.empty) {
                        const l1Doc = l1Snap.docs[0];
                        const l1Bonus = Math.floor(amount * 0.15);
                        await updateDoc(doc(db, 'users', l1Doc.id), { balance: increment(l1Bonus), totalEarned: increment(l1Bonus), referralEarnings: increment(l1Bonus) });
                        await addDoc(collection(db, 'users', l1Doc.id, 'referralHistory'), {
                            amount: l1Bonus, level: 1, createdAt: serverTimestamp()
                        });

                        if (isFirstDeposit) {
                            await updateDoc(doc(db, 'users', l1Doc.id), { validReferralCount: increment(1) });
                        }

                        const level2Code = l1Doc.data().referredBy || '';
                        if (level2Code) {
                            const l2Snap = await getDocs(query(collection(db, 'users'), where('referralCode', '==', level2Code)));
                            if (!l2Snap.empty) {
                                const l2Doc = l2Snap.docs[0];
                                const l2Bonus = Math.floor(amount * 0.01);
                                await updateDoc(doc(db, 'users', l2Doc.id), { balance: increment(l2Bonus), totalEarned: increment(l2Bonus), referralEarnings: increment(l2Bonus) });
                                await addDoc(collection(db, 'users', l2Doc.id, 'referralHistory'), {
                                    amount: l2Bonus, level: 2, createdAt: serverTimestamp()
                                });

                                const level3Code = l2Doc.data().referredBy || '';
                                if (level3Code) {
                                    const l3Snap = await getDocs(query(collection(db, 'users'), where('referralCode', '==', level3Code)));
                                    if (!l3Snap.empty) {
                                        const l3Bonus = Math.floor(amount * 0.01);
                                        await updateDoc(doc(db, 'users', l3Snap.docs[0].id), { balance: increment(l3Bonus), totalEarned: increment(l3Bonus), referralEarnings: increment(l3Bonus) });
                                        await addDoc(collection(db, 'users', l3Snap.docs[0].id, 'referralHistory'), {
                                            amount: l3Bonus, level: 3, createdAt: serverTimestamp()
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (refErr) { console.error('Referral error:', refErr); }

            showToast('✅ Deposit approved and balance credited!');

        } else {
            await updateDoc(doc(db, 'users', uidFromCard), { totalWithdrawn: increment(amount) });
            try {
                await addDoc(collection(db, 'users', uidFromCard, 'notifications'), {
                    message: `Your withdrawal of ₦${amount.toLocaleString()} has been approved and sent.`,
                    read: false, sentByAdmin: true, createdAt: serverTimestamp()
                });
            } catch (err) { console.error('Withdrawal notify error:', err); }
            showToast('✅ Withdrawal marked as sent!');
        }

        // No need to manually remove the card — the onSnapshot listener
        // picks up the status change and removes it automatically.

    } catch (err) {
        console.error('Approval failed:', err);
        showToast('❌ Approval failed. Try again.', 'error');
        approveBtn.disabled = false;
        rejectBtn.disabled  = false;
        approveBtn.innerHTML = '<i class="fas fa-check"></i> Approve';
    }
}

// ---------- REJECT ----------
async function handleReject(itemId, card) {
    const amountEl = card.querySelector('.deposit-amount-badge');
    const amount   = amountEl ? parseFloat(amountEl.textContent.replace(/[^0-9.]/g, '')) || 0 : 0;
    const typeLabel = currentType === 'deposits' ? 'deposit' : 'withdrawal';
    const defaultReason = currentType === 'deposits' ? 'Payment could not be verified.' : 'Withdrawal could not be processed.';
    const reason = await uiPrompt({
        title: `Reason for rejecting this ${typeLabel}:`,
        value: defaultReason,
        required: false,
        confirmText: 'Reject'
    });
    if (reason === null) return;

    const approveBtn = card.querySelector('[data-action="approve"]');
    const rejectBtn  = card.querySelector('[data-action="reject"]');
    rejectBtn.disabled  = true;
    approveBtn.disabled = true;
    rejectBtn.innerHTML = '<span class="spinner"></span> Rejecting...';

    try {
        const uidFromCard = await getItemUid(itemId);
        await updateDoc(doc(db, currentType, itemId), {
            status: 'rejected', rejectionReason: reason || '', reviewedAt: serverTimestamp(), reviewedBy: currentUser.uid
        });

        if (currentType === 'withdrawals' && uidFromCard) {
            await updateDoc(doc(db, 'users', uidFromCard), { balance: increment(amount) });
            try {
                await addDoc(collection(db, 'users', uidFromCard, 'notifications'), {
                    message: `Your withdrawal of ₦${amount.toLocaleString()} was rejected. Reason: ${reason || 'Not specified'}. The amount has been refunded to your balance.`,
                    read: false, sentByAdmin: true, createdAt: serverTimestamp()
                });
            } catch (err) { console.error('Withdrawal reject notify error:', err); }
            showToast('🚫 Withdrawal rejected and balance refunded');
        } else {
            if (uidFromCard) {
                try {
                    await addDoc(collection(db, 'users', uidFromCard, 'notifications'), {
                        message: `Your deposit of ₦${amount.toLocaleString()} was rejected. Reason: ${reason || 'Not specified'}.`,
                        read: false, sentByAdmin: true, createdAt: serverTimestamp()
                    });
                } catch (err) { console.error('Deposit reject notify error:', err); }
            }
            showToast('🚫 Deposit rejected');
        }

        // Card disappears on its own via the onSnapshot listener.

    } catch (err) {
        console.error('Rejection failed:', err);
        showToast('❌ Rejection failed. Try again.', 'error');
        rejectBtn.disabled  = false;
        approveBtn.disabled = false;
        rejectBtn.innerHTML = '<i class="fas fa-times"></i> Reject';
    }
}

async function getItemUid(itemId) {
    try {
        const snap = await getDoc(doc(db, currentType, itemId));
        return snap.exists() ? snap.data().uid : null;
    } catch { return null; }
}

// ---------- CHATS ----------
let unsubscribeThreads = null;
let unsubscribeConvMessages = null;
let activeChatUid = null;

function loadChatThreads() {
    const listEl = document.getElementById('chatThreadsList');
    if (unsubscribeThreads) unsubscribeThreads();

    const q = query(collection(db, 'chats'), orderBy('lastMessageTime', 'desc'));
    unsubscribeThreads = onSnapshot(q, (snap) => {
        if (snap.empty) { listEl.innerHTML = `<div class="admin-empty"><i class="fas fa-comments"></i><p>No conversations yet.</p></div>`; return; }

        const unread = snap.docs.filter(d => d.data().unreadAdmin > 0).length;
        const badge = document.getElementById('unreadChatCount');
        if (badge) { badge.style.display = unread > 0 ? 'inline-block' : 'none'; badge.textContent = unread; }

        listEl.innerHTML = snap.docs.map(d => {
            const chat = d.data();
            const uid = d.id;
            const isUnread = (chat.unreadAdmin || 0) > 0;
            const initials = (chat.userName || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
            return `
                <div class="chat-thread-row ${isUnread ? 'unread' : ''}" data-uid="${uid}" data-name="${escapeHtml(chat.userName || 'User')}" data-email="${escapeHtml(chat.userEmail || '')}">
                    <div class="chat-thread-avatar">${escapeHtml(initials)}</div>
                    <div class="chat-thread-info">
                        <span class="chat-thread-name">${escapeHtml(chat.userName || 'User')}</span>
                        <span class="chat-thread-last">${escapeHtml(chat.lastMessage || 'No messages yet')}</span>
                    </div>
                    ${isUnread ? '<span class="chat-unread-dot"></span>' : ''}
                </div>`;
        }).join('');

        listEl.querySelectorAll('.chat-thread-row').forEach(row => {
            row.addEventListener('click', () => openChatConversation(row.dataset.uid, row.dataset.name, row.dataset.email));
        });
    }, (err) => { console.error('Chat threads error:', err); });
}

async function openChatConversation(uid, name, email) {
    activeChatUid = uid;
    document.getElementById('chatListView').style.display = 'none';
    document.getElementById('chatConversationView').style.display = 'block';
    document.getElementById('chatConvName').textContent  = name;
    document.getElementById('chatConvEmail').textContent = email;

    try {
        await setDoc(doc(db, 'chats', uid), {
            unreadAdmin: 0, userName: name, userEmail: email
        }, { merge: true });
    } catch (err) { console.error(err); }

    if (unsubscribeConvMessages) unsubscribeConvMessages();
    const messagesEl = document.getElementById('chatConvMessages');
    const q = query(collection(db, 'chats', uid, 'messages'), orderBy('createdAt', 'asc'));

    unsubscribeConvMessages = onSnapshot(q, (snap) => {
        if (snap.empty) { messagesEl.innerHTML = `<p style="color:#4a5670;text-align:center;font-size:13px;">No messages yet.</p>`; return; }
        messagesEl.innerHTML = snap.docs.map(d => {
            const msg  = d.data();
            const isUser = msg.sender === 'user';
            const time = msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="chat-bubble-row ${isUser ? 'from-user' : 'from-admin'}">
                    <div class="chat-bubble">${escapeHtml(msg.text || '')}</div>
                    <span class="chat-bubble-time">${time}</span>
                </div>`;
        }).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}

document.getElementById('closeChatConvBtn')?.addEventListener('click', () => {
    if (unsubscribeConvMessages) unsubscribeConvMessages();
    activeChatUid = null;
    document.getElementById('chatConversationView').style.display = 'none';
    document.getElementById('chatListView').style.display = 'block';
});

document.getElementById('chatConvForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('chatConvInput');
    const text = input.value.trim();
    if (!text || !activeChatUid) return;
    input.value = '';
    try {
        await addDoc(collection(db, 'chats', activeChatUid, 'messages'), {
            text, sender: 'admin', createdAt: serverTimestamp()
        });
        await setDoc(doc(db, 'chats', activeChatUid), {
            lastMessage: `Support: ${text}`,
            lastMessageTime: serverTimestamp(),
            unreadAdmin: 0
        }, { merge: true });
    } catch (err) {
        console.error('Reply error:', err);
        showToast('❌ Could not send reply.', 'error');
        input.value = text;
    }
});

// ========================================
// PARTNER TIERS
// ========================================
async function loadPartnerTiers() {
    const listEl = document.getElementById('partnerTiersList');
    try {
        const snap = await getDoc(doc(db, 'settings', 'partnerTiers'));
        const tiers = snap.exists() ? (snap.data().tiers || []) : [];
        renderPartnerTiers(tiers);
    } catch (err) {
        console.error('Load partner tiers error:', err);
        listEl.innerHTML = `<div class="admin-empty"><p>Could not load tiers.</p></div>`;
    }
}

function renderPartnerTiers(tiers) {
    const listEl = document.getElementById('partnerTiersList');
    const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
    if (!sorted.length) {
        listEl.innerHTML = `<div class="admin-empty"><p>No tiers yet — add one above.</p></div>`;
        return;
    }
    listEl.innerHTML = sorted.map((t, i) => `
        <div class="tier-card">
            <div class="tier-card-info">
                <strong>${t.threshold}</strong> valid invites → <strong>₦${(t.reward || 0).toLocaleString()}</strong>
            </div>
            <button data-threshold="${t.threshold}"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');

    listEl.querySelectorAll('button[data-threshold]').forEach(btn => {
        btn.addEventListener('click', () => deletePartnerTier(Number(btn.dataset.threshold)));
    });
}

document.getElementById('addTierForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('addTierMessage');
    const btn = document.getElementById('addTierSubmit');
    const threshold = Number(document.getElementById('tierThresholdInput').value);
    const reward = Number(document.getElementById('tierRewardInput').value);

    if (!threshold || threshold <= 0 || !reward || reward <= 0) {
        msg.textContent = 'Enter valid values for both fields.';
        msg.className = 'form-message error';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Adding...';
    try {
        const ref = doc(db, 'settings', 'partnerTiers');
        const snap = await getDoc(ref);
        const tiers = snap.exists() ? (snap.data().tiers || []) : [];

        if (tiers.some(t => t.threshold === threshold)) {
            msg.textContent = 'A tier with this invite count already exists.';
            msg.className = 'form-message error';
            return;
        }

        tiers.push({ threshold, reward });
        await setDoc(ref, { tiers }, { merge: true });

        msg.textContent = 'Tier added.';
        msg.className = 'form-message success';
        document.getElementById('addTierForm').reset();
        renderPartnerTiers(tiers);
    } catch (err) {
        console.error('Add tier error:', err);
        msg.textContent = err.message || 'Could not add tier.';
        msg.className = 'form-message error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> Add Tier';
    }
});

async function deletePartnerTier(threshold) {
    if (!(await uiConfirm({ title: `Remove the ${threshold}-invite tier?`, type: 'danger', confirmStyle: 'danger' }))) return;
    try {
        const ref = doc(db, 'settings', 'partnerTiers');
        const snap = await getDoc(ref);
        const tiers = (snap.exists() ? (snap.data().tiers || []) : []).filter(t => t.threshold !== threshold);
        await setDoc(ref, { tiers }, { merge: true });
        renderPartnerTiers(tiers);
        showToast('🗑️ Tier removed');
    } catch (err) {
        console.error('Delete tier error:', err);
        showToast('❌ Could not remove tier.', 'error');
    }
}

// ========================================
// COUPONS
// ========================================
async function loadCoupons() {
    const listEl = document.getElementById('couponsList');
    try {
        const snap = await getDocs(query(collection(db, 'coupons'), orderBy('createdAt', 'desc')));
        renderCoupons(snap.docs.map(d => ({ code: d.id, ...d.data() })));
    } catch (err) {
        console.error('Load coupons error:', err);
        listEl.innerHTML = `<div class="admin-empty"><p>Could not load coupons.</p></div>`;
    }
}

function renderCoupons(coupons) {
    const listEl = document.getElementById('couponsList');
    if (!coupons.length) {
        listEl.innerHTML = `<div class="admin-empty"><p>No coupons yet — create one above.</p></div>`;
        return;
    }
    listEl.innerHTML = coupons.map(c => `
        <div class="tier-card">
            <div class="tier-card-info">
                <strong>${escapeHtml(c.code)}</strong> — ₦${(c.minReward || 0).toLocaleString()} to ₦${(c.maxReward || 0).toLocaleString()}
                <span class="status-badge ${c.active ? 'active' : 'closed'}" style="margin-left:8px;">${c.active ? 'active' : 'inactive'}</span>
            </div>
            <button data-code="${escapeHtml(c.code)}" data-active="${c.active}">${c.active ? 'Deactivate' : 'Activate'}</button>
        </div>
    `).join('');

    listEl.querySelectorAll('button[data-code]').forEach(btn => {
        btn.addEventListener('click', () => toggleCoupon(btn.dataset.code, btn.dataset.active === 'true'));
    });
}

document.getElementById('addCouponForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('addCouponMessage');
    const btn = document.getElementById('addCouponSubmit');
    const code = document.getElementById('couponCodeInput').value.trim().toUpperCase();
    const minReward = Number(document.getElementById('couponMinInput').value);
    const maxReward = Number(document.getElementById('couponMaxInput').value);

    if (!code) { msg.textContent = 'Enter a code.'; msg.className = 'form-message error'; return; }
    if (!minReward || !maxReward || minReward <= 0 || maxReward <= 0 || minReward > maxReward) {
        msg.textContent = 'Enter a valid min/max reward range (min must not exceed max).';
        msg.className = 'form-message error';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    try {
        const ref = doc(db, 'coupons', code);
        const existing = await getDoc(ref);
        if (existing.exists()) {
            msg.textContent = 'A coupon with this code already exists — deactivate it first or use a different code.';
            msg.className = 'form-message error';
            return;
        }
        await setDoc(ref, { minReward, maxReward, active: true, createdAt: serverTimestamp() });
        msg.textContent = `Coupon "${code}" created and active.`;
        msg.className = 'form-message success';
        document.getElementById('addCouponForm').reset();
        loadCoupons();
    } catch (err) {
        console.error('Create coupon error:', err);
        msg.textContent = err.message || 'Could not create coupon.';
        msg.className = 'form-message error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> Create & Activate';
    }
});

async function toggleCoupon(code, currentlyActive) {
    const action = currentlyActive ? 'deactivate (expire)' : 'reactivate';
    if (!(await uiConfirm({ title: `Are you sure you want to ${action} "${escapeHtml(code)}"?` }))) return;
    try {
        await updateDoc(doc(db, 'coupons', code), { active: !currentlyActive });
        loadCoupons();
        showToast(currentlyActive ? '🚫 Coupon deactivated' : '✅ Coupon reactivated');
    } catch (err) {
        console.error('Toggle coupon error:', err);
        showToast('❌ Could not update coupon.', 'error');
    }
}

// ========================================
// WELCOME BANNER
// ========================================
async function loadBannerSettings() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'welcomeBanner'));
        const data = snap.exists() ? snap.data() : {};
        document.getElementById('bannerEnabledInput').checked = !!data.enabled;
        renderBannerMessages(data.messages || []);
    } catch (err) {
        console.error('Load banner error:', err);
    }

    try {
        const fsSnap = await getDoc(doc(db, 'settings', 'fullScreenBanner'));
        const fsData = fsSnap.exists() ? fsSnap.data() : {};
        document.getElementById('fsBannerTitleInput').value = fsData.title || '';
        document.getElementById('fsBannerMessageInput').value = fsData.message || '';
        document.getElementById('fsBannerEnabledInput').checked = !!fsData.enabled;
        document.getElementById('fsButtonTextInput').value = fsData.buttonText || '';
        document.getElementById('fsButtonLinkInput').value = fsData.buttonLink || '';
        document.getElementById('fsButtonEnabledInput').checked = !!fsData.buttonEnabled;
    } catch (err) {
        console.error('Load full-screen banner error:', err);
    }
}

function renderBannerMessages(messages) {
    const listEl = document.getElementById('bannerMessagesList');
    if (!messages.length) {
        listEl.innerHTML = `<div class="admin-empty"><p>No messages yet — add one above.</p></div>`;
        return;
    }
    listEl.innerHTML = messages.map(m => `
        <div class="tier-card">
            <div class="tier-card-info">${escapeHtml(m.text)}</div>
            <button data-id="${m.id}"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');

    listEl.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteBannerMessage(btn.dataset.id));
    });
}

document.getElementById('bannerEnabledInput')?.addEventListener('change', async (e) => {
    const checked = e.target.checked;
    try {
        await setDoc(doc(db, 'settings', 'welcomeBanner'), {
            enabled: checked, updatedAt: serverTimestamp()
        }, { merge: true });
        showToast(checked ? '📢 Banner is now live' : '🔕 Banner turned off');
    } catch (err) {
        console.error('Toggle banner error:', err);
        showToast('❌ Could not update banner.', 'error');
        e.target.checked = !checked;
    }
});

document.getElementById('addBannerMessageForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('bannerFormMessage');
    const btn = document.getElementById('addBannerMessageBtn');
    const textInput = document.getElementById('bannerMessageInput');
    const text = textInput.value.trim();

    if (!text) { msg.textContent = 'Write a message first.'; msg.className = 'form-message error'; return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Adding...';
    try {
        const ref = doc(db, 'settings', 'welcomeBanner');
        const snap = await getDoc(ref);
        const messages = snap.exists() ? (snap.data().messages || []) : [];

        messages.push({ id: crypto.randomUUID(), text });
        await setDoc(ref, { messages, updatedAt: serverTimestamp() }, { merge: true });

        renderBannerMessages(messages);
        msg.textContent = 'Message added.';
        msg.className = 'form-message success';
        textInput.value = '';
    } catch (err) {
        console.error('Add banner message error:', err);
        msg.textContent = err.message || 'Could not add message.';
        msg.className = 'form-message error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus"></i> Add Message';
    }
});

async function deleteBannerMessage(id) {
    if (!(await uiConfirm({ title: 'Remove this message from the rotation?', type: 'danger', confirmStyle: 'danger' }))) return;
    try {
        const ref = doc(db, 'settings', 'welcomeBanner');
        const snap = await getDoc(ref);
        const messages = (snap.exists() ? (snap.data().messages || []) : []).filter(m => m.id !== id);
        await setDoc(ref, { messages }, { merge: true });
        renderBannerMessages(messages);
        showToast('🗑️ Message removed');
    } catch (err) {
        console.error('Delete banner message error:', err);
        showToast('❌ Could not remove message.', 'error');
    }
}

document.getElementById('fullscreenBannerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('fsBannerFormMessage');
    const btn = document.getElementById('fsBannerSaveBtn');
    const title = document.getElementById('fsBannerTitleInput').value.trim();
    const message = document.getElementById('fsBannerMessageInput').value.trim();
    const enabled = document.getElementById('fsBannerEnabledInput').checked;
    const buttonText = document.getElementById('fsButtonTextInput').value.trim();
    let buttonLink = document.getElementById('fsButtonLinkInput').value.trim();
    const buttonEnabled = document.getElementById('fsButtonEnabledInput').checked;

    if (enabled && !message) {
        msg.textContent = 'Write a message before turning the full-screen banner on.';
        msg.className = 'form-message error';
        return;
    }
    if (buttonEnabled && (!buttonText || !buttonLink)) {
        msg.textContent = 'Add both a button text and a link before turning the button on.';
        msg.className = 'form-message error';
        return;
    }
    if (buttonLink && !/^https?:\/\//i.test(buttonLink)) {
        buttonLink = 'https://' + buttonLink;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    try {
        await setDoc(doc(db, 'settings', 'fullScreenBanner'), {
            title, message, enabled, buttonText, buttonLink, buttonEnabled, updatedAt: serverTimestamp()
        }, { merge: true });
        msg.textContent = 'Full-screen banner saved.';
        msg.className = 'form-message success';
        showToast(enabled ? '📢 Full-screen banner is now live' : '💾 Saved (hidden from users)');
    } catch (err) {
        console.error('Save full-screen banner error:', err);
        msg.textContent = err.message || 'Could not save.';
        msg.className = 'form-message error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Full-Screen Banner';
    }
});

// ---------- COPY TO CLIPBOARD ----------
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.copy-btn, .copy-txid-btn');
    if (!btn) return;
    e.stopPropagation();
    const text = btn.dataset.copy;
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        const icon = btn.querySelector('i');
        icon.className = 'fas fa-check';
        setTimeout(() => { icon.className = 'fas fa-copy'; }, 1200);
        showToast('📋 Copied!');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('❌ Could not copy.', 'error');
    }
});

// ========================================
// EXCHANGE RATES
// ========================================
const DEFAULT_RATES = {
    usdToNgn: 1600,
    usdtUsd:  1.00,
    btcUsd:   65000,
    ethUsd:   3200,
    minNaira: 3500,
    maxNaira: 200000
};

async function loadRatesSettings() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'exchangeRates'));
        const data = snap.exists() ? snap.data() : DEFAULT_RATES;
        document.getElementById('rateUsdNgnInput').value = data.usdToNgn  ?? DEFAULT_RATES.usdToNgn;
        document.getElementById('rateUsdtInput').value   = data.usdtUsd   ?? DEFAULT_RATES.usdtUsd;
        document.getElementById('rateBtcInput').value    = data.btcUsd    ?? DEFAULT_RATES.btcUsd;
        document.getElementById('rateEthInput').value    = data.ethUsd    ?? DEFAULT_RATES.ethUsd;
        document.getElementById('rateMinInput').value    = data.minNaira  ?? DEFAULT_RATES.minNaira;
        document.getElementById('rateMaxInput').value    = data.maxNaira  ?? DEFAULT_RATES.maxNaira;

        const msg = document.getElementById('ratesMessage');
        if (!snap.exists()) {
            msg.textContent = 'Using defaults — click Save to store them.';
            msg.className = 'form-message';
        } else {
            msg.textContent = '';
        }
    } catch (err) {
        console.error('Load rates error:', err);
    }
}

document.getElementById('ratesForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('ratesMessage');
    const btn = document.getElementById('ratesSaveBtn');

    const usdToNgn = Number(document.getElementById('rateUsdNgnInput').value);
    const usdtUsd  = Number(document.getElementById('rateUsdtInput').value);
    const btcUsd   = Number(document.getElementById('rateBtcInput').value);
    const ethUsd   = Number(document.getElementById('rateEthInput').value);
    const minNaira = Number(document.getElementById('rateMinInput').value);
    const maxNaira = Number(document.getElementById('rateMaxInput').value);

    if (!usdToNgn || usdToNgn <= 0) {
        msg.textContent = 'USD → NGN rate must be greater than 0.';
        msg.className = 'form-message error'; return;
    }
    if (!usdtUsd || usdtUsd <= 0 || !btcUsd || btcUsd <= 0 || !ethUsd || ethUsd <= 0) {
        msg.textContent = 'All crypto prices must be greater than 0.';
        msg.className = 'form-message error'; return;
    }
    if (!minNaira || !maxNaira || minNaira <= 0 || maxNaira <= 0 || minNaira >= maxNaira) {
        msg.textContent = 'Min must be less than Max, both greater than 0.';
        msg.className = 'form-message error'; return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    try {
        await setDoc(doc(db, 'settings', 'exchangeRates'), {
            usdToNgn, usdtUsd, btcUsd, ethUsd, minNaira, maxNaira,
            updatedAt: serverTimestamp()
        }, { merge: true });

        msg.textContent = '✅ Rates saved. Deposit page will use them immediately.';
        msg.className = 'form-message success';
        showToast('✅ Exchange rates updated');
    } catch (err) {
        console.error('Save rates error:', err);
        msg.textContent = err.message || 'Could not save rates.';
        msg.className = 'form-message error';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Rates';
    }
});

// ---------- UTIL ----------
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

console.log('Admin panel ready!');