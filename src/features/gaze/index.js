/**
 * Feature: Gaze + Blink (shared MediaPipe pipeline)
 *
 * Barrel re-export for all gaze/blink modules.
 */

export { GAZE_STATUS, LANDMARKS, GazeEngine, getEyePosition, smoothValue } from './gazeEngine.js';
export {
  CALIBRATION_POINTS_9,
  CALIBRATION_POINTS_5,
  linearRegression,
  rejectOutliers,
  averageSamples,
  computeCalibration,
  mapToScreen,
  computeAccuracy,
  runCalibration
} from './calibration.js';
export { CONFIDENCE_LEVEL, getConfidenceLevel, ConfidenceTracker } from './confidenceTracker.js';
export { BLINK_GESTURE, computeEAR, computeAvgEAR, BlinkDetector } from './blinkDetector.js';
