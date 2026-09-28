// ========================================
// PROFILE - COMPLETE JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
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

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Fetch the profile doc and investments at the same time instead of
        // one after the other — cuts the page's load time roughly in half,
        // especially noticeable on slower mobile connections.
        const blocked = await enforceAccountGuard(db, auth, user.uid);
        if (blocked) return;
        const [docSnap, investmentsSnap] = await Promise.all([
            getDoc(doc(db, 'users', user.uid)),
            getDocs(collection(db, 'users', user.uid, 'investments'))
        ]);

        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('displayName').textContent = data.firstName + ' ' + data.lastName;
            document.getElementById('displayEmail').textContent = data.email;
            document.getElementById('profileFullName').textContent = data.firstName + ' ' + data.lastName;
            document.getElementById('profileEmail').textContent = data.email;
            document.getElementById('profileDob').textContent = data.dob || 'Not set';
            document.getElementById('profilePhone').textContent = data.phone || 'Not set';
            document.getElementById('profileLocation').textContent = data.location || 'Not set';

            const memberSinceEl = document.getElementById('memberSinceText');
            if (memberSinceEl && data.createdAt) {
                memberSinceEl.textContent = `Member since ${data.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
            } else if (memberSinceEl) {
                memberSinceEl.textContent = 'Member';
            }

            if (data.isAdmin === true) {
                const adminLink = document.getElementById('adminPanelLink');
                if (adminLink) adminLink.style.display = 'flex';
            }
        } else {
            // No Firestore document for this account (e.g. it was created directly
            // in Firebase Auth without going through register.js). Fall back to
            // whatever Auth itself knows instead of leaving the static placeholder text.
            const fallbackName = user.displayName || 'Task Earn User';
            const fallbackEmail = user.email || 'user@taskearn.com';
            document.getElementById('displayName').textContent = fallbackName;
            document.getElementById('displayEmail').textContent = fallbackEmail;
            document.getElementById('profileFullName').textContent = fallbackName;
            document.getElementById('profileEmail').textContent = fallbackEmail;
        }

        // ---------- INVESTMENT STATS (same real data as the dashboard) ----------
        try {
            const investments = investmentsSnap.docs.map(d => d.data());

            const totalInvested = investments.reduce((sum, inv) => sum + (inv.amountInvested || 0), 0);
            const totalProfit = investments.reduce((sum, inv) => sum + (inv.profit || 0), 0);
            const activePlans = investments.filter(inv => inv.status === 'running').length;

            document.getElementById('statTotalInvested').textContent = totalInvested.toLocaleString('en-US', { maximumFractionDigits: 0 });
            document.getElementById('statTotalProfit').textContent = totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            document.getElementById('statActivePlans').textContent = activePlans;
        } catch (error) {
            console.error('❌ Failed to load investment stats:', error);
        }
    } else {
        window.location.href = 'login.html';
    }
    if (!user) { window.location.href = "login.html"; return; }
  initNotificationBell(db, user.uid);
});

document.addEventListener('DOMContentLoaded', function() {

    // ---------- EDIT AVATAR ----------
    document.getElementById('editAvatarBtn')?.addEventListener('click', function() {
        showToast('📸 Avatar upload coming soon!', 'info');
    });

    // ---------- NOTIFICATIONS ----------
    //document.getElementById('notificationBtn')?.addEventListener('click', function() {
        //showToast('🔔 No new notifications', 'info');
    //});

    // ---------- TOAST ----------
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
            top: 70px;
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
            animation: slideDown 0.3s ease;
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

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);

    console.log('🚀 Task Earn Profile ready!');
});