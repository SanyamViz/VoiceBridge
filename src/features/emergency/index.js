/**
 * Feature: Safety-Critical Emergency Alert
 * Combines gaze zone + triple blink with dwell-time fallback for patients with poor blink control.
 */
export const ALERT_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  CRITICAL: 'CRITICAL'
};

export async function dispatchEmergencyAlert(patientId, alertDetails = {}) {
  console.log('[Emergency Alert] Dispatching alert for patient:', patientId, alertDetails);
  // Integration point with Firestore /alerts collection & Cloud Messaging
  return {
    alertId: `mock-alert-${Date.now()}`,
    timestamp: new Date().toISOString(),
    patientId,
    status: 'DISPATCHED',
    ...alertDetails
  };
}
