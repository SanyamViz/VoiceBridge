/**
 * Feature: Blink Gesture Detection
 * Gesture mapping per VoiceBridge rules:
 * - Single blink: Confirm
 * - Double blink: Cancel
 * - Triple blink: Emergency shortcut
 * - Hold blink: Mute/pause
 */
export const BLINK_GESTURES = {
  SINGLE: 'SINGLE_BLINK_CONFIRM',
  DOUBLE: 'DOUBLE_BLINK_CANCEL',
  TRIPLE: 'TRIPLE_BLINK_EMERGENCY',
  HOLD: 'HOLD_BLINK_PAUSE'
};

export class BlinkDetectorService {
  constructor() {
    this.gestureListeners = new Set();
  }

  onGesture(listener) {
    this.gestureListeners.add(listener);
    return () => this.gestureListeners.delete(listener);
  }
}

export const blinkDetector = new BlinkDetectorService();
