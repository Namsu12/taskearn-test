// ========================================
// WALLET - COMPLETE JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
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

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    const blocked = await enforceAccountGuard(db, auth, user.uid);
    if (blocked) return;
    
    const displayName = user.displayName || 'Platform User';
    const avatarImg = document.getElementById('userAvatarImg');
    if (avatarImg) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00d4ff&color=fff&size=36`;
        avatarImg.alt = displayName;
        avatarImg.title = displayName;
    }

    const balanceEl = document.getElementById('walletBalanceAmount');
    try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        const balance = docSnap.exists() ? (docSnap.data().balance || 0) : 0;
        if (balanceEl) {
            balanceEl.textContent = balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
    } catch (error) {
        console.error('Failed to load wallet balance:', error);
        if (balanceEl) balanceEl.textContent = '0.00';
    }

    loadTransactionHistory(user.uid);
});

async function loadTransactionHistory(uid) {
    const listEl = document.getElementById('transactionList');
    if (!listEl) return;

    try {
        const [depositsSnap, withdrawalsSnap, referralSnap, partnerSnap] = await Promise.all([
            getDocs(query(collection(db, 'deposits'), where('uid', '==', uid))),
            getDocs(query(collection(db, 'withdrawals'), where('uid', '==', uid))),
            getDocs(collection(db, 'users', uid, 'referralHistory')),
            getDocs(collection(db, 'users', uid, 'partnerClaims'))
        ]);

        const items = [
            ...depositsSnap.docs.map(d => ({ type: 'deposit', ...d.data() })),
            ...withdrawalsSnap.docs.map(d => ({ type: 'withdrawal', ...d.data() })),
            ...referralSnap.docs.map(d => ({ type: 'referral', status: 'approved', createdAt: d.data().createdAt, amount: d.data().amount, level: d.data().level })),
            ...partnerSnap.docs.map(d => ({ type: 'partner', status: 'approved', createdAt: d.data().claimedAt, amount: d.data().reward, threshold: d.data().threshold }))
        ];

        if (items.length === 0) {
            listEl.innerHTML = `
                <div class="transaction-empty">
                    <i class="fas fa-receipt"></i>
                    <p>No transactions yet</p>
                    <span>Start investing to see your activity here</span>
                </div>
            `;
            return;
        }

        items.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        const statusColors = { pending: '#ffb347', approved: '#51cf66', rejected: '#ff6b6b' };
        const typeConfig = {
            deposit:    { icon: 'arrow-down', label: 'Deposit', amountColor: '#51cf66', sign: '+' },
            withdrawal: { icon: 'arrow-up', label: 'Withdrawal', amountColor: '#ff6b6b', sign: '-' },
            referral:   { icon: 'users', label: 'Referral Bonus', amountColor: '#00d4ff', sign: '+' },
            partner:    { icon: 'handshake', label: 'Partner Reward', amountColor: '#ffb347', sign: '+' }
        };

        listEl.innerHTML = items.map(item => {
            const date = item.createdAt ? item.createdAt.toDate().toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            const cfg = typeConfig[item.type];
            const color = statusColors[item.status] || '#8892b0';

            let label = cfg.label;
            if (item.type === 'referral' && item.level) label = `Referral Bonus (Level ${item.level})`;
            if (item.type === 'partner' && item.threshold) label = `Partner Reward (${item.threshold} invites)`;

            return `
                <div class="transaction-item">
                    <div class="transaction-item-left">
                        <span class="transaction-type">
                            <i class="fas fa-${cfg.icon}"></i>
                            ${label}
                        </span>
                        <span class="transaction-meta">${date}</span>
                        <span class="transaction-status" style="color:${color};">${item.status}</span>
                    </div>
                    <span class="transaction-amount" style="color:${cfg.amountColor};">${cfg.sign}₦${(item.amount || 0).toLocaleString()}</span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load transaction history:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.demo-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'demo-toast';
        
        const colors = {
            success: '#51cf66',
            error: '#ff6b6b',
            info: '#00d4ff'
        };

        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #1e2537;
            color: #e6f1ff;
            padding: 12px 24px;
            border-radius: 12px;
            border-left: 4px solid ${colors[type] || colors.success};
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            font-size: 14px;
            z-index: 9999;
            font-family: 'Segoe UI', sans-serif;
            animation: slideUp 0.3s ease;
            max-width: 90%;
            text-align: center;
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

    console.log('Wallet ready!');
});
