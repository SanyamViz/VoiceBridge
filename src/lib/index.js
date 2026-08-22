/**
 * Common Utilities and Helpers
 */

/**
 * Clamp a number within inclusive bounds
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Exponential moving average filter for gaze smoothing
 */
export function exponentialSmoothing(current, target, alpha = 0.2) {
  return current + alpha * (target - current);
}
