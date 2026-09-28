// ========================================
// PARTNER REWARDS - COMPLETE WITH FIREBASE
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, getDocs,
  onSnapshot, runTransaction, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { uiAlert } from "./ui.js";

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

let currentUid = null;
let validCount = 0;
let tiers = [];
let claimedThresholds = new Set();

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUid = user.uid;

  listenToUserCount(currentUid);
  await loadClaims(currentUid);
  listenToTiers();
});

function listenToUserCount(uid) {
  onSnapshot(doc(db, "users", uid), (snap) => {
    validCount = snap.exists() ? (snap.data().validReferralCount || 0) : 0;
    document.getElementById("validCountDisplay").textContent = validCount;
    renderTiers();
  });
}

async function loadClaims(uid) {
  const snap = await getDocs(collection(db, "users", uid, "partnerClaims"));
  claimedThresholds = new Set(snap.docs.map((d) => Number(d.id)));
}

function listenToTiers() {
  onSnapshot(doc(db, "settings", "partnerTiers"), (snap) => {
    tiers = snap.exists() ? (snap.data().tiers || []) : [];
    renderTiers();
  });
}

function renderTiers() {
  const listEl = document.getElementById("tierList");
  if (!tiers.length) {
    listEl.innerHTML = `<div class="empty-state">No partner rewards set up yet. Check back soon.</div>`;
    return;
  }

  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  listEl.innerHTML = "";
  sorted.forEach((tier) => listEl.appendChild(renderTierCard(tier)));
}

function renderTierCard(tier) {
  const claimed = claimedThresholds.has(tier.threshold);
  const eligible = validCount >= tier.threshold;
  const progressPct = Math.min(100, (validCount / tier.threshold) * 100);

  const card = document.createElement("div");
  card.className = "tier-card";

  let buttonHtml;
  if (claimed) {
    buttonHtml = `<button class="btn-obtain claimed" disabled><i class="fas fa-check"></i> Claimed</button>`;
  } else if (eligible) {
    buttonHtml = `<button class="btn-obtain ready" data-threshold="${tier.threshold}">Obtain</button>`;
  } else {
    buttonHtml = `<button class="btn-obtain locked" disabled>Obtain</button>`;
  }

  card.innerHTML = `
    <div class="tier-icon"><i class="fas fa-award"></i></div>
    <div class="tier-body">
      <div class="tier-title">Team task ${tier.threshold}-person bonus</div>
      <div class="tier-row"><span>Invite Member</span><strong>${Math.min(validCount, tier.threshold)} / ${tier.threshold}</strong></div>
      <div class="tier-row"><span>Reward Amount</span><strong class="tier-reward">₦${(tier.reward || 0).toLocaleString()}</strong></div>
      <div class="tier-progress-track"><div class="tier-progress-fill" style="width:${progressPct}%;"></div></div>
      ${buttonHtml}
    </div>
  `;

  const btn = card.querySelector("button[data-threshold]");
  if (btn) btn.addEventListener("click", () => claimTier(tier));

  return card;
}

async function claimTier(tier) {
  try {
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", currentUid);
      const claimRef = doc(db, "users", currentUid, "partnerClaims", String(tier.threshold));
      const [userSnap, claimSnap] = await Promise.all([tx.get(userRef), tx.get(claimRef)]);

      if (claimSnap.exists()) throw new Error("Already claimed.");
      const liveCount = userSnap.data()?.validReferralCount || 0;
      if (liveCount < tier.threshold) throw new Error("Not eligible yet.");

      tx.set(claimRef, {
        threshold: tier.threshold,
        reward: tier.reward,
        claimedAt: serverTimestamp()
      });
      tx.update(userRef, { balance: increment(tier.reward), totalPartnerEarned: increment(tier.reward) });
    });

    claimedThresholds.add(tier.threshold);
    renderTiers();
  } catch (err) {
    console.error("Claim error:", err);
    await uiAlert({
      title: "Couldn't Claim",
      message: err.message || 'Please try again.',
      type: 'danger'
    });
  }
}