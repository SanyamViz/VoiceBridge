import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGaze } from '../../context/GazeContext';
import { BLINK_GESTURE } from '../gaze/blinkDetector';
import { useDwellTracker } from '../phraseboard/useDwellTracker';
import { sendEmergencyAlert } from './emergencyService';
import { sessionLogger } from '../patient/sessionLogger';

export const ALERT_STATE = {
  IDLE: 'IDLE',
  SENDING: 'SENDING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
};

export function EmergencyZone() {
  const { currentUser } = useAuth();
  const { lastGesture } = useGaze();
  
  const [alertState, setAlertState] = useState(ALERT_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Provide a safe fallback UID if not logged in yet
  const uid = currentUser?.uid || 'anonymous-patient';

  const triggerAlert = useCallback(async (source) => {
    if (alertState === ALERT_STATE.SENDING || alertState === ALERT_STATE.SUCCESS) return;
    
    console.log(`[EmergencyZone] Triggering alert via ${source}`);
    setAlertState(ALERT_STATE.SENDING);
    setErrorMessage('');

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout: Could not reach server.')), 5000)
      );
      
      await Promise.race([sendEmergencyAlert(uid), timeoutPromise]);
      setAlertState(ALERT_STATE.SUCCESS);
      sessionLogger.logEmergencyTriggered();
      
      // Auto-reset back to idle after 5 seconds so it can be used again if needed
      setTimeout(() => {
        setAlertState(ALERT_STATE.IDLE);
      }, 5000);
      
    } catch (err) {
      console.error(err);
      setAlertState(ALERT_STATE.ERROR);
      setErrorMessage(err.message || 'Alert failed.');
      
      // Reset after error so they can retry
      setTimeout(() => {
        setAlertState(ALERT_STATE.IDLE);
      }, 5000);
    }
  }, [alertState, uid]);

  // 1. Trigger via DOUBLE BLINK (from anywhere on screen)
  useEffect(() => {
    if (lastGesture && lastGesture.gesture === BLINK_GESTURE.DOUBLE) {
      // Ensure the gesture is fresh
      if (Date.now() - lastGesture.timestamp < 1000) {
        triggerAlert('double-blink');
      }
    }
  }, [lastGesture, triggerAlert]);

  // 2. Trigger via GAZE DWELL on this specific zone
  // We use a longer dwell time (2500ms) for the emergency zone to avoid accidental triggers
  const { hoveredId, progress } = useDwellTracker({
    dwellTimeMs: 2500,
    onSelect: (id) => {
      if (id === 'emergency-trigger') {
        triggerAlert('gaze-dwell');
      }
    }
  });

  const isHovered = hoveredId === 'emergency-trigger';

  return (
    <div className="emergency-zone-container">
      <button
        id="emergency-zone-btn"
        className={`emergency-zone-btn ${alertState.toLowerCase()} ${isHovered ? 'hovered' : ''}`}
        data-dwell-target="true"
        data-phrase-id="emergency-trigger"
        onClick={() => triggerAlert('touch-fallback')}
      >
        {alertState === ALERT_STATE.IDLE && (
          <>
            <ShieldAlert size={28} className="emergency-icon blink-alert" />
            <div className="emergency-text">
              <strong>EMERGENCY</strong>
              <span>Dwell or Double-Blink to Alert</span>
            </div>
          </>
        )}

        {alertState === ALERT_STATE.SENDING && (
          <>
            <AlertTriangle size={28} className="emergency-icon spin-alert" />
            <div className="emergency-text">
              <strong>SENDING ALERT...</strong>
            </div>
          </>
        )}

        {alertState === ALERT_STATE.SUCCESS && (
          <>
            <CheckCircle size={28} className="emergency-icon success-icon" />
            <div className="emergency-text">
              <strong>ALERT SENT</strong>
              <span>Caregiver notified</span>
            </div>
          </>
        )}

        {alertState === ALERT_STATE.ERROR && (
          <>
            <XCircle size={28} className="emergency-icon error-icon" />
            <div className="emergency-text">
              <strong>FAILED TO SEND</strong>
              <span className="error-msg">{errorMessage}</span>
            </div>
          </>
        )}

        {/* Dwell Progress Bar Overlay */}
        {alertState === ALERT_STATE.IDLE && isHovered && (
          <div 
            className="emergency-dwell-progress"
            style={{ width: `${progress * 100}%` }}
          />
        )}
      </button>
    </div>
  );
}
