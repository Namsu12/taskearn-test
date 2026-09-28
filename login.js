import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

// DOM Elements
const form = document.getElementById('loginForm');
const email = document.getElementById('email');
const password = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const togglePassword = document.getElementById('togglePassword');
const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');

// Toggle password visibility
togglePassword.addEventListener('click', function() {
    const type = password.getAttribute('type') === 'password' ? 'text' : 'password';
    password.setAttribute('type', type);
    this.querySelector('i').className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
});

// Remember Me
const savedEmail = localStorage.getItem('taskearn_remember_email');
if (savedEmail) {
    email.value = savedEmail;
    document.getElementById('rememberMe').checked = true;
}

// Forgot Password now lives on its own page (forgot-password.html) —
// see the plain <a href="forgot-password.html"> link in login.html.

function showToast(message, type = 'success') {
    toast.className = 'toast-message show';
    toast.classList.remove('error', 'success');
    if (type === 'error') {
        toast.classList.add('error');
        toast.querySelector('i').className = 'fas fa-exclamation-circle';
    } else {
        toast.classList.add('success');
        toast.querySelector('i').className = 'fas fa-check-circle';
    }
    toastText.textContent = message;
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

function setLoading(isLoading) {
    if (isLoading) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner"></span> Logging in...';
    } else {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
    }
}

// LOGIN FORM SUBMIT
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    toast.classList.remove('show');
    
    const emailVal = email.value.trim();
    const passVal = password.value;
    
    if (!emailVal || !passVal) {
        showToast('Please fill in all fields.', 'error');
        return;
    }
    
    setLoading(true);
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, emailVal, passVal);
        const user = userCredential.user;

        // Block suspended accounts right here — don't let them reach the dashboard at all.
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists() && userSnap.data().suspended === true) {
            await signOut(auth);
            showToast('❌ This account has been suspended. Contact support.', 'error');
            setLoading(false);
            return;
        }

        if (document.getElementById('rememberMe').checked) {
            localStorage.setItem('taskearn_remember_email', emailVal);
        } else {
            localStorage.removeItem('taskearn_remember_email');
        }
        
        showToast(`✅ Welcome back, ${user.displayName || 'User'}!`, 'success');
        console.log('✅ User logged in:', user.uid);
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        console.error('Login error:', error.code); // Only you see this
        
        let userMessage = 'Wrong email or password.';
        if (error.code === 'auth/too-many-requests') {
            userMessage = 'Too many failed attempts. Please try again later.';
        } else if (error.code === 'auth/user-disabled') {
            userMessage = 'This account has been disabled. Contact support.';
        } else if (error.code === 'auth/network-request-failed') {
            userMessage = 'Network error. Check your connection.';
        }
        
        showToast(`❌ ${userMessage}`, 'error');
    } finally {
        setLoading(false);
    }
});

console.log('🚀 taskearn Login ready!');