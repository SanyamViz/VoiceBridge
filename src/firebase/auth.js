import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';

/**
 * Sign up a new user with email, password, and designated role.
 * Role can be 'patient' or 'caregiver'.
 */
export async function signUpWithEmail(email, password, role = 'patient', displayName = '') {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Create initial user document with role
  const userProfile = {
    uid: user.uid,
    email: user.email,
    displayName: displayName || (role === 'patient' ? 'Patient User' : 'Caregiver User'),
    role: role, // 'patient' or 'caregiver'
    createdAt: serverTimestamp(),
    settings: {
      dwellTimeMs: 1200,
      soundFeedback: true,
      highContrast: true
    }
  };

  try {
    await setDoc(doc(db, 'users', user.uid), userProfile);
  } catch (err) {
    console.warn('[Auth] Failed to write initial user profile to Firestore (may be in offline/mock mode):', err);
  }

  return { user, profile: userProfile };
}

/**
 * Sign in existing user with email and password
 */
export async function signInWithEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Fetch user profile
  let profile = null;
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      profile = userDoc.data();
    }
  } catch (err) {
    console.warn('[Auth] Failed to fetch user profile:', err);
  }

  return { user, profile };
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  return await signOut(auth);
}

/**
 * Fetch profile data for a specific user ID
 */
export async function getUserProfile(uid) {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data();
    }
  } catch (err) {
    console.warn('[Auth] Error fetching user profile:', err);
  }
  return null;
}
