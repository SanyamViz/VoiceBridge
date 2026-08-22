import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { GazeEngine, GAZE_STATUS } from '../features/gaze/gazeEngine';
import { ConfidenceTracker, CONFIDENCE_LEVEL } from '../features/gaze/confidenceTracker';
import { BlinkDetector, BLINK_GESTURE } from '../features/gaze/blinkDetector';
import { mapToScreen, runCalibration, CALIBRATION_POINTS_9 } from '../features/gaze/calibration';
import { useAuth } from './AuthContext';
import { updatePatientPresence } from '../features/patient/presenceService';
import { sessionLogger } from '../features/patient/sessionLogger';

export const GazeContext = createContext(null);

export function GazeProvider({ children }) {
  const { currentUser, role } = useAuth();
  
  // ── State ──
  const [status, setStatus] = useState(GAZE_STATUS.UNINITIALIZED);
  const [gazePosition, setGazePosition] = useState({ x: 0, y: 0, valid: false });
  const [confidence, setConfidence] = useState(0);
  const [confidenceLevel, setConfidenceLevel] = useState(CONFIDENCE_LEVEL.POOR);
  
  // Rehydrate Calibration Data (FINDING 3)
  const storedCalibration = localStorage.getItem('voicebridge_calibration');
  let initialCalibration = null;
  try {
    if (storedCalibration) {
      initialCalibration = JSON.parse(storedCalibration);
    }
  } catch (err) {
    console.warn("Failed to parse stored calibration:", err);
  }

  const [calibrationResult, setCalibrationResult] = useState(null);
  const [isCalibrated, setIsCalibrated] = useState(initialCalibration?.valid || false);
  const [fps, setFps] = useState(0);
  const [lastGesture, setLastGesture] = useState(null);
  const [ear, setEar] = useState(-1);
  const [error, setError] = useState(null);
  
  // Test Session State
  const [activeSessionId, setActiveSessionId] = useState(null);
  
  // Input Mode Fallback
  const [inputMode, setInputModeState] = useState('gaze'); // 'gaze' | 'touch'
  const setInputMode = useCallback((mode) => {
    if (activeSessionId && mode !== inputMode) {
      sessionLogger.logModeSwitch();
    }
    setInputModeState(mode);
  }, [activeSessionId, inputMode]);

  // Calibration UI state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPointIndex, setCalibrationPointIndex] = useState(-1);
  const [calibrationTotal, setCalibrationTotal] = useState(9);
  const [calibrationSampling, setCalibrationSampling] = useState(false);

  // ── Refs (mutable across renders) ──
  const engineRef = useRef(null);
  const confidenceRef = useRef(null);
  const blinkRef = useRef(null);
  const calibrationRef = useRef(initialCalibration);
  const magneticTargetRef = useRef(null);
  const lastTelemetryUpdateRef = useRef(0);
  
  const authRef = useRef({ currentUser, role });
  useEffect(() => {
    authRef.current = { currentUser, role };
  }, [currentUser, role]);
  
  const inputModeRef = useRef(inputMode);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  // ── Initialize Engine ──
  const startGaze = useCallback(async () => {
    if (engineRef.current) return;

    const engine = new GazeEngine();
    const ct = new ConfidenceTracker();
    const bd = new BlinkDetector();
    
    // Rehydrate blink threshold
    const storedThreshold = localStorage.getItem('voicebridge_blink_threshold');
    if (storedThreshold) {
      bd.setBlinkThreshold(parseFloat(storedThreshold));
    }

    engineRef.current = engine;
    confidenceRef.current = ct;
    blinkRef.current = bd;

    // Wire status changes
    engine.onStatus((newStatus) => {
      setStatus(newStatus);
    });

    // Wire FPS
    engine.onFps((f) => setFps(f));

    // Wire gaze → screen mapping + confidence recording
    engine.onGaze((gaze) => {
      if (gaze.valid) {
        ct.recordFrame(true, performance.now(), { x: gaze.x, y: gaze.y });

        // Freeze cursor position while eyes are closed to prevent jumps
        if (bd.isEyesClosed) {
          return;
        }

        // Map to screen if calibrated
        if (calibrationRef.current && calibrationRef.current.valid) {
          const screen = mapToScreen(gaze.x, gaze.y, gaze.yaw, gaze.pitch, calibrationRef.current);
          
          let finalX = screen.x;
          let finalY = screen.y;
          
          // Global Magnetic Snapping
          let stillSnapped = false;
          if (magneticTargetRef.current) {
             const activeEl = document.querySelector(`[data-phrase-id="${magneticTargetRef.current}"]`);
             if (activeEl) {
                const rect = activeEl.getBoundingClientRect();
                const padding = 120; // Magnetic field size
                if (
                   finalX >= rect.left - padding &&
                   finalX <= rect.right + padding &&
                   finalY >= rect.top - padding &&
                   finalY <= rect.bottom + padding
                ) {
                   // Still within magnetic field, snap to center
                   finalX = rect.left + rect.width / 2;
                   finalY = rect.top + rect.height / 2;
                   stillSnapped = true;
                }
             }
          }
          
          if (!stillSnapped) {
             magneticTargetRef.current = null;
             // Check if we entered a new target
             const el = document.elementFromPoint(finalX, finalY);
             if (el) {
                const target = el.closest('[data-dwell-target="true"]');
                if (target) {
                   magneticTargetRef.current = target.getAttribute('data-phrase-id');
                   const rect = target.getBoundingClientRect();
                   finalX = rect.left + rect.width / 2;
                   finalY = rect.top + rect.height / 2;
                }
             }
          }

          setGazePosition({ x: finalX, y: finalY, valid: true });
        } else {
          setGazePosition({ x: gaze.x, y: gaze.y, valid: true });
        }
      } else {
        ct.recordFrame(false, performance.now(), null);
        setGazePosition({ x: 0, y: 0, valid: false });
      }
    });

    // Wire landmarks → blink detector
    engine.onLandmarks((landmarks, timestamp, blendshapes) => {
      bd.processFrame(landmarks, timestamp, blendshapes);
    });

    // Wire confidence → state + blink detector
    ct.onChange((c, level) => {
      setConfidence(c);
      setConfidenceLevel(level);
      bd.setConfidence(c);
      
      // Throttle telemetry updates to Firestore
      const now = Date.now();
      const currentAuth = authRef.current;
      if (currentAuth.role === 'patient' && currentAuth.currentUser && now - lastTelemetryUpdateRef.current > 3000) {
         lastTelemetryUpdateRef.current = now;
         updatePatientPresence(currentAuth.currentUser.uid, {
            status: level,
            confidence: c,
            isTracking: engineRef.current ? engineRef.current.isTracking : false,
            inputMode: inputModeRef.current
         });
      }
    });

    // Wire blink gestures
    bd.onGesture((gesture) => {
      setLastGesture({ gesture, timestamp: Date.now() });
    });

    // Wire blink score for debug
    bd.onBlinkScore((score) => {
      setEar(score);
    });

    try {
      setError(null);
      await engine.init();
    } catch (err) {
      setError(err.message || String(err));
      throw err;
    }
  }, []);

  // ── Stop Engine ──
  const stopGaze = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    if (confidenceRef.current) {
      confidenceRef.current.reset();
      confidenceRef.current = null;
    }
    if (blinkRef.current) {
      blinkRef.current.reset();
      blinkRef.current = null;
    }
    calibrationRef.current = null;
    setStatus(GAZE_STATUS.UNINITIALIZED);
    setGazePosition({ x: 0, y: 0, valid: false });
    setConfidence(0);
    setIsCalibrated(false);
    setCalibrationResult(null);
    setFps(0);
    setError(null);
  }, []);

  // ── Start Calibration ──
  const startCalibration = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || !engine.isTracking) return;

    setIsCalibrating(true);
    setCalibrationSampling(false);
    engine.pauseLoop();

    try {
      const result = await runCalibration({
        faceLandmarker: engine.getFaceLandmarker(),
        video: engine.getVideo(),
        points: CALIBRATION_POINTS_9,
        onPoint: (idx, total) => {
          setCalibrationPointIndex(idx);
          setCalibrationTotal(total);
          setCalibrationSampling(false);
        },
        onSampling: () => {
          setCalibrationSampling(true);
        }
      });

      calibrationRef.current = result.calibration;
      setCalibrationResult(result);
      
      const isValid = result.calibration.valid && result.accuracy.pass;
      setIsCalibrated(isValid);
      
      if (isValid) {
        localStorage.setItem('voicebridge_calibration', JSON.stringify(result.calibration));
      }

      if (confidenceRef.current) {
        confidenceRef.current.setCalibrated();
      }
    } catch (err) {
      console.error('[GazeContext] Calibration failed:', err);
      setError('Calibration failed: ' + (err.message || String(err)));
    } finally {
      setIsCalibrating(false);
      setCalibrationPointIndex(-1);
      engine.resumeLoop();
    }
  }, []);

  const dismissCalibrationResult = useCallback(() => {
    setCalibrationResult(null);
  }, []);
  
  const setBlinkThreshold = useCallback((val) => {
    if (blinkRef.current) {
      blinkRef.current.setBlinkThreshold(val);
    }
    localStorage.setItem('voicebridge_blink_threshold', val.toString());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, []);

  const value = {
    // State
    status,
    gazePosition,
    confidence,
    confidenceLevel,
    calibrationResult,
    isCalibrated,
    fps,
    lastGesture,
    ear,
    error,

    // Calibration UI state
    isCalibrating,
    calibrationPointIndex,
    calibrationTotal,
    calibrationSampling,

    // Actions
    startGaze,
    stopGaze,
    startCalibration,
    dismissCalibrationResult,
    inputMode,
    setInputMode,
    setBlinkThreshold,
    
    // Session Testing
    activeSessionId,
    startTestSession: async () => {
      if (!currentUser) return;
      try {
        const id = await sessionLogger.startSession(currentUser.uid);
        setActiveSessionId(id);
      } catch (err) {
        console.error(err);
      }
    },
    stopTestSession: async () => {
      await sessionLogger.endSession();
      setActiveSessionId(null);
    }
  };

  return (
    <GazeContext.Provider value={value}>
      {children}
    </GazeContext.Provider>
  );
}

export function useGaze() {
  const context = useContext(GazeContext);
  if (!context) throw new Error('useGaze must be used within a GazeProvider');
  return context;
}
