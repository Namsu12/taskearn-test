// ========================================
// WITHDRAW - COMPLETE JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, increment, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
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

let currentUser = null;
let savedBankDetails = null; // users/{uid}.bankDetails — set once, locked after (see rules)
let hasPurchasedPlan = false; // must have at least one investment before withdrawing

// AUTH GUARD — redirect to login if nobody is signed in, otherwise show their info
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    const blocked = await enforceAccountGuard(db, auth, user.uid);
    if (blocked) return;
    
    currentUser = user;
    const displayName = user.displayName || 'Task Earn User';
    const avatarImg = document.getElementById('userAvatarImg');
    if (avatarImg) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=00d4ff&color=fff&size=36`;
        avatarImg.alt = displayName;
        avatarImg.title = displayName;
    }

    const balanceEl = document.getElementById('withdrawBalanceAmount');
    const hintEl = document.getElementById('withdrawAvailableHint');
    try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const balance = userSnap.exists() ? (userSnap.data().balance || 0) : 0;
        savedBankDetails = userSnap.exists() ? (userSnap.data().bankDetails || null) : null;
        if (balanceEl) {
            balanceEl.textContent = balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (hintEl) {
            hintEl.textContent = balance.toLocaleString('en-US', { maximumFractionDigits: 0 });
        }
        applyBankLockState();

        const investmentsSnap = await getDocs(collection(db, 'users', user.uid, 'investments'));
        hasPurchasedPlan = !investmentsSnap.empty;
    } catch (error) {
        console.error('❌ Failed to load balance:', error);
    }

    loadRecentWithdrawals(user.uid);
});

// ---------- PERMANENT BANK DETAILS ----------
// Once a user has withdrawn to a bank account, that account is locked in —
// the fields pre-fill and become read-only. Changing it requires contacting
// support (only admin can update users/{uid}.bankDetails after it's set —
// enforced in firestore.rules, not just this UI check).
function applyBankLockState() {
    if (!savedBankDetails) return;
    const holderEl = document.getElementById('accountHolder');
    const bankEl = document.getElementById('bankName');
    const numberEl = document.getElementById('accountNumber');
    const bankDetailsBox = document.getElementById('bankDetails');
    if (!holderEl || !bankEl || !numberEl || !bankDetailsBox) return;

    holderEl.value = savedBankDetails.accountHolder || '';
    bankEl.value = savedBankDetails.bankName || '';
    numberEl.value = savedBankDetails.accountNumber || '';
    [holderEl, bankEl, numberEl].forEach((el) => { el.disabled = true; });

    if (!bankDetailsBox.querySelector('.bank-locked-notice')) {
        const notice = document.createElement('p');
        notice.className = 'bank-locked-notice';
        notice.innerHTML = `<i class="fas fa-lock"></i> Your bank account is locked in. Contact support to change it.`;
        bankDetailsBox.appendChild(notice);
    }
}

// ---------- LOAD RECENT WITHDRAWALS ----------
async function loadRecentWithdrawals(uid) {
    const listEl = document.getElementById('recentWithdrawalsList');
    if (!listEl) return;

    try {
        const q = query(collection(db, 'withdrawals'), where('uid', '==', uid), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);

        if (snap.empty) {
            listEl.innerHTML = `
                <div class="recent-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No withdrawals yet</p>
                    <span>Your withdrawal history will appear here</span>
                </div>
            `;
            return;
        }

        const statusColors = { pending: '#ffb347', approved: '#51cf66', rejected: '#ff6b6b' };

        listEl.innerHTML = snap.docs.map(d => {
            const w = d.data();
            const date = w.createdAt ? w.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            const color = statusColors[w.status] || '#8892b0';
            return `
                <div class="recent-item">
                    <div class="recent-item-left">
                        <span class="recent-amount">₦${(w.amount || 0).toLocaleString()}</span>
                        <span class="recent-meta">${(w.method || '').toUpperCase()} · ${date}</span>
                    </div>
                    <span class="recent-status" style="color:${color}; border-color:${color};">${w.status}</span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('❌ Failed to load recent withdrawals:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {

    // ---------- DOM REFS ----------
    const submitBtn = document.getElementById('submitWithdrawBtn');
    const amountInput = document.getElementById('amountInput');

    const methodBtns = document.querySelectorAll('.method-btn');
    const bankDetails = document.getElementById('bankDetails');
    const cryptoDetails = document.getElementById('cryptoDetails');
    const mobileDetails = document.getElementById('mobileDetails');
    const quickBtns = document.querySelectorAll('.quick-btn');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    // ---------- METHOD SELECTION ----------
    methodBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            methodBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const method = this.dataset.method;
            bankDetails.classList.add('hidden');
            cryptoDetails.classList.add('hidden');
            mobileDetails.classList.add('hidden');

            if (method === 'bank') bankDetails.classList.remove('hidden');
            else if (method === 'crypto') cryptoDetails.classList.remove('hidden');
            else if (method === 'mobile') mobileDetails.classList.remove('hidden');
        });
    });

    // ---------- QUICK AMOUNTS ----------
    quickBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            amountInput.value = this.dataset.amount;
            amountInput.focus();
            validateAmount();
        });
    });

    // ---------- AMOUNT VALIDATION ----------
    function validateAmount() {
        const val = parseFloat(amountInput.value);
        const liveBalance = parseFloat((document.getElementById('withdrawBalanceAmount').textContent || '0').replace(/,/g, '')) || 0;
        if ((val < 50 && val > 0) || val > liveBalance) {
            amountInput.style.borderColor = '#ff6b6b';
            return false;
        } else if (val > 0) {
            amountInput.style.borderColor = '#51cf66';
            return true;
        }
        amountInput.style.borderColor = '#2a3247';
        return false;
    }

    amountInput.addEventListener('input', validateAmount);

    // ---------- SUBMIT WITHDRAWAL ----------
    submitBtn.addEventListener('click', async function() {
        const amount = parseFloat(amountInput.value);
        const activeMethod = document.querySelector('.method-btn.active');

        if (!currentUser) {
            showToast('❌ Please log in first.', 'error');
            return;
        }

        if (!hasPurchasedPlan) {
            showToast('⚠️ You need to purchase a plan before you can withdraw.', 'error');
            return;
        }

        if (!activeMethod) {
            showToast('⚠️ Please select a withdrawal method', 'error');
            return;
        }

        if (!amount || amount < 50) {
            showToast('⚠️ Minimum withdrawal is ₦2000', 'error');
            amountInput.focus();
            return;
        }

        const method = activeMethod.dataset.method;
        let validationPassed = false;
        let destination = {};

        if (method === 'bank') {
            const holder = document.getElementById('accountHolder').value.trim();
            const bank = document.getElementById('bankName').value.trim();
            const account = document.getElementById('accountNumber').value.trim();
            if (!holder || !bank || !account) {
                showToast('⚠️ Please fill all bank details', 'error');
                return;
            }
            if (account.length < 8) {
                showToast('⚠️ Invalid account number', 'error');
                return;
            }
            destination = { accountHolder: holder, bankName: bank, accountNumber: account };
            validationPassed = true;
        } else if (method === 'crypto') {
            const address = document.getElementById('walletAddress').value.trim();
            const currency = document.getElementById('cryptoSelect').value;
            if (!address || address.length < 20) {
                showToast('⚠️ Please enter a valid wallet address', 'error');
                return;
            }
            destination = { currency, walletAddress: address };
            validationPassed = true;
        } else if (method === 'mobile') {
            const phone = document.getElementById('mobileNumber').value.trim();
            const provider = document.getElementById('mobileProvider').value;
            if (!phone || phone.length < 10) {
                showToast('⚠️ Please enter a valid phone number', 'error');
                return;
            }
            if (!provider) {
                showToast('⚠️ Please select a provider', 'error');
                return;
            }
            destination = { phone, provider };
            validationPassed = true;
        }

        if (!validationPassed) return;

        this.disabled = true;
        this.innerHTML = '<span class="spinner"></span> Processing...';

        try {
            const userRef = doc(db, 'users', currentUser.uid);

            // Re-check against the live balance right before submitting — not a
            // cached number — and hold the funds immediately so the same balance
            // can't be withdrawn twice via two pending requests.
            const userSnap = await getDoc(userRef);
            const liveBalance = userSnap.exists() ? (userSnap.data().balance || 0) : 0;

            if (amount > liveBalance) {
                showToast(`⚠️ Insufficient balance! You have ₦${liveBalance.toFixed(2)}`, 'error');
                this.disabled = false;
                this.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Withdrawal';
                return;
            }

            await updateDoc(userRef, { balance: increment(-amount) });

            await addDoc(collection(db, 'withdrawals'), {
                uid: currentUser.uid,
                userName: currentUser.displayName || 'Task Earn User',
                userEmail: currentUser.email || '',
                amount,
                method,
                destination,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            // Lock in the bank account on its first-ever use.
            if (method === 'bank' && !savedBankDetails) {
                try {
                    await updateDoc(userRef, { bankDetails: { ...destination, setAt: serverTimestamp() } });
                    savedBankDetails = destination;
                } catch (err) {
                    console.error('Could not save bank details:', err);
                }
            }

            showToast(`✅ Withdrawal of ₦${amount.toFixed(2)} submitted for review!`);
            console.log(`💰 Withdrawal: ₦${amount} | Method: ${method}`);

            amountInput.value = '';

            // Refresh displayed balance and history now that funds are held
            const newBalance = liveBalance - amount;
            const balanceEl = document.getElementById('withdrawBalanceAmount');
            const hintEl = document.getElementById('withdrawAvailableHint');
            if (balanceEl) balanceEl.textContent = newBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (hintEl) hintEl.textContent = newBalance.toLocaleString('en-US', { maximumFractionDigits: 0 });
            loadRecentWithdrawals(currentUser.uid);

        } catch (error) {
            console.error('❌ Withdrawal submission failed:', error);
            showToast('❌ Could not submit withdrawal. Try again.', 'error');
        } finally {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Withdrawal';
        }
    });

    // ---------- TOAST ----------
    function showToast(message, type = 'success') {
        const icon = toast.querySelector('i');
        toast.className = 'toast show';
        toastMessage.textContent = message;

        const colors = {
            success: '#51cf66',
            error: '#ff6b6b',
            info: '#00d4ff'
        };

        toast.style.borderLeftColor = colors[type] || colors.success;
        icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        icon.style.color = colors[type] || colors.success;

        clearTimeout(window.toastTimeout);
        window.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    console.log('🚀 Task Earn Withdraw ready!');
});