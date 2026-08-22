import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';

const PRESENCE_COLLECTION = 'presence';

/**
 * Updates the patient's live telemetry/presence document.
 * @param {string} patientUid 
 * @param {object} statusData - e.g. { status: 'TRACKING', confidence: 0.85, fps: 30 }
 */
export async function updatePatientPresence(patientUid, statusData) {
  if (!patientUid) return;
  
  const docRef = doc(db, PRESENCE_COLLECTION, patientUid);
  try {
    await setDoc(docRef, {
      ...statusData,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('[presenceService] Failed to update presence:', error);
  }
}

/**
 * Subscribe to a patient's live presence document.
 * @param {string} patientUid 
 * @param {function} callback - Receives the presence data
 * @returns {function} unsubscribe function
 */
export function subscribeToPresence(patientUid, callback) {
  if (!patientUid) return () => {};
  
  const docRef = doc(db, PRESENCE_COLLECTION, patientUid);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  });
}
