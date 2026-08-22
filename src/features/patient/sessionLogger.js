import { db } from '../../firebase/config';
import { collection, doc, setDoc, updateDoc, increment } from 'firebase/firestore';

/**
 * Service to manage Real-User Test Session logging.
 */
class SessionLogger {
  constructor() {
    this.activeSessionId = null;
    this.patientUid = null;
    this.sessionStartTime = null;
  }

  /**
   * Starts a new session document in Firestore.
   */
  async startSession(patientUid) {
    if (!patientUid) throw new Error("patientUid required to start session");
    
    this.patientUid = patientUid;
    this.activeSessionId = `session_${Date.now()}`;
    this.sessionStartTime = Date.now();
    
    const docRef = doc(db, 'sessions', this.activeSessionId);
    
    await setDoc(docRef, {
      patientUid: this.patientUid,
      startTime: new Date(),
      status: 'active',
      
      // Metrics
      metrics: {
        dwellSuccessCount: 0,
        dwellFailCount: 0,
        gestureCount: 0,
        modeSwitchCount: 0,
        timeToEmergencyMs: -1,
        calibrationAccuracy: -1
      }
    });
    
    return this.activeSessionId;
  }

  /**
   * Ends the active session.
   */
  async endSession() {
    if (!this.activeSessionId) return;
    
    try {
      const docRef = doc(db, 'sessions', this.activeSessionId);
      await updateDoc(docRef, {
        status: 'completed',
        endTime: new Date()
      });
    } catch (err) {
      console.error("Failed to end session:", err);
    }
    
    this.activeSessionId = null;
    this.patientUid = null;
    this.sessionStartTime = null;
  }

  /**
   * Helper to increment a specific metric.
   */
  async _incrementMetric(metricName, amount = 1) {
    if (!this.activeSessionId) return;
    
    try {
      const docRef = doc(db, 'sessions', this.activeSessionId);
      await updateDoc(docRef, {
        [`metrics.${metricName}`]: increment(amount)
      });
    } catch (err) {
      console.error(`Failed to increment metric ${metricName}:`, err);
    }
  }

  // --- Public Logging Methods ---

  logDwellSuccess() {
    this._incrementMetric('dwellSuccessCount');
  }

  logDwellAbort() {
    this._incrementMetric('dwellFailCount');
  }

  logGestureDetected() {
    this._incrementMetric('gestureCount');
  }

  logModeSwitch() {
    this._incrementMetric('modeSwitchCount');
  }

  async logEmergencyTriggered() {
    if (!this.activeSessionId || !this.sessionStartTime) return;
    const timeElapsedMs = Date.now() - this.sessionStartTime;
    try {
      const docRef = doc(db, 'sessions', this.activeSessionId);
      await updateDoc(docRef, {
        'metrics.timeToEmergencyMs': timeElapsedMs
      });
    } catch (err) {
      console.error("Failed to log emergency time:", err);
    }
  }

  async logCalibrationAccuracy(accuracyValue) {
    if (!this.activeSessionId) return;
    try {
      const docRef = doc(db, 'sessions', this.activeSessionId);
      await updateDoc(docRef, {
        'metrics.calibrationAccuracy': accuracyValue
      });
    } catch (err) {
      console.error("Failed to log calibration accuracy:", err);
    }
  }
}

// Export singleton instance
export const sessionLogger = new SessionLogger();
