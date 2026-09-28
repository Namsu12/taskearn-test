// ========================================
// INVESTMENT PLANS - COMPLETE JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { uiConfirm, uiAlert } from "./ui.js";

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

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;
    const displayName = user.displayName || 'Platform User';
    const avatarImg = document.getElementById('userAvatarImg');
    if (avatarImg) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00d4ff&color=fff&size=36`;
        avatarImg.alt = displayName;
        avatarImg.title = displayName;
    }

    const topBalanceEl = document.getElementById('topBalance');
    try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const balance = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
        if (topBalanceEl) {
            topBalanceEl.textContent = `₦${balance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
        }
    } catch (error) { console.error('Failed to load balance:', error); }

    loadPlansFromFirestore();
});

// ---------- LOAD PLANS FROM FIRESTORE (sorted by price) ----------
async function loadPlansFromFirestore() {
    const plansGrid = document.getElementById('plansGrid');
    if (!plansGrid) return;
    try {
        const snap = await getDocs(collection(db, 'plans'));
        if (snap.empty) return;
        const plans = snap.docs.map(d => d.data()).sort((a, b) => a.price - b.price);
        plansGrid.innerHTML = '';
        plans.forEach(plan => {
            const card = document.createElement('div');
            card.className = 'plan-card';
            card.innerHTML = `
                <div class="plan-badge">${plan.name}</div>
                <div class="plan-price">₦${(plan.price || 0).toLocaleString()}</div>
                <div class="plan-details">
                    <div class="plan-item">
                        <span>Daily Earning</span>
                        <strong>₦${(plan.dailyEarning || 0).toLocaleString()}</strong>
                    </div>
                    <div class="plan-item">
                        <span>Duration</span>
                        <strong>14 Days</strong>
                    </div>
                    <div class="plan-item">
                        <span>Total Earning</span>
                        <strong>₦${((plan.dailyEarning || 0) * 14).toLocaleString()}</strong>
                    </div>
                </div>
                <button class="btn-buy"
                    data-plan="${plan.name}"
                    data-price="${plan.price}"
                    data-daily="${plan.dailyEarning}">
                    Invest Now
                </button>
            `;
            plansGrid.appendChild(card);
        });
        attachBuyButtons();
    } catch (error) { console.error('Failed to load plans:', error); }
}

// ---------- BUY BUTTONS ----------
function attachBuyButtons() {
    const buyButtons = document.querySelectorAll('.btn-buy');
    buyButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            if (!currentUser) { showToast('Please log in first.', 'error'); return; }

            const planName    = this.dataset.plan || 'Plan';
            const planPrice   = parseInt(this.dataset.price) || 0;
            const dailyEarning = parseInt(this.dataset.daily) || 0;
            const totalEarning = dailyEarning * 14;
            const userRef = doc(db, 'users', currentUser.uid);

            let balance = 0;
            try {
                const userSnap = await getDoc(userRef);
                balance = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
            } catch (error) {
                showToast('Could not verify your balance. Try again.', 'error');
                return;
            }

            if (planPrice > balance) {
                showToast(`Insufficient balance! Need ₦${planPrice.toLocaleString()}, have ₦${balance.toLocaleString()}`, 'error');
                return;
            }

            const ok = await uiConfirm({
                title: 'Confirm Purchase',
                type: 'info',
                confirmText: 'Invest Now',
                confirmStyle: 'primary',
                cancelText: 'Cancel',
                message: `
                    <p>Plan: <strong>${planName}</strong></p>
                    <p>Cost: <span class="te-amount">₦${planPrice.toLocaleString()}</span></p>
                    <p>Daily Earning: <strong>₦${dailyEarning.toLocaleString()}</strong></p>
                    <p>Duration: <strong>14 Days</strong></p>
                    <p>Total Earning: <span class="te-success-text">₦${totalEarning.toLocaleString()}</span></p>
                    <p style="color:#8892b0;font-size:12.5px;margin-top:12px;">First claim available 24 hours after purchase.</p>
                `
            });
            if (!ok) return;

            btn.disabled = true;
            btn.textContent = 'Processing...';

            try {
                await updateDoc(userRef, { balance: balance - planPrice });

                await addDoc(collection(db, 'users', currentUser.uid, 'investments'), {
                    planName,
                    amountInvested: planPrice,
                    dailyEarning,
                    totalDays: 14,
                    daysCompleted: 0,
                    startDate: serverTimestamp(),
                    lastClaimed: serverTimestamp(),
                    status: 'running',
                    profit: 0
                });

                showToast(`✅ Invested ₦${planPrice.toLocaleString()} in ${planName}! First claim in 24 hours.`, 'success');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);

            } catch (error) {
                console.error('Purchase failed:', error);
                showToast('Purchase failed. Please try again.', 'error');
                btn.disabled = false;
                btn.textContent = 'Invest Now';
            }
        });
    });
}

// ---------- TOAST ----------
function showToast(message, type = 'success') {
    const existing = document.querySelector('.demo-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'demo-toast';
    const colors = { success: '#51cf66', error: '#ff6b6b', info: '#00d4ff' };
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%;
        transform: translateX(-50%);
        background: #1e2537; color: #e6f1ff;
        padding: 12px 24px; border-radius: 12px;
        border-left: 4px solid ${colors[type] || colors.success};
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
        font-size: 14px; z-index: 9999;
        font-family: 'Segoe UI', sans-serif;
        animation: slideUp 0.3s ease;
        max-width: 90%; text-align: center;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(style);

console.log('Plans ready!');