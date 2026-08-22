import { useState, useEffect, useRef, useCallback } from 'react';
import { useGaze } from '../../context/GazeContext';
import { BLINK_GESTURE } from '../gaze/blinkDetector';
import { GAZE_STATUS } from '../gaze/gazeEngine';
import { sessionLogger } from '../patient/sessionLogger';

/**
 * useDwellTracker
 * Tracks gaze position over DOM elements marked with data-dwell-target="true"
 * and data-phrase-id="...".
 * 
 * @param {object} opts
 * @param {number} opts.dwellTimeMs - Time required to select an item (default 1500)
 * @param {Function} opts.onSelect - Callback fired when item is selected: (phraseId) => void
 */
export function useDwellTracker({ dwellTimeMs = 1500, onSelect }) {
  const { gazePosition, confidence, status, lastGesture, inputMode } = useGaze();

  const [hoveredId, setHoveredId] = useState(null);
  const [progress, setProgress] = useState(0);

  // Mutable refs for the loop
  const stateRef = useRef({
    hoveredId: null,
    startTime: 0,
    progress: 0,
    lastTick: 0,
    pausedElapsed: 0 // Accumulated time when paused
  });

  // Handle single-blink confirmation
  useEffect(() => {
    if (lastGesture && lastGesture.gesture === BLINK_GESTURE.SINGLE) {
      // Prevent stale gesture triggers (gesture must be recent)
      const isRecent = Date.now() - lastGesture.timestamp < 500;
      if (isRecent && stateRef.current.hoveredId) {
        // Instant confirm
        const id = stateRef.current.hoveredId;
        
        // Reset state
        stateRef.current.hoveredId = null;
        stateRef.current.startTime = 0;
        stateRef.current.progress = 0;
        stateRef.current.pausedElapsed = 0;
        
        setHoveredId(null);
        setProgress(0);
        
        sessionLogger.logDwellSuccess();
        if (onSelect) onSelect(id);
      }
    }
  }, [lastGesture, onSelect]);

  // Main Dwell Loop
  useEffect(() => {
    let animationFrameId;

    const loop = (timestamp) => {
      if (inputMode === 'touch') {
        if (stateRef.current.hoveredId) {
          stateRef.current.hoveredId = null;
          stateRef.current.progress = 0;
          setHoveredId(null);
          setProgress(0);
        }
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      // 1. Check system state
      const isTracking = status === GAZE_STATUS.TRACKING;
      const isHighConfidence = confidence >= 0.4;
      
      // 2. Map screen coordinates to DOM element
      let targetId = null;
      let rawTargetEl = null;

      if (isTracking && gazePosition.valid) {
        // Temporarily hide cursor so it doesn't block elementFromPoint
        // (Assuming cursor has pointer-events: none, but this is a safeguard)
        const el = document.elementFromPoint(gazePosition.x, gazePosition.y);
        
        if (el) {
          rawTargetEl = el.closest('[data-dwell-target="true"]');
          if (rawTargetEl) {
            targetId = rawTargetEl.getAttribute('data-phrase-id');
          }
        }
      }

      const st = stateRef.current;

      // 3. Process Target Change
      if (targetId !== st.hoveredId) {
        if (st.hoveredId) {
          // If we aborted after 50% progress, consider it a dwell abort
          if (st.progress > 0.5) {
            sessionLogger.logDwellAbort();
          }
        }

        if (targetId) {
          // Started hovering a new item
          st.hoveredId = targetId;
          st.startTime = timestamp;
          st.lastTick = timestamp; // FINDING 1 FIX
          st.progress = 0;
          st.pausedElapsed = 0;
          setHoveredId(targetId);
          setProgress(0);
        } else {
          // Looked away into empty space
          st.hoveredId = null;
          st.progress = 0;
          setHoveredId(null);
          setProgress(0);
        }
      } 
      // 4. Process Ongoing Hover
      else if (st.hoveredId) {
        if (!isHighConfidence) {
          // Graceful degradation: pause the timer instead of cancelling it immediately
          // Or if tracking is completely lost, maybe decay it.
          // For now, we just don't advance the progress.
          st.lastTick = timestamp;
        } else {
          // Advance progress
          // Real elapsed time = (current - start) - total paused time
          // But simpler: just accumulate delta time
          const delta = st.lastTick === 0 ? 0 : (timestamp - st.lastTick);
          st.progress += delta / dwellTimeMs;
          
          if (st.progress >= 1.0) {
            // Selection triggered!
            const id = st.hoveredId;
            
            // Reset state
            st.hoveredId = null;
            st.progress = 0;
            setHoveredId(null);
            setProgress(0);

            sessionLogger.logDwellSuccess();
            if (onSelect) {
              onSelect(id);
            }
          } else {
            // Update UI occasionally (throttle if needed, but rAF is okay for smooth CSS)
            setProgress(st.progress);
          }
        }
      }
      
      st.lastTick = timestamp;
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [gazePosition, confidence, status, dwellTimeMs, onSelect]);

  return { hoveredId, progress };
}
