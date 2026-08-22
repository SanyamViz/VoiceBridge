import { describe, it, expect } from 'vitest';
import { median, medianFeature, computeCalibration, mapToScreen } from './calibration';

describe('Calibration Math', () => {

  describe('median', () => {
    it('returns the middle element of an array', () => {
      expect(median([1, 100, 2])).toBe(2);
      expect(median([1, 2, 3, 4, 5])).toBe(3);
    });
  });

  describe('medianFeature', () => {
    it('filters out clear outliers using median', () => {
      const samples = [
        { x: 0.5, y: 0.5, yaw: 0, pitch: 0 },
        { x: 0.51, y: 0.51, yaw: 0.01, pitch: -0.01 },
        { x: 0.49, y: 0.49, yaw: -0.01, pitch: 0.01 },
        { x: 0.99, y: 0.99, yaw: 0.5, pitch: 0.5 }, // outlier (blink/saccade)
        { x: 0.5, y: 0.5, yaw: 0, pitch: 0 }
      ];
      const avg = medianFeature(samples);
      expect(avg.eyeX).toBeCloseTo(0.5, 1);
      expect(avg.eyeY).toBeCloseTo(0.5, 1);
      expect(avg.yaw).toBeCloseTo(0, 1);
      expect(avg.pitch).toBeCloseTo(0, 1);
    });
  });

  describe('computeCalibration and mapToScreen', () => {
    it('rejects calibration if n < 3', () => {
      const res = computeCalibration([{ eyeX: 0.5, eyeY: 0.5, yaw: 0, pitch: 0, targetX: 0.5, targetY: 0.5 }], 1920, 1080);
      expect(res.valid).toBe(false);
    });

    it('builds a valid model and maps reasonably for a synthetic grid', () => {
      // Mock 9-point grid
      const samples = [
        { eyeX: 0.4, eyeY: 0.4, yaw: -0.1, pitch: -0.1, targetX: 0.1, targetY: 0.1 },
        { eyeX: 0.5, eyeY: 0.4, yaw: 0,    pitch: -0.1, targetX: 0.5, targetY: 0.1 },
        { eyeX: 0.6, eyeY: 0.4, yaw: 0.1,  pitch: -0.1, targetX: 0.9, targetY: 0.1 },
        { eyeX: 0.4, eyeY: 0.5, yaw: -0.1, pitch: 0,    targetX: 0.1, targetY: 0.5 },
        { eyeX: 0.5, eyeY: 0.5, yaw: 0,    pitch: 0,    targetX: 0.5, targetY: 0.5 },
        { eyeX: 0.6, eyeY: 0.5, yaw: 0.1,  pitch: 0,    targetX: 0.9, targetY: 0.5 },
        { eyeX: 0.4, eyeY: 0.6, yaw: -0.1, pitch: 0.1,  targetX: 0.1, targetY: 0.9 },
        { eyeX: 0.5, eyeY: 0.6, yaw: 0,    pitch: 0.1,  targetX: 0.5, targetY: 0.9 },
        { eyeX: 0.6, eyeY: 0.6, yaw: 0.1,  pitch: 0.1,  targetX: 0.9, targetY: 0.9 },
      ];

      const calib = computeCalibration(samples, 1000, 1000);
      
      expect(calib.valid).toBe(true);
      expect(calib.model.wx).toBeDefined();
      expect(calib.model.wy).toBeDefined();

      // Mock window size
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1000 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 1000 });

      // Test mapping the center point
      const mapped = mapToScreen(0.5, 0.5, 0, 0, calib);
      expect(mapped.valid).toBe(true);
      
      // Should map back near 500,500 (since 0.5 * 1000 = 500)
      // Note: Because it's a ridge regression on an exact linear synthetic set, 
      // the ridge penalty (1e-2) will shrink the coefficients slightly, 
      // so it won't be exactly 500, but it should be very close.
      expect(Math.abs(mapped.x - 500)).toBeLessThan(50);
      expect(Math.abs(mapped.y - 500)).toBeLessThan(50);
    });

    it('applies rolling median smoothing to mapToScreen', () => {
      // Mock window size
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1000 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 1000 });

      const calib = { 
        valid: true, 
        model: { 
          // Identity mapping for simple testing
          wx: [0, 1000, 0, 0], wy: [0, 1000, 0, 0], 
          stdX: { mean: 0, std: 1 }, stdY: { mean: 0, std: 1 } 
        } 
      };

      // Push 5 points near 500
      mapToScreen(0.50, 0.50, 0, 0, calib);
      mapToScreen(0.51, 0.51, 0, 0, calib);
      mapToScreen(0.49, 0.49, 0, 0, calib);
      mapToScreen(0.50, 0.50, 0, 0, calib);
      mapToScreen(0.50, 0.50, 0, 0, calib);

      // Now push an outlier (1.0 = 1000px)
      const res = mapToScreen(1.0, 1.0, 0, 0, calib);
      
      // The median filter should reject the outlier and stay near 500
      expect(Math.abs(res.x - 500)).toBeLessThan(20);
      expect(Math.abs(res.y - 500)).toBeLessThan(20);
    });
  });
});
