import React from 'react';
import { useGaze } from '../context/GazeContext';
import { CALIBRATION_POINTS_9 } from '../features/gaze/calibration';

/**
 * Full-screen calibration overlay with animated dots, progress, and accuracy result.
 */
export function CalibrationOverlay() {
  const {
    isCalibrating,
    calibrationPointIndex,
    calibrationTotal,
    calibrationSampling,
    calibrationResult,
    isCalibrated,
    startCalibration,
    dismissCalibrationResult
  } = useGaze();

  // Show accuracy result after calibration completes
  const showResult = calibrationResult && !isCalibrating;
  const accuracy = calibrationResult?.accuracy;
  const cal = calibrationResult?.calibration;

  if (!isCalibrating && !showResult) return null;

  // During calibration: show the overlay with dots
  if (isCalibrating) {
    const points = CALIBRATION_POINTS_9;
    const currentPoint = points[calibrationPointIndex] || null;

    return (
      <div className="calibration-overlay" id="calibration-overlay">
        <div className="calibration-message">
          <h2>Calibration</h2>
          <p>
            Look at the pulsing dot.
            <br />
            <span className="calibration-progress">
              Point {calibrationPointIndex + 1} of {calibrationTotal}
            </span>
          </p>
          {calibrationSampling && (
            <span className="calibration-sampling-badge">Sampling...</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="calibration-progress-bar">
          <div
            className="calibration-progress-fill"
            style={{ width: `${((calibrationPointIndex + 1) / calibrationTotal) * 100}%` }}
          />
        </div>

        {/* Render all points dimmed, current point highlighted */}
        {points.map((pt, i) => (
          <div
            key={i}
            className={`calibration-dot ${i === calibrationPointIndex ? 'active' : ''} ${i < calibrationPointIndex ? 'done' : ''} ${calibrationSampling && i === calibrationPointIndex ? 'sampling' : ''}`}
            style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
          />
        ))}
      </div>
    );
  }

  // After calibration: show result
  if (showResult) {
    return (
      <div className="calibration-result-overlay" id="calibration-result-overlay">
        <div className="calibration-result-card">
          <h2>Calibration {accuracy?.pass ? 'Successful' : 'Needs Improvement'}</h2>

          <div className={`accuracy-score-ring ${accuracy?.pass ? 'pass' : 'fail'}`}>
            <span className="accuracy-score-value">{accuracy?.score ?? 0}</span>
            <span className="accuracy-score-label">/ 100</span>
          </div>

          <div className="accuracy-details">
            <div className="accuracy-stat">
              <span className="accuracy-stat-label">Mean Error</span>
              <span className="accuracy-stat-value">{accuracy?.meanErrorPx ?? '—'}px</span>
            </div>
            <div className="accuracy-stat">
              <span className="accuracy-stat-label">Max Error</span>
              <span className="accuracy-stat-value">{accuracy?.maxErrorPx ?? '—'}px</span>
            </div>
            <div className="accuracy-stat">
              <span className="accuracy-stat-label">Points Captured</span>
              <span className="accuracy-stat-value">{cal?.pointsCaptured ?? 0} / {calibrationTotal}</span>
            </div>
          </div>

          {!accuracy?.pass && (
            <p className="accuracy-warning">
              Accuracy is below the usable threshold. Try recalibrating in better lighting with your head steady.
            </p>
          )}

          <div className="calibration-result-actions">
            <button
              className="btn-primary"
              id="calibration-dismiss-btn"
              onClick={dismissCalibrationResult}
            >
              {accuracy?.pass ? 'Start Using VoiceBridge' : 'Continue Anyway'}
            </button>
            <button
              className="btn-secondary"
              id="calibration-retry-btn"
              onClick={startCalibration}
            >
              Recalibrate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
