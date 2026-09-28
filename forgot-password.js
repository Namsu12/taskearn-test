// ========================================
// FORGOT PASSWORD - JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

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

const form = document.getElementById('resetForm');
const emailInput = document.getElementById('email');
const resetBtn = document.getElementById('resetBtn');
const resetNote = document.getElementById('resetNote');
const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');

function showToast(message, type = 'success') {
    toast.className = 'toast-message show';
    toast.classList.remove('error');
    if (type === 'error') toast.classList.add('error');
    toastText.textContent = message;
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => toast.classList.remove('show'), 5000);
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailVal = emailInput.value.trim();
    if (!emailVal || !emailVal.includes('@')) {
        showToast('⚠️ Please enter a valid email address.', 'error');
        emailInput.focus();
        return;
    }

    resetBtn.disabled = true;
    resetBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
        await sendPasswordResetEmail(auth, emailVal);
        showToast('✅ Reset link sent — check your inbox!');
        resetNote.style.display = 'flex';
        form.style.display = 'none';
    } catch (error) {
        console.error('❌ Password reset error:', error.code);
        // Deliberately vague for auth/user-not-found — confirming which
        // emails have accounts is a privacy leak, so we show the same
        // success message either way, matching how most real platforms do it.
        if (error.code === 'auth/user-not-found') {
            showToast('✅ If that email exists, a reset link is on its way.');
            resetNote.style.display = 'flex';
            form.style.display = 'none';
        } else if (error.code === 'auth/invalid-email') {
            showToast('❌ That email address looks invalid.', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            showToast('❌ Too many attempts. Please wait and try again.', 'error');
        } else {
            showToast('❌ Could not send reset link. Try again.', 'error');
        }
    } finally {
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
    }
});

console.log('🚀 Task Earn Forgot Password ready!');
