// ========================================
// DASHBOARD - COMPLETE WITH FIREBASE
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, increment, collection, getDocs, query, where, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { initNotificationBell } from "./notifications.js";
import { enforceAccountGuard } from "./accountGuard.js";

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

const userName = document.getElementById('userName');
const avatarImg = document.getElementById('avatarImg');
const logoutBtn = document.getElementById('logoutBtn');
const notificationBtn = document.getElementById('notificationBtn');
const faqSection = document.getElementById('faqSection');

let currentUID = null;

// Inject styles
const style = document.createElement('style');
style.textContent = `
    .claim-section { display: none !important; }
    .invest-claim-btn {
        width: 100%;
        margin-top: 12px;
        padding: 10px;
        border: none;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        font-family: monospace;
        background: linear-gradient(135deg, #00c6ff, #0072ff);
        color: #fff;
        transition: opacity 0.2s;
    }
    .invest-claim-btn:disabled {
        background: #1e2537;
        color: #8892b0;
        cursor: not-allowed;
    }
    .invest-daily {
        color: #51cf66;
        font-size: 12px;
        margin-top: 4px;
        display: block;
    }
    .invest-days {
        color: #8892b0;
        font-size: 12px;
        margin-top: 2px;
        display: block;
    }
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(style);

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }

    const blocked = await enforceAccountGuard(db, auth, user.uid);
    if (blocked) return;

    currentUID = user.uid;
    const displayName = user.displayName || 'Platform User';
    if (userName) userName.textContent = `Welcome back, ${displayName}`;
    if (avatarImg) avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00d4ff&color=fff&size=40`;

    try {
        const [userDocSnap, investmentsSnap] = await Promise.all([
            getDoc(doc(db, 'users', user.uid)),
            getDocs(collection(db, 'users', user.uid, 'investments'))
        ]);

        const userData = userDocSnap.exists() ? userDocSnap.data() : {};
        const balance = userData.balance || 0;
        let investments = investmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Close out any plan whose end date has passed, even if the user
        // never claimed every day — the remaining unclaimed days are
        // forfeited rather than left dangling forever. This runs on every
        // dashboard visit, so it catches plans regardless of whether the
        // user was actively claiming.
        investments = await closeExpiredInvestments(user.uid, investments);

        renderStats(balance, investments);
        renderInvestments(user.uid, investments);
        loadRecentActivity(user.uid);

        const gsEl = document.getElementById('gettingStarted');
        if (gsEl) gsEl.style.display = (balance <= 1500 && investments.length === 0) ? 'flex' : 'none';

    } catch (err) {
        console.error('Dashboard load error:', err);
        renderStats(0, []);
        renderInvestments(currentUID, []);
    }
    if (!user) { window.location.href = "login.html"; return; }
  initNotificationBell(db, user.uid);
});

// ---------- EXPIRY SAFETY NET ----------
// Closes any RUNNING plan whose end date (startDate + totalDays) has
// already passed, whether or not every day was claimed. Unclaimed days are
// forfeited — the plan just stops, with whatever profit was already
// claimed staying as-is. Runs on every dashboard load so it doesn't depend
// on the user claiming right up to the last day.
async function closeExpiredInvestments(uid, investments) {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const updated = await Promise.all(investments.map(async (inv) => {
        if (inv.status !== 'running' || !inv.startDate) return inv;

        const endTime = inv.startDate.toDate().getTime() + (inv.totalDays || 14) * DAY_MS;
        if (now < endTime) return inv;

        try {
            const closed = await runTransaction(db, async (tx) => {
                const ref = doc(db, 'users', uid, 'investments', inv.id);
                const snap = await tx.get(ref);
                if (!snap.exists() || snap.data().status !== 'running') return null; // already handled elsewhere

                tx.update(ref, {
                    status: 'completed',
                    completedAt: serverTimestamp(),
                    expiredUnclaimed: (snap.data().totalDays || 14) - (snap.data().daysCompleted || 0) > 0
                });
                return { ...snap.data(), id: inv.id, status: 'completed' };
            });
            return closed || inv;
        } catch (err) {
            console.error('Could not close expired investment:', err);
            return inv;
        }
    }));

    return updated;
}

// CSS adds ₦ via ::before — don't add it again here
function renderStats(balance, investments) {
    const totalInvested = investments.reduce((s, i) => s + (i.amountInvested || 0), 0);
    const totalProfit   = investments.reduce((s, i) => s + (i.profit || 0), 0);
    const activePlans   = investments.filter(i => i.status === 'running').length;
    const roi = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : '0.0';

    // Pending Profit = total profit still owed across ALL remaining days on
    // every currently RUNNING plan (dailyEarning × days left), summed. This
    // is separate from Total Profit, which is what's already been claimed
    // (lifetime, including completed plans).
    const pendingProfit = investments
        .filter(i => i.status === 'running')
        .reduce((s, i) => {
            const daysLeft = Math.max(0, (i.totalDays || 14) - (i.daysCompleted || 0));
            return s + (i.dailyEarning || 0) * daysLeft;
        }, 0);

    setText('statWalletBalance', balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('statTotalInvested', totalInvested.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('statTotalProfit',   totalProfit.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setText('statRoi', `${roi}%`);
    setText('statActivePlans', activePlans);
    setText('statPendingProfit', `₦${pendingProfit.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ---------- RENDER INVESTMENTS ----------
function renderInvestments(uid, investments) {
    const grid = document.getElementById('investmentGrid');
    if (!grid) return;

    if (investments.length === 0) {
        grid.innerHTML = `
            <div class="investments-empty">
                <i class="fas fa-box-open"></i>
                <p>No active investments yet</p>
                <span>Browse a plan to get started</span>
                <a href="plans.html">View Plans</a>
            </div>`;
        return;
    }

    grid.innerHTML = investments.map(inv => {
        const totalDays    = inv.totalDays || 14;
        const daysCompleted = inv.daysCompleted || 0;
        const progress     = Math.min(100, Math.round((daysCompleted / totalDays) * 100));
        const statusLabel  = inv.status === 'completed' ? 'Completed' : 'Running';
        const profitDisplay = `₦${(inv.profit || 0).toLocaleString()}`;
        const dailyEarning = inv.dailyEarning || 0;
        const isRunning    = inv.status === 'running';

        return `
            <div class="investment-card" id="inv-card-${inv.id}">
                <div class="invest-header">
                    <span class="invest-name">${inv.planName || 'Plan'}</span>
                    <span class="invest-status ${inv.status === 'completed' ? 'completed' : 'running'}">${statusLabel}</span>
                </div>
                <div class="invest-details">
                    <div class="invest-item"><span>Invested</span><strong>₦${(inv.amountInvested || 0).toLocaleString()}</strong></div>
                    <div class="invest-item"><span>Earned</span><strong>${profitDisplay}</strong></div>
                    <div class="invest-item"><span>Day</span><strong>${daysCompleted}/${totalDays}</strong></div>
                </div>
                ${isRunning && dailyEarning > 0 ? `
                    <span class="invest-daily">Daily: ₦${dailyEarning.toLocaleString()}</span>
                    <span class="invest-days">${totalDays - daysCompleted} days remaining</span>
                    <button class="invest-claim-btn" id="claim-${inv.id}" disabled>Loading...</button>
                ` : ''}
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${progress}%"></div>
                </div>
            </div>`;
    }).join('');

    // Setup claim button for each running investment
    investments.forEach(inv => {
        if (inv.status === 'running' && (inv.dailyEarning || 0) > 0) {
            setupInvestmentClaim(uid, inv);
        }
    });
}

function setupInvestmentClaim(uid, inv) {
    const btn = document.getElementById(`claim-${inv.id}`);
    if (!btn) return;

    const dailyEarning  = inv.dailyEarning || 0;
    const lastClaimed   = inv.lastClaimed;
    const daysCompleted = inv.daysCompleted || 0;
    const totalDays     = inv.totalDays || 14;
    const now           = Date.now();

    // If already completed all days
    if (daysCompleted >= totalDays) {
        btn.disabled = true;
        btn.textContent = 'Plan Completed';
        return;
    }

    // Calculate time remaining since last claim
    const lastClaimedTime = lastClaimed ? lastClaimed.toDate().getTime() : now;
    const timeRemaining   = (24 * 60 * 60 * 1000) - (now - lastClaimedTime);

    if (timeRemaining > 0) {
        // Still in cooldown
        btn.disabled = true;
        startInvestmentCountdown(timeRemaining, btn, uid, inv);
    } else {
        // Ready to claim
        btn.disabled = false;
        btn.textContent = `Claim ₦${dailyEarning.toLocaleString()}`;
        btn.onclick = () => handleInvestmentClaim(uid, inv, btn);
    }
}

function startInvestmentCountdown(timeRemaining, btn, uid, inv) {
    let remaining = timeRemaining;
    function tick() {
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        btn.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    tick();
    const interval = setInterval(() => {
        remaining -= 1000;
        if (remaining <= 0) {
            clearInterval(interval);
            const daysCompleted = inv.daysCompleted || 0;
            const totalDays     = inv.totalDays || 14;
            if (daysCompleted >= totalDays) {
                btn.disabled = true;
                btn.textContent = 'Plan Completed';
            } else {
                btn.disabled = false;
                btn.textContent = `Claim ₦${(inv.dailyEarning || 0).toLocaleString()}`;
                btn.onclick = () => handleInvestmentClaim(uid, inv, btn);
            }
        } else { tick(); }
    }, 1000);
}

async function handleInvestmentClaim(uid, inv, btn) {
    btn.disabled = true;
    btn.textContent = 'Claiming...';

    const dailyEarningFallback = inv.dailyEarning || 0;
    let newDays = 0;
    let totalDays = inv.totalDays || 14;
    let isPlanDone = false;
    let claimedAmount = 0;

    try {
        // Re-read everything fresh inside the transaction instead of trusting
        // the `inv` object passed in — that can be stale (e.g. two rapid
        // clicks before the button disables, or the cooldown/day-count
        // having changed since the card was rendered). This is the actual
        // enforcement that stops someone claiming more than totalDays times;
        // the disabled button is just a UI nicety on top of it.
        const result = await runTransaction(db, async (tx) => {
            const invRef = doc(db, 'users', uid, 'investments', inv.id);
            const userRef = doc(db, 'users', uid);
            const invSnap = await tx.get(invRef);

            if (!invSnap.exists()) throw new Error('This plan no longer exists.');
            const data = invSnap.data();

            if (data.status !== 'running') throw new Error('This plan is no longer active.');

            const daysCompleted = data.daysCompleted || 0;
            totalDays = data.totalDays || 14;
            if (daysCompleted >= totalDays) throw new Error('Every day on this plan has already been claimed.');

            const lastClaimedTime = data.lastClaimed ? data.lastClaimed.toDate().getTime() : 0;
            if (Date.now() - lastClaimedTime < 24 * 60 * 60 * 1000) {
                throw new Error('Not ready to claim yet — check back later.');
            }

            const dailyEarning = data.dailyEarning || dailyEarningFallback;
            newDays = daysCompleted + 1;
            isPlanDone = newDays >= totalDays;
            claimedAmount = dailyEarning;

            tx.update(invRef, {
                lastClaimed:   serverTimestamp(),
                profit:        increment(dailyEarning),
                daysCompleted: increment(1),
                ...(isPlanDone ? { status: 'completed', completedAt: serverTimestamp() } : {})
            });
            tx.update(userRef, {
                balance:     increment(dailyEarning),
                totalEarned: increment(dailyEarning)
            });

            return true;
        });

        if (!result) return;

        if (isPlanDone) {
            showToast(`🎉 ₦${claimedAmount.toLocaleString()} claimed! Plan completed after ${totalDays} days!`, 'success');
            btn.disabled = true;
            btn.textContent = 'Plan Completed ✅';

            // Reload to move plan to completed
            setTimeout(() => window.location.reload(), 2500);
        } else {
            showToast(`✅ ₦${claimedAmount.toLocaleString()} claimed! Day ${newDays}/${totalDays}`, 'success');

            // Update inv object for countdown
            inv.daysCompleted = newDays;
            startInvestmentCountdown(24 * 60 * 60 * 1000, btn, uid, inv);

            // Update days display
            const card = document.getElementById(`inv-card-${inv.id}`);
            if (card) {
                const dayEl = card.querySelector('.invest-item:last-child strong');
                if (dayEl) dayEl.textContent = `${newDays}/${totalDays}`;
                const remainEl = card.querySelector('.invest-days');
                if (remainEl) remainEl.textContent = `${totalDays - newDays} days remaining`;
                const progressFill = card.querySelector('.progress-fill');
                if (progressFill) progressFill.style.width = `${Math.round((newDays / totalDays) * 100)}%`;
            }
        }

        // Refresh balance
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
            setText('statWalletBalance', (snap.data().balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }));
        }

    } catch (err) {
        console.error('Claim error:', err);
        showToast(err.message || 'Failed to claim. Try again.', 'error');
        btn.disabled = false;
        btn.textContent = `Claim ₦${dailyEarning.toLocaleString()}`;
    }
}

// ---------- RECENT ACTIVITY ----------
async function loadRecentActivity(uid) {
    const listEl = document.getElementById('recentActivityList');
    if (!listEl) return;
    try {
        const [dSnap, wSnap, iSnap] = await Promise.all([
            getDocs(query(collection(db, 'deposits'), where('uid', '==', uid))),
            getDocs(query(collection(db, 'withdrawals'), where('uid', '==', uid))),
            getDocs(collection(db, 'users', uid, 'investments'))
        ]);
        const items = [
            ...dSnap.docs.map(d => ({ kind: 'deposit', ...d.data() })),
            ...wSnap.docs.map(d => ({ kind: 'withdrawal', ...d.data() })),
            ...iSnap.docs.map(d => ({ kind: 'investment', ...d.data() }))
        ];
        if (items.length === 0) {
            listEl.innerHTML = `<div class="activity-empty"><i class="fas fa-clock-rotate-left"></i><p>No activity yet</p></div>`;
            return;
        }
        items.sort((a, b) => ((b.createdAt || b.startDate)?.toMillis() || 0) - ((a.createdAt || a.startDate)?.toMillis() || 0));
        const icons  = { deposit: 'arrow-down', withdrawal: 'arrow-up', investment: 'box' };
        const labels = { deposit: 'Deposit', withdrawal: 'Withdrawal', investment: 'Investment' };
        listEl.innerHTML = items.slice(0, 6).map(item => {
            const time   = item.createdAt || item.startDate;
            const date   = time ? time.toDate().toLocaleDateString('en-NG', { month: 'short', day: 'numeric' }) : '';
            const amount = item.kind === 'investment' ? item.amountInvested : item.amount;
            const label  = item.kind === 'investment' ? (item.planName || 'Plan') : labels[item.kind];
            const status = item.kind === 'investment' ? (item.status || 'running') : item.status;
            return `<div class="activity-item">
                <div class="activity-icon ${item.kind}"><i class="fas fa-${icons[item.kind]}"></i></div>
                <div class="activity-info">
                    <span class="activity-label">${label}</span>
                    <span class="activity-date">${date} · ${status}</span>
                </div>
                <span class="activity-amount">₦${(amount || 0).toLocaleString()}</span>
            </div>`;
        }).join('');
    } catch (err) { console.error('Activity error:', err); }
}

if (logoutBtn) logoutBtn.addEventListener('click', async (e) => { e.preventDefault(); await signOut(auth); window.location.href = 'login.html'; });
//if (notificationBtn) notificationBtn.addEventListener('click', () => showToast('No new notifications'));
if (faqSection) faqSection.addEventListener('click', () => window.location.href = 'support.html');

function showToast(message, type = 'info') {
    const existing = document.querySelector('.demo-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    const colors = { success: '#51cf66', error: '#ff6b6b', info: '#00d4ff' };
    toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e2537;color:#e6f1ff;padding:12px 24px;border-radius:12px;border-left:4px solid ${colors[type]||colors.info};box-shadow:0 8px 24px rgba(0,0,0,0.6);font-size:14px;z-index:9999;font-family:'Segoe UI',sans-serif;max-width:90%;text-align:center;animation:slideUp 0.3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3000);
}

const menuToggle = document.getElementById('menuToggle');
const sidebar    = document.querySelector('.sidebar');
const overlay    = document.getElementById('overlay');
if (menuToggle) menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
if (overlay)    overlay.addEventListener('click',    () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

// ---------- COUPON REDEEM ----------
const couponFabBtn = document.getElementById('couponFabBtn');
const couponModalOverlay = document.getElementById('couponModalOverlay');
const couponModalClose = document.getElementById('couponModalClose');
const couponInput = document.getElementById('couponInput');
const couponRedeemBtn = document.getElementById('couponRedeemBtn');
const couponModalMessage = document.getElementById('couponModalMessage');

function openCouponModal() {
    couponModalOverlay.classList.add('open');
    couponInput.value = '';
    couponModalMessage.textContent = '';
    couponModalMessage.className = 'coupon-modal-message';
    setTimeout(() => couponInput.focus(), 50);
}
function closeCouponModal() { couponModalOverlay.classList.remove('open'); }

if (couponFabBtn) couponFabBtn.addEventListener('click', openCouponModal);
if (couponModalClose) couponModalClose.addEventListener('click', closeCouponModal);
if (couponModalOverlay) couponModalOverlay.addEventListener('click', (e) => { if (e.target === couponModalOverlay) closeCouponModal(); });

if (couponRedeemBtn) couponRedeemBtn.addEventListener('click', async () => {
    const code = couponInput.value.trim().toUpperCase();
    couponModalMessage.textContent = '';
    couponModalMessage.className = 'coupon-modal-message';

    if (!code) {
        couponModalMessage.textContent = 'Enter a code.';
        couponModalMessage.className = 'coupon-modal-message error';
        return;
    }
    if (!currentUID) return;

    couponRedeemBtn.disabled = true;
    couponRedeemBtn.textContent = 'Redeeming...';

    try {
        const wonAmount = await runTransaction(db, async (tx) => {
            const couponRef = doc(db, 'coupons', code);
            const redemptionRef = doc(db, 'users', currentUID, 'couponRedemptions', code);
            const userRef = doc(db, 'users', currentUID);

            const [couponSnap, redemptionSnap] = await Promise.all([tx.get(couponRef), tx.get(redemptionRef)]);

            if (!couponSnap.exists() || couponSnap.data().active !== true) {
                throw new Error('Invalid or expired code.');
            }
            if (redemptionSnap.exists()) {
                throw new Error("You've already redeemed this code.");
            }

            const { minReward, maxReward } = couponSnap.data();
            const amount = Math.round((Math.random() * (maxReward - minReward) + minReward) * 100) / 100;

            tx.set(redemptionRef, { code, amount, redeemedAt: serverTimestamp() });
            tx.update(userRef, { balance: increment(amount) });

            return amount;
        });

        couponModalMessage.textContent = `🎉 You won ₦${wonAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}!`;
        couponModalMessage.className = 'coupon-modal-message success';
        showToast(`🎉 ₦${wonAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} added to your wallet!`, 'success');

        const snap = await getDoc(doc(db, 'users', currentUID));
        if (snap.exists()) {
            setText('statWalletBalance', (snap.data().balance || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 }));
        }

        setTimeout(closeCouponModal, 1800);
    } catch (err) {
        console.error('Coupon redeem error:', err);
        couponModalMessage.textContent = err.message || 'Could not redeem this code. Try again.';
        couponModalMessage.className = 'coupon-modal-message error';
    } finally {
        couponRedeemBtn.disabled = false;
        couponRedeemBtn.textContent = 'Redeem';
    }
});

console.log('Dashboard ready!');
