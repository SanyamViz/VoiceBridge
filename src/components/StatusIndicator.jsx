import React from 'react';
import { Activity, Eye, Zap, AlertTriangle, RefreshCw, Hand } from 'lucide-react';
import { useGaze } from '../context/GazeContext';
import { GAZE_STATUS } from '../features/gaze/gazeEngine';
import { CONFIDENCE_LEVEL } from '../features/gaze/confidenceTracker';
import { BLINK_GESTURE } from '../features/gaze/blinkDetector';

const GESTURE_LABELS = {
  [BLINK_GESTURE.SINGLE]: '👁 Single — Confirm',
  [BLINK_GESTURE.DOUBLE]: '👁👁 Double — Cancel',
  [BLINK_GESTURE.TRIPLE]: '🚨 Triple — EMERGENCY',
  [BLINK_GESTURE.HOLD]: '⏸ Hold — Mute/Pause'
};

export function StatusIndicator() {
  const {
    status,
    confidence,
    confidenceLevel,
    fps,
    isCalibrated,
    calibrationResult,
    lastGesture,
    ear,
    startCalibration,
    startGaze,
    stopGaze,
    error,
    inputMode,
    setInputMode,
    setBlinkThreshold,
    activeSessionId,
    startTestSession,
    stopTestSession
  } = useGaze();

  const [localThreshold, setLocalThreshold] = React.useState(
    () => parseFloat(localStorage.getItem('voicebridge_blink_threshold') || '0.45')
  );

  const handleThresholdChange = (e) => {
    const val = parseFloat(e.target.value);
    setLocalThreshold(val);
    setBlinkThreshold(val);
  };

  const getStatusColor = () => {
    switch (status) {
      case GAZE_STATUS.TRACKING:
        return confidenceLevel === CONFIDENCE_LEVEL.GOOD ? 'status-optimal' :
               confidenceLevel === CONFIDENCE_LEVEL.DEGRADED ? 'status-degraded' : 'status-warning';
      case GAZE_STATUS.CALIBRATING: return 'status-calibrating';
      case GAZE_STATUS.LOST:        return 'status-warning';
      case GAZE_STATUS.ERROR:       return 'status-danger';
      case GAZE_STATUS.INITIALIZING: return 'status-calibrating';
      default:                      return 'status-ready';
    }
  };

  const getConfidenceBarColor = () => {
    if (confidenceLevel === CONFIDENCE_LEVEL.GOOD) return 'var(--accent-emerald)';
    if (confidenceLevel === CONFIDENCE_LEVEL.DEGRADED) return 'var(--accent-amber)';
    return 'var(--accent-rose)';
  };

  // Gesture display (fade after 2s)
  const gestureAge = lastGesture ? Date.now() - lastGesture.timestamp : Infinity;
  const showGesture = gestureAge < 2000;
  
  const showTouchFallbackOption = inputMode === 'gaze' && (status === GAZE_STATUS.LOST || confidenceLevel === CONFIDENCE_LEVEL.POOR);

  return (
    <div className={`status-card ${getStatusColor()}`} id="tracking-status-bar">
      {/* Tracking Status */}
      <div className="status-item">
        <Activity size={18} className={status === GAZE_STATUS.TRACKING ? 'icon-pulse' : ''} />
        <span className="status-label">Gaze:</span>
        <span className="status-value">{status}</span>
      </div>

      <div className="status-divider" />

      {/* Confidence Bar */}
      <div className="status-item confidence-item">
        <Eye size={18} />
        <span className="status-label">Confidence:</span>
        <div className="confidence-bar-container">
          <div
            className="confidence-bar-fill"
            style={{
              width: `${Math.round(confidence * 100)}%`,
              backgroundColor: getConfidenceBarColor()
            }}
          />
        </div>
        <span className="status-value">{Math.round(confidence * 100)}%</span>
      </div>

      <div className="status-divider" />

      {/* Blink / EAR */}
      <div className="status-item">
        <Zap size={18} />
        <span className="status-label">Blink:</span>
        <span className="status-value">
          {showGesture
            ? GESTURE_LABELS[lastGesture.gesture] || lastGesture.gesture
            : (ear >= 0 ? `EAR ${ear.toFixed(2)}` : 'Idle')
          }
        </span>
      </div>

      <div className="status-divider" />

      {/* FPS */}
      <div className="status-item">
        <span className="status-label">FPS:</span>
        <span className="status-value">{fps || '—'}</span>
      </div>

      <div className="status-divider" />

      {/* Actions */}
      <div className="status-item status-actions">
        {status === GAZE_STATUS.UNINITIALIZED && (
          <button className="btn-primary btn-sm" id="start-gaze-btn" onClick={startGaze}>
            Start Camera
          </button>
        )}
        {(status === GAZE_STATUS.TRACKING || status === GAZE_STATUS.LOST) && (
          <>
            <button className="btn-secondary btn-sm" id="calibrate-btn" onClick={startCalibration}>
              <RefreshCw size={14} style={{ marginRight: '4px' }} />
              {isCalibrated ? 'Recalibrate' : 'Calibrate'}
            </button>
            <button className="btn-secondary btn-sm" id="stop-gaze-btn" onClick={stopGaze}>
              Stop
            </button>
          </>
        )}
      </div>
      
      {/* Test Session Actions */}
      <div className="status-item status-actions" style={{ marginTop: '8px' }}>
        {!activeSessionId ? (
          <button className="btn-primary btn-sm" style={{ backgroundColor: 'var(--accent-purple)' }} onClick={startTestSession}>
            Start Test Session
          </button>
        ) : (
          <button className="btn-secondary btn-sm" style={{ borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }} onClick={stopTestSession}>
            End Test Session
          </button>
        )}
      </div>

      {/* Blink Threshold Tuning */}
      {status === GAZE_STATUS.TRACKING && (
        <div className="status-item" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)' }}>
            <span>Blink Sens. (EAR)</span>
            <span>{localThreshold.toFixed(2)}</span>
          </div>
          <input 
            type="range" 
            min="0.20" max="0.60" step="0.01" 
            value={localThreshold} 
            onChange={handleThresholdChange}
            style={{ marginTop: '4px', cursor: 'pointer' }}
          />
        </div>
      )}

      {/* Tracking Lost Warning */}
      {status === GAZE_STATUS.LOST && (
        <div className="tracking-lost-banner" id="tracking-lost-banner">
          <AlertTriangle size={16} />
          <span>Face tracking lost — adjust position or lighting</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="tracking-error-banner" id="tracking-error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}
      
      {/* Touch Fallback Toggle */}
      {showTouchFallbackOption && (
        <div 
          className="tracking-lost-banner" 
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'var(--accent-amber)', color: '#fff', cursor: 'pointer', marginTop: '8px' }} 
          onClick={() => setInputMode('touch')}
        >
          <Hand size={16} className="icon-amber" />
          <span>Gaze tracking unstable. <strong>Tap here to switch to Touch Fallback.</strong></span>
        </div>
      )}

      {inputMode === 'touch' && (
        <div 
          className="tracking-lost-banner" 
          style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--accent-emerald)', color: '#fff', cursor: 'pointer', marginTop: '8px' }} 
          onClick={() => setInputMode('gaze')}
        >
          <Hand size={16} className="icon-emerald" />
          <span><strong>Touch Mode Active.</strong> Tap here to resume Gaze Tracking.</span>
        </div>
      )}
    </div>
  );
}
