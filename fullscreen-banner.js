// ========================================
// FULL-SCREEN BANNER - JAVASCRIPT
// ========================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfKvla4_5nt-XZcdNe0reZTjOvMF7yAfw",
  authDomain: "taskearn0012.firebaseapp.com",
  databaseURL: "https://taskearn0012-default-rtdb.firebaseio.com",
  projectId: "taskearn0012",
  storageBucket: "taskearn0012.firebasestorage.app",
  messagingSenderId: "269601831416",
  appId: "1:269601831416:web:82afe671b90d1549e7fe0d"
};

// Other scripts on this page likely already initialized the same app —
// reuse that instance instead of throwing an "already exists" error.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const overlay = document.getElementById('fullscreenBannerOverlay');
const titleEl = document.getElementById('fullscreenBannerTitle');
const messageEl = document.getElementById('fullscreenBannerMessage');
const ctaEl = document.getElementById('fullscreenBannerCta');
const closeBtn = document.getElementById('fullscreenBannerClose');

closeBtn?.addEventListener('click', () => {
    overlay.classList.remove('active');
});

// This is independent of the top strip banner (welcome-banner.js) — either,
// both, or neither can be on at the same time, controlled separately in admin.
onAuthStateChanged(auth, async (user) => {
    if (!user || !overlay) return;

    try {
        const snap = await getDoc(doc(db, 'settings', 'fullScreenBanner'));
        if (!snap.exists()) return;

        const data = snap.data();
        if (!data.enabled || !data.message) return;

        titleEl.textContent = data.title || '';
        messageEl.textContent = data.message;

        if (data.buttonEnabled && data.buttonText && data.buttonLink) {
            ctaEl.textContent = data.buttonText;
            ctaEl.href = data.buttonLink;
            ctaEl.style.display = 'inline-block';
        } else {
            ctaEl.style.display = 'none';
        }

        overlay.classList.add('active');
    } catch (error) {
        console.error('❌ Could not load full-screen banner:', error);
    }
});
