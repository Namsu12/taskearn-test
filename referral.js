// ========================================
// REFERRAL - COMPLETE JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

let userReferralCode = '';
let referralLink = '';

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }

    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) return;

        const userData = snap.data();
        userReferralCode = userData.referralCode || '';

        // Build referral link
        const domain = window.location.origin;
        referralLink = `${domain}/register.html?ref=${userReferralCode}`;
        document.getElementById('referralLink').textContent = referralLink;

        // Load referrals
        loadReferrals(userReferralCode, userData.referralEarnings || 0);

    } catch (err) {
        console.error('Referral load error:', err);
    }
});

// ---------- LOAD REFERRALS ----------
async function loadReferrals(code, totalEarnings) {
    const listEl = document.getElementById('referralsList');

    try {
        // Find all users referred by this code (level 1)
        const level1Snap = await getDocs(query(
            collection(db, 'users'),
            where('referredBy', '==', code)
        ));

        const totalReferrals = level1Snap.size;
        document.getElementById('totalReferrals').textContent = totalReferrals;
        document.getElementById('totalEarned').textContent = `₦${(totalEarnings || 0).toLocaleString()}`;

        if (level1Snap.empty) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <p>No referrals yet</p>
                    <span>Share your link to start earning</span>
                </div>`;
            return;
        }

        const items = level1Snap.docs.map(d => ({
            ...d.data(),
            level: 1
        }));

        listEl.innerHTML = items.map(ref => {
            const date = ref.createdAt ? ref.createdAt.toDate().toLocaleDateString('en-NG', {
                day: 'numeric', month: 'short', year: 'numeric'
            }) : '';
            return `
                <div class="referral-item">
                    <div class="referral-avatar"><i class="fas fa-user"></i></div>
                    <div class="referral-info">
                        <div class="referral-name">${ref.firstName || ''} ${ref.lastName || ''}</div>
                        <div class="referral-date">Joined ${date}</div>
                    </div>
                    <span class="referral-level level-${ref.level}">Level ${ref.level}</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Load referrals error:', err);
    }
}

// ---------- COPY LINK ----------
window.copyLink = function() {
    navigator.clipboard.writeText(referralLink).then(() => {
        showToast('✅ Link copied!');
        const btn = document.getElementById('copyBtn');
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => btn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
    }).catch(() => {
        showToast('Copy failed — do it manually');
    });
};

// ---------- SHARE WHATSAPP ----------
window.shareWhatsApp = function() {
    const msg = encodeURIComponent(
        `💰 Join Task Earn and start earning daily!\n\nUse my referral link to sign up and get ₦1,500 welcome bonus:\n${referralLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
};

// ---------- SHARE GENERAL ----------
window.shareLink = function() {
    if (navigator.share) {
        navigator.share({
            title: 'Join Task Earn',
            text: 'Sign up and get ₦1,500 welcome bonus!',
            url: referralLink
        });
    } else {
        copyLink();
    }
};

// ---------- TOAST ----------
function showToast(message) {
    let toast = document.querySelector('.ref-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'ref-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

console.log('Referral ready!');
