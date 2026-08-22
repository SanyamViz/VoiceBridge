/**
 * ConfidenceTracker — Rolling tracking confidence (0..1) based on
 * face detection rate, gaze stability, and calibration age.
 *
 * Thresholds:
 *   > 0.7  = GOOD (green)
 *   0.4..0.7 = DEGRADED (amber)
 *   < 0.4  = POOR (red / effectively LOST)
 */

export const CONFIDENCE_LEVEL = {
  GOOD: 'GOOD',
  DEGRADED: 'DEGRADED',
  POOR: 'POOR'
};

export function getConfidenceLevel(confidence) {
  if (confidence > 0.7) return CONFIDENCE_LEVEL.GOOD;
  if (confidence >= 0.4) return CONFIDENCE_LEVEL.DEGRADED;
  return CONFIDENCE_LEVEL.POOR;
}

export class ConfidenceTracker {
  /**
   * @param {object} opts
   * @param {number} opts.windowMs — time window for rolling average (default 2000ms)
   * @param {number} opts.stabilityWindowMs — time window for gaze stability (default 1000ms)
   * @param {number} opts.calibrationDecayMs — time after which calibration confidence decays (default 300000ms = 5 min)
   */
  constructor(opts = {}) {
    this._windowMs = opts.windowMs || 2000;
    this._stabilityWindowMs = opts.stabilityWindowMs || 1000;
    this._calibrationDecayMs = opts.calibrationDecayMs || 300000;

    // Ring buffers for detection events
    this._detections = [];     // { timestamp, detected: bool }
    this._gazeHistory = [];    // { timestamp, x, y }

    this._calibrationTimestamp = 0;
    this._confidence = 0;
    this._level = CONFIDENCE_LEVEL.POOR;

    this._listeners = new Set();
  }

  /** Subscribe to confidence changes: callback(confidence, level) */
  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  get confidence() { return this._confidence; }
  get level() { return this._level; }

  /** Record that the calibration just completed */
  setCalibrated() {
    this._calibrationTimestamp = performance.now();
  }

  /**
   * Record a detection frame.
   * @param {boolean} detected — whether face was detected this frame
   * @param {number} timestamp — performance.now()
   * @param {{x: number, y: number}|null} gazePos — current gaze position (normalized)
   */
  recordFrame(detected, timestamp, gazePos = null) {
    this._detections.push({ timestamp, detected });
    if (gazePos && detected) {
      this._gazeHistory.push({ timestamp, x: gazePos.x, y: gazePos.y });
    }

    // Prune old entries
    const cutoff = timestamp - this._windowMs;
    const stabilityCutoff = timestamp - this._stabilityWindowMs;

    while (this._detections.length > 0 && this._detections[0].timestamp < cutoff) {
      this._detections.shift();
    }
    while (this._gazeHistory.length > 0 && this._gazeHistory[0].timestamp < stabilityCutoff) {
      this._gazeHistory.shift();
    }

    // Compute confidence
    this._updateConfidence(timestamp);
  }

  _updateConfidence(now) {
    // 1. Detection rate (0..1): what % of recent frames had a face detected
    const detectionRate = this._computeDetectionRate();

    // 2. Gaze stability (0..1): inverse of variance — high variance = low stability
    const stability = this._computeStability();

    // 3. Calibration freshness (0..1): decays over time
    const freshness = this._computeCalibrationFreshness(now);

    // Weighted combination
    const confidence = 0.5 * detectionRate + 0.3 * stability + 0.2 * freshness;

    const clamped = Math.max(0, Math.min(1, confidence));
    const level = getConfidenceLevel(clamped);

    if (Math.abs(clamped - this._confidence) > 0.01 || level !== this._level) {
      this._confidence = clamped;
      this._level = level;
      for (const cb of this._listeners) cb(this._confidence, this._level);
    }
  }

  _computeDetectionRate() {
    if (this._detections.length === 0) return 0;
    const detected = this._detections.filter(d => d.detected).length;
    return detected / this._detections.length;
  }

  _computeStability() {
    if (this._gazeHistory.length < 3) return 0.5; // not enough data → medium

    let sumX = 0, sumY = 0;
    for (const g of this._gazeHistory) {
      sumX += g.x;
      sumY += g.y;
    }
    const meanX = sumX / this._gazeHistory.length;
    const meanY = sumY / this._gazeHistory.length;

    let varSum = 0;
    for (const g of this._gazeHistory) {
      const dx = g.x - meanX;
      const dy = g.y - meanY;
      varSum += dx * dx + dy * dy;
    }
    const variance = varSum / this._gazeHistory.length;

    // Map variance to stability: 0 variance → 1.0, high variance → 0.0
    // Typical eye jitter variance is around 0.001-0.01 in normalized coords
    const stability = Math.max(0, 1 - variance * 100);
    return Math.min(1, stability);
  }

  _computeCalibrationFreshness(now) {
    if (this._calibrationTimestamp === 0) return 0;
    const age = now - this._calibrationTimestamp;
    if (age <= 0) return 1;
    // Linear decay over calibrationDecayMs
    return Math.max(0, 1 - age / this._calibrationDecayMs);
  }

  /** Reset all state */
  reset() {
    this._detections = [];
    this._gazeHistory = [];
    this._calibrationTimestamp = 0;
    this._confidence = 0;
    this._level = CONFIDENCE_LEVEL.POOR;
  }
}
