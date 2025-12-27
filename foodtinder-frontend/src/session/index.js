import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';

const firebaseConfig = (function readConfig() {
  try {
    const cfg = {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID
    };
    if (!cfg.apiKey) return null;
    return cfg;
  } catch (e) {
    return null;
  }
})();

let db = null;
if (firebaseConfig) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// LocalStorage fallback for sessions when Firebase isn't configured
const STORAGE_KEY_PREFIX = 'foodtinder:session:';

export async function createSession(sessionId, sessionObj) {
  if (db) {
    await setDoc(doc(db, 'sessions', sessionId), sessionObj);
    return { source: 'firebase' };
  }

  localStorage.setItem(STORAGE_KEY_PREFIX + sessionId, JSON.stringify(sessionObj));
  return { source: 'local' };
}

export async function getSession(sessionId) {
  if (db) {
    const snap = await getDoc(doc(db, 'sessions', sessionId));
    const data = snap.exists() ? snap.data() : null;
    // Cache session in localStorage as well for faster subsequent reads and offline fallback
    if (data) {
      try { localStorage.setItem(STORAGE_KEY_PREFIX + sessionId, JSON.stringify(data)); } catch (e) {}
    }
    return data;
  }

  const raw = localStorage.getItem(STORAGE_KEY_PREFIX + sessionId);
  return raw ? JSON.parse(raw) : null;
}

export function onSessionUpdate(sessionId, callback) {
  if (db) {
    return onSnapshot(doc(db, 'sessions', sessionId), docSnap => {
      if (docSnap.exists()) callback(docSnap.data());
    });
  }

  // Polling fallback for localStorage
  let last = null;
  const interval = setInterval(() => {
    const s = getSession(sessionId);
    if (JSON.stringify(s) !== JSON.stringify(last)) {
      last = s;
      callback(s);
    }
  }, 1000);
  return () => clearInterval(interval);
}

export async function addVote(sessionId, placeId, userId) {
  console.log('addVote called:', { sessionId, placeId, userId });
  if (db) {
    const placeVotesField = `votes.${placeId}`;
    const sessionRef = doc(db, 'sessions', sessionId);
    // Update by reading then writing to keep simple (Firestore lacks atomic map array union)
    const snap = await getDoc(sessionRef);
    let data = snap.exists() ? snap.data() : {};
    data.votes = data.votes || {};
    data.votes[placeId] = data.votes[placeId] || [];
    if (!data.votes[placeId].includes(userId)) data.votes[placeId].push(userId);
    await setDoc(sessionRef, data);
    console.log('Vote saved to Firestore');
    return data;
  }

  const s = await getSession(sessionId);
  console.log('Current session state:', s);
  if (!s) throw new Error('Session not found');
  s.votes = s.votes || {};
  s.votes[placeId] = s.votes[placeId] || [];
  if (!s.votes[placeId].includes(userId)) s.votes[placeId].push(userId);
  await createSession(sessionId, s);
  console.log('Vote saved to localStorage, updated votes:', s.votes);
  return s;
}

export async function addDislike(sessionId, placeId, userId) {
  console.log('addDislike called:', { sessionId, placeId, userId });
  if (db) {
    const sessionRef = doc(db, 'sessions', sessionId);
    const snap = await getDoc(sessionRef);
    let data = snap.exists() ? snap.data() : {};
    data.dislikes = data.dislikes || {};
    data.dislikes[placeId] = data.dislikes[placeId] || [];
    if (!data.dislikes[placeId].includes(userId)) data.dislikes[placeId].push(userId);
    await setDoc(sessionRef, data);
    console.log('Dislike saved to Firestore');
    return data;
  }

  const s = await getSession(sessionId);
  if (!s) throw new Error('Session not found');
  s.dislikes = s.dislikes || {};
  s.dislikes[placeId] = s.dislikes[placeId] || [];
  if (!s.dislikes[placeId].includes(userId)) s.dislikes[placeId].push(userId);
  await createSession(sessionId, s);
  console.log('Dislike saved to localStorage, updated dislikes:', s.dislikes);
  return s;
}
