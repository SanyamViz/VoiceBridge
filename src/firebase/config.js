import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';

// Firebase configuration using Vite environment variables (with fallbacks for demo/Vercel deployments)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoKeyForVoiceBridgeHackathonDemo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "voicebridge-demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "voicebridge-demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "voicebridge-demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "100000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:100000000000:web:abcdef123456789"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Enable offline multi-tab persistence to allow local testing across tabs without backend
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('The current browser does not support all of the features required to enable persistence');
  }
});

// Asynchronously initialize Firebase Cloud Messaging if supported
export let messaging = null;
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  } else {
    console.warn('[Firebase] Cloud Messaging is not supported in this browser environment.');
  }
}).catch((err) => {
  console.warn('[Firebase] Failed to check messaging support:', err);
});
