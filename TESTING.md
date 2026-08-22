# VoiceBridge Real-User Test Checklist

This document serves as a guide for researchers or caregivers preparing to test the VoiceBridge application with a motor-impaired patient.

## Pre-Test Setup

### 1. Environment & Lighting
- **Lighting**: Ensure the room is well-lit, but avoid strong backlighting (e.g., sitting directly in front of a bright window). The webcam must clearly see the user's face and eyes.
- **Glare**: If the user wears glasses, check the camera feed to ensure glare from the screen is not obscuring their eyes.

### 2. Device Positioning
- **Distance**: The user should be positioned approximately **40cm to 60cm** away from the webcam.
- **Angle**: The webcam should be roughly at eye level, capturing the full face without extreme tilting.
- **Stability**: Ensure the device or wheelchair mount is stable. Extreme shaking will degrade gaze confidence.

### 3. Browser & Permissions
- Use a modern browser (Chrome/Edge/Firefox).
- **Camera Permissions**: Ensure the browser has granted camera access.
- **Audio Feedback**: The system relies on Web Speech API for TTS. Ensure device volume is up so the user can hear confirmation tones/speech.

## Initiating the Test Session

1. **Start the App**: Open the patient interface and ensure the **"Auth Shell Active"** chip is green (meaning dev mode is ready) or the user is properly logged in.
2. **Start Camera**: Click "Start Camera". Wait for the MediaPipe engine to download and initialize.
3. **Calibrate**: Ask the user to follow the red dot as it moves to 9 positions on the screen. Encourage them to *blink* to confirm each point if they have trouble dwelling.
4. **Start Session**: Click **[Start Test Session]** on the Patient UI.
5. **Monitor (Caregiver)**: Open a second device (or tab) and switch to the Caregiver role. Link to the patient's UID to monitor the "Live Test Metrics" stream.

## Metrics Tracking & Researcher Annotations

The VoiceBridge app will automatically log the following to Firestore:
- Dwell successes & aborts
- Blink gestures classified
- Input mode switches (Touch Fallback)
- Time-to-emergency triggers

### ⚠️ IMPORTANT: Researcher Annotations Required
The automated system **cannot log intent it fails to detect**. During the session, the researcher must manually note:
- **False Negatives (Misses)**: The user attempted to select a tile or blink, but the system did not register it.
- **False Positives (Misfires)**: The system triggered an action when the user was just looking around or naturally blinking.
- **Fatigue**: Note if accuracy degrades over time.

## Emergency Shortcut Test
During the test, ask the user to trigger the SOS alert using a **Double Blink** (or a 2.5s gaze dwell). Verify that the Caregiver Dashboard immediately receives the alert and sounds the alarm.
