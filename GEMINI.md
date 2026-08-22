# VoiceBridge Project Rules

These are the core guidelines for the VoiceBridge project. All development must strictly adhere to these rules.

## Core Architecture and Input Methods
- **Target Audience**: AAC (augmentative/alternative communication) app for patients with motor/speech impairments.
- **Core Input Method**: Eye-tracking + blink gestures. This is the **primary** and core input method, not a stretch goal or demo feature.
- **Fallback**: Touch input is a fallback only. Never silently degrade gaze/blink functionality in favor of touch shortcuts.
- **Out of Scope**: Switch-scanning input is explicitly out of scope. **Do not add it.**

## Technology Stack
- **Frontend**: React + CSS.
- **Backend / Services**: Firebase (Firestore, Cloud Messaging, Auth).
- **Speech**: Web Speech API.
- **Eye-Tracking**: MediaPipe FaceLandmarker (local WASM + model). Not WebGazer.js.

## Blink Gesture Mapping
Do not change this mapping without explicit instruction:
- **Single blink**: Confirm
- **Double blink**: Cancel
- **Triple blink**: Emergency shortcut
- **Hold blink**: Mute/pause

## Safety-Critical Features and Verification
- **Safety-Critical Areas**: Gaze accuracy, calibration, or emergency alerting.
- **Requirements**:
  - Write tests for all safety-critical features.
  - Flag edge cases (e.g., tracking lost, poor blink control, low light) instead of assuming the happy path.
  - After implementing each step, use the browser subagent to actually exercise the feature (not just unit tests).
  - Report what you verified versus what still needs a human to check with real hardware/webcam.
