// ========================================
// COMMUNITY CHAT (PUBLIC) - JAVASCRIPT
// ========================================

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc,
    collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfKvla4_5nt-XZcdNe0reZTjOvMF7yAfw",
  authDomain: "taskearn0012.firebaseapp.com",
  databaseURL: "https://taskearn0012-default-rtdb.firebaseio.com",
  projectId: "taskearn0012",
  storageBucket: "taskearn0012.firebasestorage.app",
  messagingSenderId: "269601831416",
  appId: "1:269601831416:web:82afe671b90d1549e7fe0d"
};

// Cloudinary handles image hosting here instead of Firebase Storage, since
// Storage now requires the paid Blaze plan even for small free-tier usage.
const CLOUDINARY_CLOUD_NAME = 'o5b9ql9h';
const CLOUDINARY_UPLOAD_PRESET = 'vepxlada';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — keep an eye on Cloudinary's 25 free credits/month

// dashboard.js likely already calls initializeApp() with this same config on
// this page — reuse that instance instead of throwing a "app already exists" error.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const overlay = document.getElementById('communityChatOverlay');
const panel = document.getElementById('communityChatPanel');
const openBtn = document.getElementById('communityChatBtn');
const closeBtn = document.getElementById('communityChatClose');
const messagesEl = document.getElementById('communityMessages');
const textInput = document.getElementById('communityTextInput');
const sendBtn = document.getElementById('communitySendBtn');
const attachBtn = document.getElementById('communityAttachBtn');
const imageInput = document.getElementById('communityImageInput');

let currentUser = null;
let currentUserName = 'User';
let listenerStarted = false;

// ---------- OPEN / CLOSE PANEL ----------
function openPanel() {
    overlay.classList.add('active');
    panel.classList.add('active');
    if (!listenerStarted && currentUser) {
        listenForMessages();
        listenerStarted = true;
    }
}

function closePanel() {
    overlay.classList.remove('active');
    panel.classList.remove('active');
}

openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openPanel();
});
closeBtn?.addEventListener('click', closePanel);
overlay?.addEventListener('click', closePanel);

// ---------- AUTH ----------
// No redirect-to-login here on purpose: dashboard.js already guards this
// whole page, so by the time this script matters the user is signed in.
onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;
    currentUserName = await resolveSenderName(user);

    if (panel.classList.contains('active') && !listenerStarted) {
        listenForMessages();
        listenerStarted = true;
    }
});

async function resolveSenderName(user) {
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            const d = snap.data();
            const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim();
            if (fullName) return fullName;
        }
    } catch (error) {
        console.error('❌ Could not resolve sender name:', error);
    }
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split('@')[0];
    return 'User';
}

// ---------- REAL-TIME MESSAGE LISTENER ----------
function listenForMessages() {
    // Only the most recent 50 — keeps reads (and cost) bounded instead of
    // loading the entire public history every time someone opens the panel.
    const messagesQuery = query(
        collection(db, 'communityChat'),
        orderBy('createdAt', 'desc'),
        limit(50)
    );

    onSnapshot(messagesQuery, (snap) => {
        if (snap.empty) {
            messagesEl.innerHTML = `
                <div class="chat-empty">
                    <i class="fas fa-comments"></i>
                    <p>No messages yet. Say hello 👋</p>
                </div>
            `;
            return;
        }

        const oldestFirst = [...snap.docs].reverse();
        messagesEl.innerHTML = oldestFirst.map(renderMessage).join('');
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }, (error) => {
        console.error('❌ Community chat listener error:', error);
        messagesEl.innerHTML = `<div class="chat-empty"><p>Could not load messages. Please refresh.</p></div>`;
    });
}

function renderMessage(d) {
    const msg = d.data();
    const isMine = currentUser && msg.senderUid === currentUser.uid;
    const time = msg.createdAt
        ? msg.createdAt.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : '';
    const nameLine = !isMine
        ? `<span class="chat-sender-name">${escapeHtml(msg.senderName || 'User')}</span>`
        : '';
    const body = msg.imageUrl
        ? `<img class="chat-image" src="${escapeAttr(msg.imageUrl)}" alt="Shared image" loading="lazy" />`
        : `<div class="chat-bubble">${escapeHtml(msg.text || '')}</div>`;

    return `
        <div class="chat-bubble-row ${isMine ? 'from-user' : 'from-admin'}">
            ${nameLine}
            ${body}
            <span class="chat-bubble-time">${time}</span>
        </div>
    `;
}

// ---------- SEND TEXT ----------
sendBtn.addEventListener('click', sendTextMessage);
textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendTextMessage();
    }
});

async function sendTextMessage() {
    const text = textInput.value.trim();
    if (!text || !currentUser) return;

    sendBtn.disabled = true;
    textInput.value = '';

    try {
        await addDoc(collection(db, 'communityChat'), {
            text,
            senderUid: currentUser.uid,
            senderName: currentUserName,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error('❌ Failed to send message:', error);
        textInput.value = text; // give it back so they don't lose it
    } finally {
        sendBtn.disabled = false;
        textInput.focus();
    }
}

// ---------- SEND IMAGE ----------
attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', async () => {
    const file = imageInput.files[0];
    imageInput.value = ''; // reset so picking the same file twice still fires 'change'
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) {
        alert('Please choose an image file.');
        return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
        alert('Image is too large — please choose one under 5MB.');
        return;
    }

    attachBtn.disabled = true;
    sendBtn.disabled = true;

    try {
        const imageUrl = await uploadToCloudinary(file);
        await addDoc(collection(db, 'communityChat'), {
            imageUrl,
            senderUid: currentUser.uid,
            senderName: currentUserName,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error('❌ Failed to send image:', error);
        alert('Could not send image. Please try again.');
    } finally {
        attachBtn.disabled = false;
        sendBtn.disabled = false;
    }
});

async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
    const data = await res.json();
    return data.secure_url;
}

// ---------- HELPERS ----------
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
}

console.log('🚀 Community chat ready!');
