import { collection, query, where, getDocs, setDoc, doc, deleteDoc, orderBy, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { DEFAULT_PHRASES } from './index';

/**
 * phraseService.js
 * Manages the phrases stored in Firestore for patients.
 */

const PHRASES_COLLECTION = 'phrases';

/**
 * Fetch phrases for a specific patient.
 * If the patient has no custom phrases, returns the DEFAULT_PHRASES.
 * @param {string} patientUid 
 * @returns {Promise<Array>} Array of phrase objects
 */
export async function getPatientPhrases(patientUid) {
  if (!patientUid) return DEFAULT_PHRASES;

  try {
    const q = query(
      collection(db, PHRASES_COLLECTION),
      where('patientUid', '==', patientUid),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return DEFAULT_PHRASES;
    }

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[PhraseService] Error fetching phrases:', error);
    // On error (e.g. missing indexes or permissions), fallback gracefully
    return DEFAULT_PHRASES;
  }
}

/**
 * Subscribe to real-time updates for patient phrases.
 * @param {string} patientUid 
 * @param {function} callback - Receives array of phrases
 * @returns {function} unsubscribe function
 */
export function subscribeToPatientPhrases(patientUid, callback) {
  if (!patientUid) {
    callback(DEFAULT_PHRASES);
    return () => {};
  }

  const q = query(
    collection(db, PHRASES_COLLECTION),
    where('patientUid', '==', patientUid),
    orderBy('order', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(DEFAULT_PHRASES.slice(0, 6));
    } else {
      const customPhrases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const allPhrases = [...DEFAULT_PHRASES, ...customPhrases];
      // Keep only the latest 6 (giving priority to custom/recently added phrases)
      callback(allPhrases.slice(-6));
    }
  }, (error) => {
    console.error('[PhraseService] Error subscribing to phrases:', error);
    callback(DEFAULT_PHRASES);
  });
}

/**
 * Save or update a phrase for a patient.
 * @param {string} patientUid 
 * @param {object} phraseData { id, text, category, order }
 */
export async function savePatientPhrase(patientUid, phraseData) {
  if (!patientUid) throw new Error('patientUid is required');
  if (!phraseData.id) throw new Error('phrase.id is required');

  const docRef = doc(db, PHRASES_COLLECTION, phraseData.id);
  const data = {
    patientUid,
    text: phraseData.text,
    category: phraseData.category || 'custom',
    order: phraseData.order || Date.now(),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, data, { merge: true });

  // Enforce max 6 custom phrases in Firestore to prevent unbounded growth
  try {
    const q = query(
      collection(db, PHRASES_COLLECTION),
      where('patientUid', '==', patientUid),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    if (snapshot.size > 6) {
      const docsToDelete = snapshot.docs.slice(0, snapshot.size - 6);
      await Promise.all(docsToDelete.map(d => deleteDoc(d.ref)));
    }
  } catch (err) {
    console.error('Failed to cleanup old phrases:', err);
  }

  return { id: docRef.id, ...data };
}

/**
 * Delete a phrase.
 * @param {string} phraseId 
 */
export async function deletePatientPhrase(phraseId) {
  const docRef = doc(db, PHRASES_COLLECTION, phraseId);
  await deleteDoc(docRef);
}
