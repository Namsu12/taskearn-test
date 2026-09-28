// ========================================
// IN-APP CHAT (USER SIDE) - JAVASCRIPT
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, updateDoc,
    collection, addDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// ========================================
// FILL THIS PATH👇👇
// ========================================
const firebaseConfig = {
  apiKey: "AIzaSyCfKvla4_5nt-XZcdNe0reZTjOvMF7yAfw",
  authDomain: "taskearn0012.firebaseapp.com",
  databaseURL: "https://taskearn0012-default-rtdb.firebaseio.com",
  projectId: "taskearn0012",
  storageBucket: "taskearn0012.firebasestorage.app",
  messagingSenderId: "269601831416",
  appId: "1:269601831416:web:82afe671b90d1549e7fe0d"
};
// ========================================
// FILL THOSE(GOTTEN FROM FIREBASE)👆👆
// ========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const messagesEl = document.getElementById('chatMessages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const sendBtn = document.getElementById('chatSendBtn');

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;

    // Make sure a chat "thread" document exists for this user, so the
    // admin side has a name/email to show even before the first message.
    const chatRef = doc(db, 'chats', user.uid);
    try {
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
            await setDoc(chatRef, {
                userName: user.displayName || 'Ultron User',
                userEmail: user.email || '',
                lastMessage: '',
                lastMessageAt: serverTimestamp(),
                unreadByAdmin: false,
                unreadByUser: false
            });
        } else {
            // Opening the chat means any pending admin replies are now seen.
            await updateDoc(chatRef, { unreadByUser: false });
        }
    } catch (error) {
        console.error('❌ Failed to initialize chat thread:', error);
    }

    listenForMessages(user.uid);
});

// ---------- REAL-TIME MESSAGE LISTENER ----------
function listenForMessages(uid) {
    const messagesQuery = query(collection(db, 'chats', uid, 'messages'), orderBy('createdAt', 'asc'));

    onSnapshot(messagesQuery, (snap) => {
        if (snap.empty) {
            messagesEl.innerHTML = `
                <div class="chat-empty">
                    <i class="fas fa-comments"></i>
                    <p>Say hello! Our support team will get back to you here.</p>
                </div>
            `;
            return;
        }

        messagesEl.innerHTML = snap.docs.map(d => {
            const msg = d.data();
            const isUser = msg.sender === 'user';
            const time = msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="chat-bubble-row ${isUser ? 'from-user' : 'from-admin'}">
                    <div class="chat-bubble">${escapeHtml(msg.text || '')}</div>
                    <span class="chat-bubble-time">${time}</span>
                </div>
            `;
        }).join('');

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }, (error) => {
        console.error('❌ Chat listener error:', error);
        messagesEl.innerHTML = `<div class="chat-empty"><p>Could not load messages. Please refresh.</p></div>`;
    });
}

// ---------- SEND MESSAGE ----------
form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !currentUser) return;

    sendBtn.disabled = true;
    input.value = '';

    try {
        await addDoc(collection(db, 'chats', currentUser.uid, 'messages'), {
            text,
            sender: 'user',
            createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'chats', currentUser.uid), {
            lastMessage: text,
            lastMessageAt: serverTimestamp(),
            unreadByAdmin: true,
            unreadByUser: false
        });
    } catch (error) {
        console.error('❌ Failed to send message:', error);
        input.value = text; // give the message back so they don't lose it
    } finally {
        sendBtn.disabled = false;
        input.focus();
    }
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

console.log('🚀 ULTRON Chat ready!');
