import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlinkDetector, BLINK_GESTURE } from './blinkDetector';

// Helper to construct mock blendshapes
function createMockBlendshapes(score) {
  return {
    categories: [
      { categoryName: 'eyeBlinkLeft', score: score },
      { categoryName: 'eyeBlinkRight', score: score }
    ]
  };
}

describe('BlinkDetector', () => {
  let detector;
  let gestureCb;
  let openShapes;
  let closedShapes;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new BlinkDetector({
      blinkThreshold: 0.45,
      singleMaxMs: 400,
      doubleWindowMs: 800,
      tripleWindowMs: 1200,
      holdMinMs: 1500,
      minConfidence: 0.4
    });
    gestureCb = vi.fn();
    detector.onGesture(gestureCb);
    detector.setConfidence(1.0); // Ensure high confidence

    openShapes = createMockBlendshapes(0.1);
    closedShapes = createMockBlendshapes(0.8);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('triggers SINGLE blink', () => {
    let t = 0;
    detector.processFrame([], t, openShapes); // open
    t += 50;
    detector.processFrame([], t, closedShapes); // close
    t += 200; // wait 200ms
    detector.processFrame([], t, openShapes); // open

    // Fast forward to exhaust double/triple windows
    vi.advanceTimersByTime(1000);

    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.SINGLE);
    expect(gestureCb).toHaveBeenCalledTimes(1);
  });

  it('triggers DOUBLE blink', () => {
    let t = 0;
    // 1st blink
    detector.processFrame([], t, closedShapes);
    t += 200;
    detector.processFrame([], t, openShapes);
    
    // 2nd blink
    t += 200; // 400ms total
    detector.processFrame([], t, closedShapes);
    t += 200; // 600ms total
    detector.processFrame([], t, openShapes);

    // Fast forward to exhaust triple window
    vi.advanceTimersByTime(1000);

    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.DOUBLE);
    expect(gestureCb).toHaveBeenCalledTimes(1);
  });

  it('triggers TRIPLE blink immediately', () => {
    let t = 0;
    // 1st blink
    detector.processFrame([], t, closedShapes); t += 150; detector.processFrame([], t, openShapes);
    
    // 2nd blink
    t += 150; detector.processFrame([], t, closedShapes); t += 150; detector.processFrame([], t, openShapes);

    // 3rd blink
    t += 150; detector.processFrame([], t, closedShapes); t += 150; 
    
    expect(gestureCb).not.toHaveBeenCalled();
    detector.processFrame([], t, openShapes);

    // Should fire immediately without waiting for timers
    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.TRIPLE);
    expect(gestureCb).toHaveBeenCalledTimes(1);
  });

  it('triggers HOLD blink after threshold', () => {
    let t = 0;
    detector.processFrame([], t, closedShapes);
    t += 1600; // past the 1500ms hold threshold
    detector.processFrame([], t, closedShapes);

    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.HOLD);
  });

  it('bypasses confidence gate for TRIPLE blink but suppresses others', () => {
    detector.setConfidence(0.2); // Below minConfidence

    let t = 0;
    // 1st blink
    detector.processFrame([], t, closedShapes); t += 150; detector.processFrame([], t, openShapes);
    vi.advanceTimersByTime(1000);
    // Should NOT fire single blink due to low confidence
    expect(gestureCb).not.toHaveBeenCalled();

    // Reset and try triple
    detector.reset();
    t = 2000;
    detector.processFrame([], t, closedShapes); t += 150; detector.processFrame([], t, openShapes);
    t += 150; detector.processFrame([], t, closedShapes); t += 150; detector.processFrame([], t, openShapes);
    t += 150; detector.processFrame([], t, closedShapes); t += 150; detector.processFrame([], t, openShapes);

    // Should fire triple despite low confidence
    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.TRIPLE);
  });

  it('tests borderline blink scores accurately against configurable threshold', () => {
    let t = 0;
    const borderlineOpen = createMockBlendshapes(0.44);
    const borderlineClosed = createMockBlendshapes(0.46);

    // Using default threshold (0.45)
    detector.processFrame([], t, borderlineClosed); // closed
    t += 200;
    detector.processFrame([], t, borderlineOpen); // open
    vi.advanceTimersByTime(1000);
    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.SINGLE);

    gestureCb.mockClear();
    
    // Change threshold to 0.50 for a patient with stronger blinks (or poor control)
    detector.setBlinkThreshold(0.50);
    t = 2000;
    
    // Now 0.46 should be ignored as an incomplete blink
    detector.processFrame([], t, borderlineClosed); // 0.46 is now OPEN
    t += 200;
    detector.processFrame([], t, borderlineOpen); // 0.44 is OPEN
    vi.advanceTimersByTime(1000);
    
    // No gesture fired because it never crossed 0.50
    expect(gestureCb).not.toHaveBeenCalled();
    
    // Test crossing new threshold
    const definitiveClosed = createMockBlendshapes(0.55);
    detector.processFrame([], t, definitiveClosed);
    t += 200;
    detector.processFrame([], t, borderlineOpen);
    vi.advanceTimersByTime(1000);
    
    expect(gestureCb).toHaveBeenCalledWith(BLINK_GESTURE.SINGLE);
  });
});
