/**
 * Calibration — 9-point calibration with linear regression, outlier rejection,
 * and post-calibration accuracy verification.
 *
 * Safety-critical: tests required for regression math and accuracy scoring.
 */

import { getEyePosition } from './gazeEngine.js';

// ─── Calibration Point Positions (normalized 0..1) ───────────────────────────

export const CALIBRATION_POINTS_9 = [
  { x: 0.08, y: 0.08 },
  { x: 0.50, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.08, y: 0.50 },
  { x: 0.50, y: 0.50 },
  { x: 0.92, y: 0.50 },
  { x: 0.08, y: 0.92 },
  { x: 0.50, y: 0.92 },
  { x: 0.92, y: 0.92 }
];

export const CALIBRATION_POINTS_5 = [
  { x: 0.50, y: 0.50 },
  { x: 0.10, y: 0.10 },
  { x: 0.90, y: 0.10 },
  { x: 0.10, y: 0.90 },
  { x: 0.90, y: 0.90 }
];

// ─── Ridge-Regularized Least Squares (Polynomial Features) ────────────

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col] || 1e-9;
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

function leastSquares(featureRows, targets) {
  const n = featureRows[0].length;
  const ata = Array.from({ length: n }, () => new Array(n).fill(0));
  const atb = new Array(n).fill(0);
  featureRows.forEach((f, idx) => {
    for (let i = 0; i < n; i++) {
      atb[i] += f[i] * targets[idx];
      for (let j = 0; j < n; j++) ata[i][j] += f[i] * f[j];
    }
  });
  for (let i = 1; i < n; i++) ata[i][i] += 1.0; // ridge term (skip intercept)
  return solve(ata, atb);
}

function mean(values) { return values.reduce((a, b) => a + b, 0) / values.length; }
function stddev(values) { const m = mean(values); return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length); }
export function median(values) { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function polyRow(norm, poseVal) { return [1, norm, poseVal]; }

/**
 * Filter a raw sample array during capture. We take the median of the samples
 * collected while looking at a dot to throw out blinks or micro-saccades.
 */
export function medianFeature(samples) {
  if (!samples || samples.length === 0) return null;
  return {
    eyeX: median(samples.map(s => s.x)),
    eyeY: median(samples.map(s => s.y)),
    yaw: median(samples.map(s => s.yaw)),
    pitch: median(samples.map(s => s.pitch))
  };
}

/**
 * Compute the full polynomial regression model.
 * Samples must contain { eyeX, eyeY, yaw, pitch, targetX, targetY }.
 */
export function computeCalibration(samples, screenWidth, screenHeight) {
  if (samples.length < 3) {
    return { valid: false, pointsCaptured: samples.length };
  }

  const xs = samples.map(r => r.eyeX);
  const ys = samples.map(r => r.eyeY);
  const yaws = samples.map(r => r.yaw);
  const pitches = samples.map(r => r.pitch);
  
  // Independent standardizations
  const stdX = { mean: mean(xs), std: Math.max(stddev(xs), 1e-4) };
  const stdY = { mean: mean(ys), std: Math.max(stddev(ys), 1e-4) };
  const stdYaw = { mean: mean(yaws), std: Math.max(stddev(yaws), 1e-4) };
  const stdPitch = { mean: mean(pitches), std: Math.max(stddev(pitches), 1e-4) };

  const rowsX = [], rowsY = [], targetsX = [], targetsY = [];
  samples.forEach(r => {
    const nx = (r.eyeX - stdX.mean) / stdX.std;
    const ny = (r.eyeY - stdY.mean) / stdY.std;
    const nyaw = (r.yaw - stdYaw.mean) / stdYaw.std;
    const npitch = (r.pitch - stdPitch.mean) / stdPitch.std;
    rowsX.push(polyRow(nx, nyaw)); targetsX.push(r.targetX * screenWidth);
    rowsY.push(polyRow(ny, npitch)); targetsY.push(r.targetY * screenHeight);
  });

  const wx = leastSquares(rowsX, targetsX);
  const wy = leastSquares(rowsY, targetsY);

  let sqErr = 0;
  samples.forEach(r => {
    const nx = (r.eyeX - stdX.mean) / stdX.std;
    const ny = (r.eyeY - stdY.mean) / stdY.std;
    const nyaw = (r.yaw - stdYaw.mean) / stdYaw.std;
    const npitch = (r.pitch - stdPitch.mean) / stdPitch.std;
    
    const px = wx[0]*1 + wx[1]*nx + wx[2]*nyaw;
    const py = wy[0]*1 + wy[1]*ny + wy[2]*npitch;
    
    // px/py are in screen pixels. Compare to target screen pixels.
    const tX = r.targetX * screenWidth;
    const tY = r.targetY * screenHeight;
    sqErr += (px - tX) ** 2 + (py - tY) ** 2;
  });
  
  const rmse = Math.sqrt(sqErr / samples.length);

  return {
    valid: true,
    pointsCaptured: samples.length,
    model: { wx, wy, stdX, stdY, stdYaw, stdPitch },
    rmse
  };
}

// ─── Screen Position Mapping ─────────────────────────────────────────────────

let smoothBuf = [];
const SMOOTH_BUFFER_SIZE = 5;

/**
 * Map live eye position to screen coordinates using the polynomial model.
 * Applies rolling median filter unless disableSmoothing is true.
 */
export function mapToScreen(eyeX, eyeY, yaw, pitch, calibration, disableSmoothing = false) {
  if (!calibration || !calibration.valid || !calibration.model) {
    smoothBuf = [];
    return { x: 0, y: 0, valid: false };
  }

  const { wx, wy, stdX, stdY, stdYaw, stdPitch } = calibration.model;
  
  const nx = (eyeX - stdX.mean) / stdX.std;
  const ny = (eyeY - stdY.mean) / stdY.std;
  
  // Backwards compatibility with old calibrations missing head pose standardization
  const nyaw = stdYaw ? (yaw - stdYaw.mean) / stdYaw.std : yaw;
  const npitch = stdPitch ? (pitch - stdPitch.mean) / stdPitch.std : pitch;
  
  const px = wx[0]*1 + wx[1]*nx + wx[2]*nyaw;
  const py = wy[0]*1 + wy[1]*ny + wy[2]*npitch;

  const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const h = typeof window !== 'undefined' ? window.innerHeight : 1080;

  // Clamp raw prediction
  const clampedX = Math.max(0, Math.min(w, px));
  const clampedY = Math.max(0, Math.min(h, py));
  
  if (disableSmoothing) {
    return { x: clampedX, y: clampedY, valid: true };
  }

  // Rolling median filter
  smoothBuf.push({ x: clampedX, y: clampedY });
  if (smoothBuf.length > SMOOTH_BUFFER_SIZE) smoothBuf.shift();
  
  const medX = median(smoothBuf.map(s => s.x));
  const medY = median(smoothBuf.map(s => s.y));

  return { 
    x: medX, 
    y: medY, 
    valid: true 
  };
}

// ─── Accuracy Scoring ────────────────────────────────────────────────────────

/**
 * Compute calibration accuracy from verification samples.
 *
 * @param {Array<{targetX, targetY, measuredX, measuredY}>} verificationPoints
 *   Each point has target (normalized 0..1) and measured screen pixel coords.
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {{ score, meanErrorPx, maxErrorPx, pass }}
 *   score: 0..100 (100 = perfect)
 *   pass: true if score >= 40
 */
export function computeAccuracy(verificationPoints, screenWidth, screenHeight) {
  if (verificationPoints.length === 0) {
    return { score: 0, meanErrorPx: Infinity, maxErrorPx: Infinity, pass: false };
  }

  let totalError = 0;
  let maxError = 0;

  for (const pt of verificationPoints) {
    const targetPxX = pt.targetX * screenWidth;
    const targetPxY = pt.targetY * screenHeight;
    const dx = pt.measuredX - targetPxX;
    const dy = pt.measuredY - targetPxY;
    const error = Math.sqrt(dx * dx + dy * dy);
    totalError += error;
    maxError = Math.max(maxError, error);
  }

  const meanErrorPx = totalError / verificationPoints.length;

  // Score: 100 at 0 error, 0 at diagonal/2 error
  const diagonal = Math.sqrt(screenWidth * screenWidth + screenHeight * screenHeight);
  const maxReasonableError = diagonal * 0.25; // quarter of diagonal
  const score = Math.max(0, Math.min(100,
    Math.round(100 * (1 - meanErrorPx / maxReasonableError))
  ));

  return {
    score,
    meanErrorPx: Math.round(meanErrorPx),
    maxErrorPx: Math.round(maxError),
    pass: score >= 40
  };
}

// ─── Calibration Runner ──────────────────────────────────────────────────────

/**
 * Run the full calibration sequence.
 * This is a high-level orchestrator meant to be called from React.
 *
 * @param {object} opts
 * @param {object} opts.faceLandmarker — MediaPipe FaceLandmarker instance
 * @param {HTMLVideoElement} opts.video
 * @param {Array} opts.points — calibration positions (default: 9-point)
 * @param {function} opts.onPoint — callback(pointIndex, total) for UI updates
 * @param {function} opts.onSampling — callback(pointIndex) when sampling begins
 * @param {number} opts.settleMs — ms to wait for user to look at point (default: 1200)
 * @param {number} opts.sampleMs — ms to sample eye position (default: 1000)
 * @returns {Promise<{calibration, accuracy}>}
 */
export async function runCalibration(opts) {
  const {
    faceLandmarker,
    video,
    points = CALIBRATION_POINTS_9,
    onPoint,
    onSampling,
    settleMs = 1200,
    sampleMs = 1000
  } = opts;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const calibrationSamples = [];

  for (let i = 0; i < points.length; i++) {
    const target = points[i];

    // Notify UI
    if (onPoint) onPoint(i, points.length);

    // Settle time — let user move eyes to target
    await sleep(settleMs);

    // Notify UI that sampling started
    if (onSampling) onSampling(i);

    // Collect samples
    const frameSamples = [];
    const sampleStart = performance.now();

    while (performance.now() - sampleStart < sampleMs) {
      if (faceLandmarker && video.readyState >= 2) {
        try {
          const result = faceLandmarker.detectForVideo(video, performance.now());
          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            const eyePos = getEyePosition(result.faceLandmarks[0]);
            if (eyePos.valid) {
              frameSamples.push(eyePos);
            }
          }
        } catch (err) {
          console.warn('[Calibration] Detection error at point', i, err);
        }
      }
      await sleep(30);
    }

    // Median filter with outlier rejection
    const avg = medianFeature(frameSamples);
    if (avg) {
      calibrationSamples.push({
        targetX: target.x,
        targetY: target.y,
        eyeX: avg.eyeX,
        eyeY: avg.eyeY,
        yaw: avg.yaw,
        pitch: avg.pitch,
        sampleCount: frameSamples.length
      });
    }
  }

  // Compute calibration
  const screenWidth  = window.innerWidth;
  const screenHeight = window.innerHeight;
  const calibration = computeCalibration(calibrationSamples, screenWidth, screenHeight);

  // Run accuracy verification (use the same calibration points as verification)
  let accuracy = { score: 0, meanErrorPx: 0, maxErrorPx: 0, pass: false };
  if (calibration.valid) {
    const verificationPoints = calibrationSamples.map(s => {
      const mapped = mapToScreen(s.eyeX, s.eyeY, s.yaw, s.pitch, calibration, true); // disableSmoothing
      return {
        targetX: s.targetX,
        targetY: s.targetY,
        measuredX: mapped.x,
        measuredY: mapped.y
      };
    });
    accuracy = computeAccuracy(verificationPoints, screenWidth, screenHeight);
  }

  return {
    calibration: {
      ...calibration,
      accuracyScore: accuracy.score,
      timestamp: Date.now()
    },
    accuracy
  };
}
