/**
 * BlinkDetector — Eyelid-landmark EAR (Eye Aspect Ratio) blink detection,
 * sharing the same FaceLandmarker instance/frame loop as gaze.
 *
 * Blink gesture mapping (per VoiceBridge rules — do not change without explicit instruction):
 *   Single blink  → Confirm / Select
 *   Double blink  → Cancel / Back
 *   Triple blink  → Emergency Shortcut
 *   Hold blink    → Mute / Pause
 */

import { LANDMARKS } from './gazeEngine.js';
import { sessionLogger } from '../patient/sessionLogger.js';

// ─── Blink Gestures ──────────────────────────────────────────────────────────

export const BLINK_GESTURE = {
  SINGLE: 'SINGLE',   // confirm
  
  // Safety-Critical: DOUBLE triggers the emergency alert.
  // Fallback path: For patients with poor blink control, an alternative
  // trigger mechanism (e.g. prolonged gaze dwell in a specific emergency zone)
  // MUST be provided in the UI layer (Phase 4/5).
  DOUBLE: 'DOUBLE',   
  
  HOLD:   'HOLD'      // mute/pause
};

// ─── Blendshape Computation ───────────────────────────────────────────────────

/**
 * Extract a specific blendshape score from the FaceLandmarker output.
 */
function blendshapeScore(blendshapes, name) {
  if (!blendshapes || !blendshapes.categories) return null;
  const category = blendshapes.categories.find(c => c.categoryName === name);
  return category ? category.score : null;
}

// ─── BlinkDetector Class ─────────────────────────────────────────────────────

export class BlinkDetector {
  /**
   * @param {object} opts
   * @param {number} opts.blinkThreshold — blendshape score above this = eyes closed (default: 0.45). SHOULD BE TUNED PER PATIENT.
   * @param {number} opts.minBlinkMs — min duration to count as a voluntary blink (default: 150ms) to filter involuntary blinks
   * @param {number} opts.singleMaxMs — max duration for a single blink close (default: 400)
   * @param {number} opts.doubleWindowMs — window to detect 2nd blink (default: 800)
   * @param {number} opts.tripleWindowMs — window to detect 3rd blink (default: 1200)
   * @param {number} opts.holdMinMs — min duration for hold blink (default: 1500)
   * @param {number} opts.minConfidence — suppress gestures below this confidence (default: 0.4)
   */
  constructor(opts = {}) {
    this._blinkThreshold = opts.blinkThreshold || 0.45;
    this._minBlinkMs    = opts.minBlinkMs    || 150;
    this._singleMaxMs   = opts.singleMaxMs   || 400;
    this._doubleWindowMs = opts.doubleWindowMs || 800;
    this._tripleWindowMs = opts.tripleWindowMs || 1200;
    this._holdMinMs     = opts.holdMinMs     || 1500;
    this._minConfidence = opts.minConfidence || 0.4;

    // State
    this._eyesClosed = false;
    this._closeStartTime = 0;
    this._recentBlinks = [];  // timestamps of recent blink completions
    this._lastGestureTime = performance.now();
    this._pendingGestureTimer = null;
    this._holdFired = false;

    // External state
    this._confidence = 1;

    // Listeners
    this._gestureListeners = new Set();
    this._scoreListeners = new Set(); // for debug UI
  }

  get isEyesClosed() {
    return this._eyesClosed;
  }

  /** Subscribe to gesture events: callback(gesture) */
  onGesture(cb) {
    this._gestureListeners.add(cb);
    return () => this._gestureListeners.delete(cb);
  }

  /** Subscribe to blink score updates: callback(score, isClosed) */
  onBlinkScore(cb) {
    this._scoreListeners.add(cb);
    return () => this._scoreListeners.delete(cb);
  }

  /** Update current confidence (from ConfidenceTracker) */
  setConfidence(c) {
    this._confidence = c;
  }
  
  /** Update the blink threshold (for per-patient tuning) */
  setBlinkThreshold(val) {
    this._blinkThreshold = val;
  }

  /**
   * Process a frame's landmarks and blendshapes. Called by GazeEngine's onLandmarks dispatch.
   * @param {Array} landmarks — face landmarks array
   * @param {number} timestamp — performance.now()
   * @param {object} blendshapes — face blendshapes from MediaPipe
   */
  processFrame(landmarks, timestamp, blendshapes) {
    const leftScore = blendshapeScore(blendshapes, 'eyeBlinkLeft');
    const rightScore = blendshapeScore(blendshapes, 'eyeBlinkRight');

    if (leftScore === null || rightScore === null) {
      // Invalid blendshapes — can't determine blink state
      for (const cb of this._scoreListeners) cb(-1, false);
      return;
    }

    const score = (leftScore + rightScore) / 2;
    const isClosed = score > this._blinkThreshold;

    // Emit score for debug
    for (const cb of this._scoreListeners) cb(score, isClosed);

    // ── State Machine ──

    if (isClosed && !this._eyesClosed) {
      // Eyes just closed
      this._eyesClosed = true;
      this._closeStartTime = timestamp;
      this._holdFired = false;

    } else if (isClosed && this._eyesClosed) {
      // Eyes still closed — check for hold
      const closeDuration = timestamp - this._closeStartTime;
      if (closeDuration >= this._holdMinMs && !this._holdFired) {
        this._holdFired = true;
        this._fireGesture(BLINK_GESTURE.HOLD);
        // Clear recent blinks — hold supersedes multi-blink
        this._recentBlinks = [];
        this._pendingGestureTimer = null;
      }

    } else if (!isClosed && this._eyesClosed) {
      // Eyes just opened — blink completed
      this._eyesClosed = false;
      const closeDuration = timestamp - this._closeStartTime;

      // Only count as a blink if it was short enough (not a hold) and long enough (not involuntary)
      if (closeDuration < this._holdMinMs && closeDuration >= this._minBlinkMs) {
        this._recentBlinks.push(timestamp);

        // Prune old blinks outside the triple window
        const cutoff = timestamp - this._tripleWindowMs;
        this._recentBlinks = this._recentBlinks.filter(t => t > cutoff);

        // Cancel any pending gesture timer
        this._pendingGestureTimer = null;

        const count = this._recentBlinks.length;

        if (count >= 2) {
          // Double blink — fire immediately (safety-critical: don't add latency)
          this._fireGesture(BLINK_GESTURE.DOUBLE);
          this._recentBlinks = [];
        } else {
          // Wait to see if more blinks are coming
          this._pendingGestureTimer = timestamp + this._doubleWindowMs;
        }
      }
    } else {
      // Check for pending gestures that have timed out
      if (this._recentBlinks.length === 1 && this._pendingGestureTimer && timestamp >= this._pendingGestureTimer) {
        this._fireGesture(BLINK_GESTURE.SINGLE);
        this._recentBlinks = [];
        this._pendingGestureTimer = null;
      }
    }
  }

  _fireGesture(gesture) {
    // Safety-Critical: DOUBLE blink (emergency shortcut) bypasses gaze-tracking confidence gate.
    // Eyelid landmark EAR calculation is inherently decoupled from iris gaze regression confidence.
    // In distress/low-light/head-movement situations where gaze confidence tanks, emergency alerting
    // MUST remain accessible as long as eyelid landmarks are valid.
    if (gesture !== BLINK_GESTURE.DOUBLE && this._confidence < this._minConfidence) {
      return;
    }
    
    sessionLogger.logGestureDetected();
    for (const cb of this._gestureListeners) cb(gesture);
  }

  /** Reset state */
  reset() {
    this._eyesClosed = false;
    this._closeStartTime = 0;
    this._recentBlinks = [];
    this._holdFired = false;
    this._pendingGestureTimer = null;
  }
}
