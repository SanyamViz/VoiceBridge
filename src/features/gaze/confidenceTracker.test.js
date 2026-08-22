import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceTracker, CONFIDENCE_LEVEL } from './confidenceTracker';

describe('ConfidenceTracker', () => {
  let tracker;

  beforeEach(() => {
    // Shorter windows for testing
    tracker = new ConfidenceTracker({ windowMs: 100, stabilityWindowMs: 50, calibrationDecayMs: 1000 });
  });

  it('starts at POOR confidence', () => {
    expect(tracker.confidence).toBe(0);
    expect(tracker.level).toBe(CONFIDENCE_LEVEL.POOR);
  });

  it('increases confidence when face is consistently detected', () => {
    tracker.setCalibrated();
    for (let i = 0; i < 10; i++) {
      tracker.recordFrame(true, i * 10, { x: 0.5, y: 0.5 });
    }
    expect(tracker.confidence).toBeGreaterThan(0.7);
    expect(tracker.level).toBe(CONFIDENCE_LEVEL.GOOD);
  });

  it('decreases confidence when face is intermittently detected', () => {
    tracker.setCalibrated();
    for (let i = 0; i < 10; i++) {
      // 20% detection rate
      tracker.recordFrame(i % 5 === 0, i * 10, { x: 0.5, y: 0.5 }); 
    }
    expect(tracker.confidence).toBeLessThan(0.7);
    expect(tracker.level).not.toBe(CONFIDENCE_LEVEL.GOOD);
  });

  it('decreases confidence when gaze variance is high', () => {
    tracker.setCalibrated();
    // Simulate jittery eye tracking
    for (let i = 0; i < 10; i++) {
      tracker.recordFrame(true, i * 10, { x: i % 2 === 0 ? 0 : 1, y: 0.5 }); 
    }
    // High variance should pull down confidence despite 100% detection
    expect(tracker.confidence).toBeLessThan(0.8);
  });
});
