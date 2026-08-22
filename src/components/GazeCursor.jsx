import React from 'react';
import { useGaze } from '../context/GazeContext';
import { GAZE_STATUS } from '../features/gaze/gazeEngine';

/**
 * Gaze cursor — rendered on screen at the tracked gaze position.
 * Auto-hides when tracking is lost or not calibrated.
 */
export function GazeCursor() {
  const { gazePosition, status, isCalibrated, isCalibrating } = useGaze();

  // Don't show cursor during calibration, when not calibrated, or when tracking lost
  const shouldShow =
    isCalibrated &&
    !isCalibrating &&
    gazePosition.valid &&
    (status === GAZE_STATUS.TRACKING);

  if (!shouldShow) return null;

  return (
    <div
      className="gaze-cursor"
      id="gaze-cursor"
      style={{
        left: `${gazePosition.x}px`,
        top: `${gazePosition.y}px`
      }}
    />
  );
}
