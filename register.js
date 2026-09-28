import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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
const form = document.getElementById('registerForm');
const firstName = document.getElementById('firstName');
const lastName = document.getElementById('lastName');
const middleName = document.getElementById('middleName');
const dob = document.getElementById('dob');
const email = document.getElementById('email');
const countryCode = document.getElementById('countryCode');
const phoneNumber = document.getElementById('phoneNumber');
const address1 = document.getElementById('address1');
const address2 = document.getElementById('address2');
const city = document.getElementById('city');
const state = document.getElementById('state');
const country = document.getElementById('country');
const password = document.getElementById('password');
const confirmPassword = document.getElementById('confirmPassword');
const termsCheck = document.getElementById('termsCheck');
const registerBtn = document.getElementById('registerBtn');
const toast = document.getElementById('toastMessage');
const toastText = document.getElementById('toastText');

// Generate unique referral code
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Get referral code from URL if user came from a referral link
function getReferralFromURL() {
	const params = new URLSearchParams(window.location.search);
	const urlRef = params.get('ref') || '';
	const inputRef = document.getElementById('referralCode')?.value?.trim() || '';
	return urlRef || inputRef;
}

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
        registerBtn.disabled = true;
        registerBtn.innerHTML = '<span class="spinner"></span> Creating account...';
    } else {
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<i class="fas fa-user-check"></i> Register';
    }
}

password.addEventListener('input', function() {
    const hint = this.parentElement.querySelector('.password-hint');
    if (this.value.length >= 6) {
        hint.innerHTML = '<i class="fas fa-check-circle" style="color:#51cf66;"></i> Strong enough';
    } else {
        hint.innerHTML = '<i class="fas fa-info-circle"></i> Min 6 characters';
    }
});

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    toast.classList.remove('show');
    
    const firstNameVal = firstName.value.trim();
    const lastNameVal = lastName.value.trim();
    const middleNameVal = middleName.value.trim();
    const dobVal = dob.value;
    const emailVal = email.value.trim();
    const countryCodeVal = countryCode.value;
    const phoneNumberVal = phoneNumber.value.trim();
    const address1Val = address1.value.trim();
    const address2Val = address2.value.trim();
    const cityVal = city.value.trim();
    const stateVal = state.value.trim();
    const countryVal = country.value;
    const passwordVal = password.value;
    const confirmVal = confirmPassword.value;
    const referredBy = getReferralFromURL();
    
    if (!firstNameVal) {
        showToast('Please enter your first name.', 'error');
        firstName.focus();
        return;
    }
    if (!lastNameVal) {
        showToast('Please enter your last name.', 'error');
        lastName.focus();
        return;
    }
    if (!dobVal) {
        showToast('Please enter your date of birth.', 'error');
        dob.focus();
        return;
    }
    if (!emailVal || !emailVal.includes('@')) {
        showToast('Please enter a valid email address.', 'error');
        email.focus();
        return;
    }
    if (!phoneNumberVal) {
        showToast('Please enter your phone number.', 'error');
        phoneNumber.focus();
        return;
    }
    if (!address1Val || !cityVal || !stateVal || !countryVal) {
        showToast('Please complete your address.', 'error');
        return;
    }
    if (passwordVal.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        password.focus();
        return;
    }
    if (passwordVal !== confirmVal) {
        showToast('Passwords do not match.', 'error');
        confirmPassword.focus();
        return;
    }
    if (!termsCheck.checked) {
        showToast('Please accept the Terms & Conditions.', 'error');
        termsCheck.focus();
        return;
    }
    
    setLoading(true);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, emailVal, passwordVal);
        const user = userCredential.user;
        
        await updateProfile(user, {
            displayName: `${firstNameVal} ${lastNameVal}`
        });
        
        await sendEmailVerification(user);
        
        const referralCode = generateReferralCode();
        
        // Create user document with welcome bonus of ₦1500
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            firstName: firstNameVal,
            lastName: lastNameVal,
            middleName: middleNameVal || null,
            email: emailVal,
            dob: dobVal,
            phone: `${countryCodeVal} ${phoneNumberVal}`,
            address1: address1Val,
            address2: address2Val || null,
            city: cityVal,
            state: stateVal,
            country: countryVal,
            location: `${cityVal}, ${stateVal}, ${countryVal}`,
            balance: 1500,
            welcomeBonus: 1500,
            totalEarned: 0,
            dailyEarnings: 0,
            lastClaimed: null,
            activePlan: 'none',
            planStartDate: null,
            referralCode: referralCode,
            referredBy: referredBy,
            isAdmin: false,
            kycStatus: 'not_submitted',
            createdAt: serverTimestamp(),
            emailVerified: false,
            role: 'user'
        });
        
        // Credit referrer if user came from a referral link
        if (referredBy) {
            try {
                // Find referrer by their referral code
                const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js");
                const q = query(collection(db, 'users'), where('referralCode', '==', referredBy));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const referrerDoc = snap.docs[0];
                    const referrerData = referrerDoc.data();
                    const level1Bonus = Math.floor(1500 * 0.30); // 30% of welcome bonus
                    await updateDoc(doc(db, 'users', referrerDoc.id), {
                        balance: increment(level1Bonus),
                        totalEarned: increment(level1Bonus)
                    });
                }
            } catch (refError) {
                console.error('Referral credit error:', refError);
            }
        }
        
        showToast(`✅ Welcome ${firstNameVal}! You got ₦1,500 welcome bonus!`, 'success');
        
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Registration failed.';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please login.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password too weak (min 6 chars).';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Network error. Check your internet.';
        } else {
            errorMessage = error.message;
        }
        showToast(`❌ ${errorMessage}`, 'error');
    } finally {
        setLoading(false);
    }
});

console.log('Register ready!');