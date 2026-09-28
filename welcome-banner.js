// ========================================
// WELCOME BANNER - JAVASCRIPT
// Rotating message stack, no close button —
// content and on/off are both controlled from admin.
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

const banner = document.getElementById('welcomeBanner');
const textEl = document.getElementById('welcomeBannerText');

const ROTATE_INTERVAL_MS = 5000;
const SLIDE_DURATION_MS = 350;

let messages = [];
let currentIndex = 0;
let rotateTimer = null;

function showMessage(index) {
    textEl.textContent = messages[index];
    textEl.classList.remove('slide-out');
    textEl.classList.add('slide-in');
}

function rotate() {
    if (messages.length < 2) return;
    textEl.classList.remove('slide-in');
    textEl.classList.add('slide-out');
    setTimeout(() => {
        currentIndex = (currentIndex + 1) % messages.length;
        showMessage(currentIndex);
    }, SLIDE_DURATION_MS);
}

function startBanner(msgs) {
    messages = msgs;
    currentIndex = 0;
    textEl.textContent = messages[0];
    banner.style.display = 'flex';

    if (rotateTimer) clearInterval(rotateTimer);
    if (messages.length > 1) {
        rotateTimer = setInterval(rotate, ROTATE_INTERVAL_MS);
    }
}

// No redirect-to-login here on purpose — dashboard.js already guards this
// whole page, so by the time this matters the user is signed in.
onAuthStateChanged(auth, async (user) => {
    if (!user || !banner) return;

    try {
        const snap = await getDoc(doc(db, 'settings', 'welcomeBanner'));
        if (!snap.exists()) return;

        const data = snap.data();
        const msgs = (data.messages || []).map(m => m.text).filter(Boolean);
        if (!data.enabled || msgs.length === 0) return;

        startBanner(msgs);
    } catch (error) {
        console.error('❌ Could not load welcome banner:', error);
    }
});

// ========================================
// RECHARGE ACTIVITY TICKER
// A separate, independent widget — its own element below the quick-action
// tiles, own rotation, own animation. Lives in this same file (rather than
// its own script) purely so there's nothing to load-order/race against;
// it has no Firestore work to do, so it just starts immediately.
// ========================================
const PHONE_PREFIXES = ["080", "081", "070", "071", "090", "091"];

function randomPhone() {
    const prefix = PHONE_PREFIXES[Math.floor(Math.random() * PHONE_PREFIXES.length)];
    let number = "";
    for (let i = 0; i < 8; i++) number += Math.floor(Math.random() * 10);
    return prefix[0] + prefix[1] + "****" + number.slice(-4);
}

function randomAmount(min = 2500, max = 1000000) {
    const step = 500;
    const minStep = Math.ceil(min / step);
    const maxStep = Math.floor(max / step);
    const randomStep = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;
    return randomStep * step;
}

function getTime() {
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function generateRechargeActivity() {
    const textEl = document.getElementById("rechargeActivityText");
    if (!textEl) return;

    const newText = `${randomPhone()} ${getTime()} recharge ₦${randomAmount().toLocaleString()} success`;

    // Retrigger the swipe-up animation on every change: remove the class,
    // force a reflow so the browser "forgets" it just ran, then re-add it.
    textEl.classList.remove("swipe");
    void textEl.offsetWidth;
    textEl.textContent = newText;
    textEl.classList.add("swipe");
}

generateRechargeActivity();
setInterval(generateRechargeActivity, 2000);
