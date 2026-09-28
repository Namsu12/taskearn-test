// ========================================
// SUPPORT CHAT - COMPLETE JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, 
    query, orderBy, serverTimestamp, doc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let currentUser = null;
let unsubscribe = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;

    // Create or update chat document for this user
    await setDoc(doc(db, 'chats', user.uid), {
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || 'User',
        lastMessage: '',
        lastMessageTime: serverTimestamp(),
        unreadAdmin: 0
    }, { merge: true });

    listenToMessages(user.uid);
});

// ---------- LISTEN TO MESSAGES IN REAL TIME ----------
function listenToMessages(uid) {
    const q = query(
        collection(db, 'chats', uid, 'messages'),
        orderBy('createdAt', 'asc')
    );

    unsubscribe = onSnapshot(q, (snap) => {
        // Remove welcome bubble once real messages exist
        if (snap.docs.length > 0) {
            const welcome = messagesArea.querySelector('.welcome-bubble');
            if (welcome) welcome.remove();
        }

        // Only render new messages (avoid re-rendering all)
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                renderMessage(data);
            }
        });

        scrollToBottom();
    });
}

// ---------- RENDER A MESSAGE BUBBLE ----------
function renderMessage(data) {
    const isUser = data.sender === 'user';
    const time = data.createdAt ? data.createdAt.toDate().toLocaleTimeString('en-NG', {
        hour: '2-digit', minute: '2-digit'
    }) : '';

    const msgEl = document.createElement('div');
    msgEl.className = `message ${isUser ? 'user' : 'admin'}`;
    msgEl.innerHTML = `
        <div class="message-bubble">${escapeHtml(data.text)}</div>
        <span class="message-time">${time}</span>
    `;
    messagesArea.appendChild(msgEl);
}

// ---------- SEND MESSAGE ----------
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    messageInput.value = '';
    sendBtn.disabled = true;

    try {
        await addDoc(collection(db, 'chats', currentUser.uid, 'messages'), {
            text,
            sender: 'user',
            createdAt: serverTimestamp(),
            read: false
        });

        // Update chat summary for admin to see
        await updateDoc(doc(db, 'chats', currentUser.uid), {
            lastMessage: text,
            lastMessageTime: serverTimestamp(),
            unreadAdmin: (await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js")).increment(1)
        });

    } catch (err) {
        console.error('Send error:', err);
    } finally {
        sendBtn.disabled = false;
        messageInput.focus();
    }
}

// ---------- EVENT LISTENERS ----------
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

console.log('Support chat ready!');
