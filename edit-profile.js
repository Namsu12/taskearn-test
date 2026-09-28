// ========================================
// EDIT PROFILE - JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    updateProfile,
    updateEmail,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

// DOM refs
const form = document.getElementById('editProfileForm');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const emailInput = document.getElementById('email');
const dobInput = document.getElementById('dob');
const phoneInput = document.getElementById('phone');
const locationInput = document.getElementById('location');
const currentPasswordGroup = document.getElementById('currentPasswordGroup');
const currentPasswordInput = document.getElementById('currentPassword');
const saveBtn = document.getElementById('saveBtn');
const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');
const avatarImg = document.getElementById('userAvatarImg');

let originalEmail = '';

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

// ---------- SHOW/HIDE CURRENT PASSWORD FIELD ----------
// Only needed when the person actually changes their email address.
emailInput.addEventListener('input', () => {
    const changed = emailInput.value.trim() !== originalEmail;
    currentPasswordGroup.style.display = changed ? 'block' : 'none';
    if (!changed) currentPasswordInput.value = '';
});

// ---------- AUTH GUARD + PREFILL ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    if (avatarImg) {
        const name = user.displayName || 'Task Earn User';
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00d4ff&color=fff&size=36`;
        avatarImg.alt = name;
    }

    const docRef = doc(db, 'users', user.uid);
    const docSnap = await getDoc(docRef);

    let data = {};
    if (docSnap.exists()) {
        data = docSnap.data();
    }

    firstNameInput.value = data.firstName || '';
    lastNameInput.value = data.lastName || '';
    emailInput.value = data.email || user.email || '';
    dobInput.value = data.dob || '';
    phoneInput.value = data.phone || '';
    locationInput.value = data.location || '';
    originalEmail = emailInput.value.trim();

    // If the person arrived via a specific pencil icon (?field=phone, etc.),
    // focus that field so they land right where they meant to edit.
    const params = new URLSearchParams(window.location.search);
    const field = params.get('field');
    const focusMap = {
        full_name: firstNameInput,
        email: emailInput,
        dob: dobInput,
        phone: phoneInput,
        location: locationInput
    };
    const target = focusMap[field];
    if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

// ---------- SAVE ----------
form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const firstNameVal = firstNameInput.value.trim();
    const lastNameVal = lastNameInput.value.trim();
    const emailVal = emailInput.value.trim();
    const dobVal = dobInput.value;
    const phoneVal = phoneInput.value.trim();
    const locationVal = locationInput.value.trim();
    const emailChanged = emailVal !== originalEmail;

    if (!firstNameVal || !lastNameVal) {
        showToast('⚠️ First and last name are required.', 'error');
        return;
    }
    if (!emailVal || !emailVal.includes('@')) {
        showToast('⚠️ Please enter a valid email address.', 'error');
        emailInput.focus();
        return;
    }
    if (emailChanged && !currentPasswordInput.value) {
        showToast('⚠️ Enter your current password to change your email.', 'error');
        currentPasswordInput.focus();
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        const user = auth.currentUser;

        if (emailChanged) {
            const credential = EmailAuthProvider.credential(originalEmail, currentPasswordInput.value);
            await reauthenticateWithCredential(user, credential);
            await updateEmail(user, emailVal);
        }

        await updateProfile(user, {
            displayName: `${firstNameVal} ${lastNameVal}`
        });

        await setDoc(doc(db, 'users', user.uid), {
            firstName: firstNameVal,
            lastName: lastNameVal,
            email: emailVal,
            dob: dobVal,
            phone: phoneVal,
            location: locationVal
        }, { merge: true });

        showToast('✅ Profile updated!');
        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 1200);

    } catch (error) {
        console.error('❌ Failed to save profile:', error);
        let message = 'Could not save changes. Try again.';
        if (error.code === 'auth/wrong-password') message = 'Current password is incorrect.';
        else if (error.code === 'auth/requires-recent-login') message = 'Please log out and back in, then try again.';
        else if (error.code === 'auth/email-already-in-use') message = 'That email is already in use.';
        else if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
        else if (error.code === 'auth/network-request-failed') message = 'Network error. Check your connection.';
        showToast(`❌ ${message}`, 'error');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Save Changes';
    }
});

console.log('🚀 Task Earn Edit Profile ready!');
