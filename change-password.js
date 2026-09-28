// ========================================
// CHANGE PASSWORD - JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

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

// DOM refs
const form = document.getElementById('changePasswordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
const saveBtn = document.getElementById('savePasswordBtn');
const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');
const avatarImg = document.getElementById('userAvatarImg');

let userEmail = '';

// ---------- TOAST ----------
function showToast(message, type = 'success') {
    toast.className = 'toast-message show';
    toast.classList.remove('error');
    if (type === 'error') toast.classList.add('error');
    toastText.textContent = message;
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// ---------- PASSWORD VISIBILITY TOGGLES ----------
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', function () {
        const input = document.getElementById(this.dataset.target);
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        this.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
});

// ---------- AUTH GUARD ----------
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    userEmail = user.email;
    if (avatarImg) {
        const name = user.displayName || 'Task Earn User';
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00d4ff&color=fff&size=36`;
        avatarImg.alt = name;
    }
});

// ---------- SUBMIT ----------
form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const currentPasswordVal = currentPasswordInput.value;
    const newPasswordVal = newPasswordInput.value;
    const confirmVal = confirmNewPasswordInput.value;

    if (!currentPasswordVal) {
        showToast('⚠️ Enter your current password.', 'error');
        currentPasswordInput.focus();
        return;
    }
    if (newPasswordVal.length < 6) {
        showToast('⚠️ New password must be at least 6 characters.', 'error');
        newPasswordInput.focus();
        return;
    }
    if (newPasswordVal !== confirmVal) {
        showToast('⚠️ New passwords do not match.', 'error');
        confirmNewPasswordInput.focus();
        return;
    }
    if (newPasswordVal === currentPasswordVal) {
        showToast('⚠️ New password must be different from the current one.', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Updating...';

    try {
        const user = auth.currentUser;
        const credential = EmailAuthProvider.credential(userEmail, currentPasswordVal);

        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPasswordVal);

        showToast('✅ Password updated! Please log in again.');

        // Force a fresh login with the new password, for security.
        setTimeout(async () => {
            await signOut(auth);
            window.location.href = 'login.html';
        }, 1800);

    } catch (error) {
        console.error('❌ Failed to update password:', error);
        let message = 'Could not update password. Try again.';
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = 'Current password is incorrect.';
        } else if (error.code === 'auth/requires-recent-login') {
            message = 'Please log out and back in, then try again.';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password too weak (min 6 characters).';
        } else if (error.code === 'auth/network-request-failed') {
            message = 'Network error. Check your connection.';
        } else if (error.code === 'auth/too-many-requests') {
            message = 'Too many attempts. Please wait and try again.';
        }
        showToast(`❌ ${message}`, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Update Password';
    }
});

console.log('🚀 Task Earn Change Password ready!');
