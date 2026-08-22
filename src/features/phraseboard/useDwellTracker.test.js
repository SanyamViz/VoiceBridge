import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDwellTracker } from './useDwellTracker';
import { useGaze } from '../../context/GazeContext';
import { BLINK_GESTURE } from '../gaze/blinkDetector';
import { GAZE_STATUS } from '../gaze/gazeEngine';

// Mock the context
vi.mock('../../context/GazeContext', () => ({
  useGaze: vi.fn()
}));

describe('useDwellTracker', () => {
  let mockGazeState;
  let mockElementFromPoint;

  beforeEach(() => {
    vi.useFakeTimers();

    // Default mock gaze state
    mockGazeState = {
      gazePosition: { x: 100, y: 100, valid: true },
      confidence: 1.0,
      status: GAZE_STATUS.TRACKING,
      lastGesture: null
    };

    useGaze.mockImplementation(() => mockGazeState);

    // Mock DOM elements
    mockElementFromPoint = vi.fn();
    document.elementFromPoint = mockElementFromPoint;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const createMockTarget = (phraseId) => {
    return {
      closest: vi.fn().mockImplementation((selector) => {
        if (selector === '[data-dwell-target="true"]') {
          return {
            getAttribute: vi.fn().mockReturnValue(phraseId)
          };
        }
        return null;
      })
    };
  };

  it('starts dwell timer when looking at a target', () => {
    const onSelect = vi.fn();
    mockElementFromPoint.mockReturnValue(createMockTarget('phrase-1'));

    const { result } = renderHook(() => useDwellTracker({ dwellTimeMs: 1000, onSelect }));
    
    // First animation frame sets hoveredId
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(result.current.hoveredId).toBe('phrase-1');
    expect(result.current.progress).toBe(0);

    // Advance 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    expect(result.current.progress).toBeGreaterThan(0);
    expect(result.current.progress).toBeLessThan(1);
    expect(onSelect).not.toHaveBeenCalled();

    // Advance to 1000ms
    act(() => {
      vi.advanceTimersByTime(550);
    });

    expect(onSelect).toHaveBeenCalledWith('phrase-1');
    // Progress should reset after firing, but since mock still returns phrase-1, a new cycle starts
    expect(result.current.progress).toBeLessThan(0.05);
  });

  it('pauses dwell timer when confidence drops below 0.4', () => {
    const onSelect = vi.fn();
    mockElementFromPoint.mockReturnValue(createMockTarget('phrase-1'));

    const { result, rerender } = renderHook(() => useDwellTracker({ dwellTimeMs: 1000, onSelect }));

    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    const midProgress = result.current.progress;
    expect(midProgress).toBeGreaterThan(0);

    // Drop confidence
    mockGazeState.confidence = 0.2;
    rerender();
    
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Progress should not advance significantly (it might advance 1 frame before realizing, but effectively paused)
    expect(result.current.progress).toBeLessThan(0.6);
    expect(onSelect).not.toHaveBeenCalled();
    
    // Restore confidence
    mockGazeState.confidence = 1.0;
    rerender();
    
    act(() => {
      vi.advanceTimersByTime(600);
    });
    
    expect(onSelect).toHaveBeenCalledWith('phrase-1');
  });

  it('triggers immediately on SINGLE blink', () => {
    const onSelect = vi.fn();
    mockElementFromPoint.mockReturnValue(createMockTarget('phrase-2'));

    const { result, rerender } = renderHook(() => useDwellTracker({ dwellTimeMs: 1000, onSelect }));

    act(() => {
      vi.advanceTimersByTime(200);
    });
    
    expect(result.current.hoveredId).toBe('phrase-2');
    expect(onSelect).not.toHaveBeenCalled();

    // Trigger single blink
    mockGazeState.lastGesture = { gesture: BLINK_GESTURE.SINGLE, timestamp: Date.now() };
    rerender();

    expect(onSelect).toHaveBeenCalledWith('phrase-2');
    expect(result.current.progress).toBe(0);
  });
});
