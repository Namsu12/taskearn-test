// ========================================
// CRYPTO DEPOSIT - FIREBASE + EMAILJS + LIVE CONVERTER
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, collection, addDoc, query,
    where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCfKvla4_5nt-XZcdNe0reZTjOvMF7yAfw",
    authDomain: "taskearn0012.firebaseapp.com",
    projectId: "taskearn0012",
    storageBucket: "taskearn0012.firebasestorage.app",
    messagingSenderId: "269601831416",
    appId: "1:269601831416:web:86735b964a5ecf43e7fe0d"
};

// ---- EmailJS ----
const EMAILJS_PUBLIC_KEY  = "sZJx1zDOaHdxaZb4t";
const EMAILJS_SERVICE_ID  = "service_pg5ub9s";
const EMAILJS_TEMPLATE_ID = "template_9ddnknj";
if (window.emailjs) emailjs.init(EMAILJS_PUBLIC_KEY);

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUser = null;

// ---------- CRYPTO ADDRESSES ----------
const ADDRESSES = {
    btc: 'bc1qzq7my2tvek6tjdtslrgq5j4d32y70tuk6p4mpe',
    eth: '0xFE4B693545Fa560E8De83bEDCD011e496C706Cfd',
    usdt: {
        trc20: 'TBjSyDvpbGZva8iNgKDpoqGyNyiFVpqw36',
        erc20: '0xFE4B693545Fa560E8De83bEDCD011e496C706Cfd',
        bep20: '0xFE4B693545Fa560E8De83bEDCD011e496C706Cfd'
    }
};

let selectedCurrency = 'usdt';
let selectedNetwork  = 'trc20';

// ---------- RATES (loaded from Firestore, defaults fallback) ----------
let RATES = {
    usdToNgn:      1600,      // 1 USD = ₦1,600
    usdtUsd:       1.00,      // 1 USDT = $1.00
    btcUsd:        65000,     // 1 BTC = $65,000
    ethUsd:        3200,      // 1 ETH = $3,200
    minNaira:      3500,      // min deposit in naira
    maxNaira:      200000     // max deposit in naira
};

// ---------- DOM refs ----------
const networkGroup    = document.getElementById('networkGroup');
const addressDisplay  = document.getElementById('depositAddress');
const copyBtn         = document.getElementById('copyAddressBtn');
const submitBtn       = document.getElementById('submitDepositBtn');
const amountInput     = document.getElementById('amountInput');
const txidInput       = document.getElementById('txidInput');
const balanceEl       = document.getElementById('depositBalanceAmount');
const listEl          = document.getElementById('recentDepositsList');
const usdEquivalentEl = document.getElementById('usdEquivalent');
const cryptoEquivEl   = document.getElementById('cryptoEquivalent');
const rateDisplayEl   = document.getElementById('rateDisplay');
const converterCard   = document.getElementById('converterCard');
const minHintEl       = document.getElementById('minHint');
const maxHintEl       = document.getElementById('maxHint');

// ---------- Address update ----------
function updateAddress() {
    if (!addressDisplay) return;
    if (selectedCurrency === 'usdt') {
        if (networkGroup) networkGroup.style.display = 'block';
        addressDisplay.textContent = ADDRESSES.usdt[selectedNetwork];
    } else {
        if (networkGroup) networkGroup.style.display = 'none';
        addressDisplay.textContent = ADDRESSES[selectedCurrency];
    }
    updateConverter(); // crypto amount changes when coin changes
}

// ---------- Currency selection ----------
document.querySelectorAll('.currency-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedCurrency = this.dataset.currency;
        showToast(`✅ ${selectedCurrency.toUpperCase()} selected`, 'success');
        updateAddress();
    });
});

// ---------- Network selection ----------
document.querySelectorAll('.network-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        document.querySelectorAll('.network-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedNetwork = this.dataset.network;
        showToast(`✅ ${selectedNetwork.toUpperCase()} network selected`, 'success');
        updateAddress();
    });
});

// ---------- Copy address ----------
if (copyBtn) {
    copyBtn.addEventListener('click', function () {
        const address = addressDisplay.textContent.trim();
        const onCopied = () => {
            showToast('📋 Address copied to clipboard!', 'success');
            this.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                this.innerHTML = '<i class="fas fa-copy"></i> Copy Address';
            }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(address).then(onCopied).catch(() => {
                fallbackCopy(address); onCopied();
            });
        } else {
            fallbackCopy(address); onCopied();
        }
    });
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { console.error(e); }
    document.body.removeChild(ta);
}

// ---------- LIVE CONVERTER ----------
function getCryptoPriceUsd(currency) {
    if (currency === 'usdt') return RATES.usdtUsd;
    if (currency === 'btc')  return RATES.btcUsd;
    if (currency === 'eth')  return RATES.ethUsd;
    return 1;
}

function updateConverter() {
    const naira = parseFloat(amountInput.value) || 0;

    if (naira <= 0) {
        usdEquivalentEl.textContent    = '$0.00';
        cryptoEquivEl.textContent      = `0.00000000 ${selectedCurrency.toUpperCase()}`;
        converterCard.classList.remove('invalid');
        return;
    }

    // Naira → USD
    const usd = naira / RATES.usdToNgn;

    // USD → crypto
    const cryptoPrice = getCryptoPriceUsd(selectedCurrency);
    const cryptoAmount = usd / cryptoPrice;

    // Format USD
    usdEquivalentEl.textContent = '$' + usd.toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    // Format crypto amount (BTC/ETH need more decimals, USDT needs 2)
    const decimals = selectedCurrency === 'usdt' ? 2 : 8;
    cryptoEquivEl.textContent = `${cryptoAmount.toFixed(decimals)} ${selectedCurrency.toUpperCase()}`;

    // Highlight card red if below min or above max
    const invalid = naira < RATES.minNaira || naira > RATES.maxNaira;
    converterCard.classList.toggle('invalid', invalid);
}

function updateRateDisplay() {
    const usdToNgn  = RATES.usdToNgn.toLocaleString('en-US');
    const cryptoPrice = getCryptoPriceUsd(selectedCurrency);
    const cryptoSym = selectedCurrency.toUpperCase();

    rateDisplayEl.innerHTML = `Rate: $1 = ₦${usdToNgn} &nbsp;·&nbsp; 1 ${cryptoSym} = $${cryptoPrice.toLocaleString('en-US')}`;
}

function updateMinMaxHints() {
    minHintEl.textContent = `Min: ₦${RATES.minNaira.toLocaleString()}`;
    maxHintEl.textContent = `Max: ₦${RATES.maxNaira.toLocaleString()}`;
    amountInput.min = RATES.minNaira;
    amountInput.max = RATES.maxNaira;
}

amountInput.addEventListener('input', updateConverter);

// ---------- Load rates from Firestore ----------
async function loadRates() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'exchangeRates'));
        if (snap.exists()) {
            const data = snap.data();
            RATES = {
                usdToNgn:  Number(data.usdToNgn)  || RATES.usdToNgn,
                usdtUsd:   Number(data.usdtUsd)   || RATES.usdtUsd,
                btcUsd:    Number(data.btcUsd)    || RATES.btcUsd,
                ethUsd:    Number(data.ethUsd)    || RATES.ethUsd,
                minNaira:  Number(data.minNaira)  || RATES.minNaira,
                maxNaira:  Number(data.maxNaira)  || RATES.maxNaira
            };
        }
    } catch (err) {
        console.error('Could not load rates, using defaults:', err);
    }
    updateMinMaxHints();
    updateRateDisplay();
    updateConverter();
}

// ---------- Auth ----------
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;

    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const balance = snap.exists() ? (snap.data().balance || 0) : 0;
        if (balanceEl) {
            balanceEl.textContent = balance.toLocaleString('en-US', {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
        }
    } catch (err) { console.error('Balance error:', err); }

    await loadRates();
    loadRecentDeposits(user.uid);
});

// ---------- Recent deposits ----------
async function loadRecentDeposits(uid) {
    if (!listEl) return;
    try {
        const snap = await getDocs(query(
            collection(db, 'deposits'),
            where('uid', '==', uid)
        ));

        if (snap.empty) {
            listEl.innerHTML = `
                <div class="recent-empty">
                    <i class="fas fa-inbox"></i>
                    <p>No deposits yet</p>
                    <span>Your deposit history will appear here</span>
                </div>`;
            return;
        }

        const deposits = snap.docs.map(d => d.data()).sort((a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
        );

        const colors = {
            pending:  { c: '#ffb347', bg: 'rgba(255,179,71,0.08)' },
            approved: { c: '#51cf66', bg: 'rgba(81,207,102,0.08)' },
            rejected: { c: '#ff6b6b', bg: 'rgba(255,107,107,0.08)' }
        };

        listEl.innerHTML = deposits.slice(0, 5).map(dep => {
            const st = colors[dep.status] || colors.pending;
            const amt = (dep.amountNaira || dep.amount || 0).toLocaleString('en-US');
            const coin = (dep.currency || 'usdt').toUpperCase();
            const net  = dep.network ? ` • ${dep.network.toUpperCase()}` : '';
            const ref  = dep.reference ? `Ref: ${dep.reference.slice(0, 14)}…` : 'Processing';
            return `
                <div class="recent-item">
                    <div class="recent-item-left">
                        <span class="recent-amount">₦${amt}</span>
                        <span class="recent-meta">${coin}${net} • ${ref}</span>
                    </div>
                    <span class="recent-status" style="color:${st.c};border-color:${st.c};background:${st.bg}">
                        ${dep.status || 'pending'}
                    </span>
                </div>`;
        }).join('');
    } catch (err) {
        console.error('Failed to load deposits:', err);
    }
}

// ---------- Submit deposit ----------
if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (!currentUser) return;

        const amountNaira = parseFloat(amountInput.value);
        const txid        = txidInput.value.trim();

        if (!amountNaira || amountNaira < RATES.minNaira) {
            showToast(`Minimum deposit is ₦${RATES.minNaira.toLocaleString()}`, 'error'); return;
        }
        if (amountNaira > RATES.maxNaira) {
            showToast(`Maximum deposit is ₦${RATES.maxNaira.toLocaleString()}`, 'error'); return;
        }
        if (!txid || txid.length < 6) {
            showToast('Please enter a valid Transaction Hash (TXID)', 'error'); return;
        }

        // Compute the USD + crypto equivalent at submission time
        const usdAmount   = amountNaira / RATES.usdToNgn;
        const cryptoPrice = getCryptoPriceUsd(selectedCurrency);
        const cryptoAmount = usdAmount / cryptoPrice;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

        try {
            // Get user's name for admin display
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            const userData = userSnap.exists() ? userSnap.data() : {};
            const userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim()
                || currentUser.displayName
                || currentUser.email;

            await addDoc(collection(db, 'deposits'), {
                uid: currentUser.uid,
                email: currentUser.email || null,
                userName,

                // Naira-first (main amount)
                amountNaira: amountNaira,
                amountUsd:   Number(usdAmount.toFixed(2)),
                amountCrypto: Number(cryptoAmount.toFixed(8)),

                // Also keep `amount` for backward compat with admin code
                amount: amountNaira,

                currency: selectedCurrency,
                network: selectedCurrency === 'usdt' ? selectedNetwork : selectedCurrency,
                address: addressDisplay.textContent.trim(),
                reference: txid,

                // Snapshot the rate at submission time
                rateUsedUsdToNgn: RATES.usdToNgn,
                rateUsedCryptoUsd: cryptoPrice,

                status: 'pending',
                createdAt: serverTimestamp()
            });

            // Email admin
            if (window.emailjs) {
                try {
                    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                        user_email: currentUser.email || 'Unknown',
                        amount:     `₦${amountNaira.toLocaleString()}`,
                        usd_amount: `$${usdAmount.toFixed(2)}`,
                        crypto_amount: `${cryptoAmount.toFixed(selectedCurrency === 'usdt' ? 2 : 8)} ${selectedCurrency.toUpperCase()}`,
                        currency:   selectedCurrency.toUpperCase(),
                        network:    (selectedCurrency === 'usdt' ? selectedNetwork : selectedCurrency).toUpperCase(),
                        reference:  txid,
                        time:       new Date().toLocaleString('en-NG')
                    });
                } catch (emailErr) {
                    console.error('Email notification failed:', emailErr);
                }
            }

            showToast('✅ Deposit submitted! Admin has been notified.', 'success');
            amountInput.value = '';
            txidInput.value = '';
            updateConverter();
            loadRecentDeposits(currentUser.uid);

        } catch (err) {
            console.error('Deposit error:', err);
            showToast('Failed to submit. Try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Submit Deposit';
        }
    });
}

// ---------- Toast ----------
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) { console.log(message); return; }

    const colors = { success: '#51cf66', error: '#ff6b6b', info: '#00d4ff' };
    const color  = colors[type] || colors.success;

    toast.style.borderLeftColor = color;
    const icon = toast.querySelector('i');
    if (icon) {
        icon.style.color = color;
        icon.className = type === 'error'
            ? 'fas fa-exclamation-circle'
            : type === 'info'
                ? 'fas fa-info-circle'
                : 'fas fa-check-circle';
    }
    toastMsg.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}

console.log('Crypto deposit ready!');