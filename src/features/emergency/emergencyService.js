import { collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';

const ALERTS_COLLECTION = 'alerts';

/**
 * Dispatches an emergency alert to Firestore.
 * In a production system, a Firebase Cloud Function would listen to this collection
 * and dispatch an actual FCM push notification to the linked caregiver's device token.
 * For this client-only phase, the Caregiver Dashboard will listen to this collection
 * directly to trigger a local browser notification.
 *
 * @param {string} patientUid - The UID of the patient sending the alert.
 * @returns {Promise<string>} - The document ID of the created alert.
 */
export async function sendEmergencyAlert(patientUid) {
  if (!patientUid) {
    throw new Error('Patient UID is required to send an emergency alert.');
  }

  try {
    const alertData = {
      patientUid,
      status: 'active', // active, acknowledged, resolved
      createdAt: serverTimestamp(),
      type: 'TRIPLE_BLINK_OR_DWELL'
    };

    const docRef = await addDoc(collection(db, ALERTS_COLLECTION), alertData);
    
    // Enforce max 6 alerts to prevent unbounded growth
    try {
      const q = query(
        collection(db, ALERTS_COLLECTION),
        where('patientUid', '==', patientUid),
        orderBy('createdAt', 'asc')
      );
      const snapshot = await getDocs(q);
      if (snapshot.size > 6) {
        const docsToDelete = snapshot.docs.slice(0, snapshot.size - 6);
        await Promise.all(docsToDelete.map(d => deleteDoc(d.ref)));
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup old alerts:', cleanupErr);
    }

    return docRef.id;
  } catch (error) {
    console.error('[EmergencyService] Failed to dispatch alert:', error);
    throw new Error('Failed to dispatch alert. Please ensure you are online.');
  }
}
