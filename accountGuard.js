// ========================================
// ACCOUNT GUARD - standalone, reusable
// ========================================
// Enforces the `suspended` and `forceLogoutAt` flags an admin sets on
// users/{uid} from the admin dashboard. These are just Firestore fields —
// nothing checks them automatically, which is exactly why Suspend/Log Out
// User weren't actually doing anything before this file existed.
//
// Usage (inside any page's own onAuthStateChanged, right after confirming
// a user is signed in, BEFORE loading any page data):
//
//   import { enforceAccountGuard } from "./accountGuard.js";
//
//   onAuthStateChanged(auth, async (user) => {
//     if (!user) { window.location.href = "login.html"; return; }
//     const blocked = await enforceAccountGuard(db, auth, user.uid);
//     if (blocked) return; // already signed out + redirected, stop here
//     // ...rest of your existing page logic
//   });
//
// This does two things:
// 1. An immediate one-time check (awaited) — blocks page data from loading
//    at all if the account is already suspended/flagged when the page opens.
// 2. A live watch for the rest of the session — so if an admin suspends or
//    force-logs-out this user while they already have the page open, it
//    takes effect immediately without needing a page reload.

import { signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot, deleteField } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

export async function enforceAccountGuard(db, auth, uid) {
  const ref = doc(db, "users", uid);

  // Immediate check before the caller proceeds.
  const snap = await getDoc(ref);
  const blockedNow = await handleAccountSnapshot(db, auth, uid, snap);
  if (blockedNow) return true;

  // Live watch for the rest of the session.
  onSnapshot(ref, (liveSnap) => {
    handleAccountSnapshot(db, auth, uid, liveSnap);
  });

  return false;
}

async function handleAccountSnapshot(db, auth, uid, snap) {
  if (!snap.exists()) return false;
  const data = snap.data();

  if (data.suspended === true) {
    alert("Your account has been suspended. Contact support for assistance.");
    await signOut(auth);
    window.location.href = "login.html";
    return true;
  }

  if (data.forceLogoutAt) {
    // Clear the flag first (while still authenticated) so this only
    // triggers once, not on every future login.
    try {
      await updateDoc(doc(db, "users", uid), { forceLogoutAt: deleteField() });
    } catch (err) {
      console.error("Could not clear forceLogoutAt:", err);
    }
    await signOut(auth);
    window.location.href = "login.html";
    return true;
  }

  return false;
}
