# VoiceBridge 👁️🗣️

VoiceBridge is a hands-free Augmentative and Alternative Communication (AAC) web application designed specifically for patients with severe motor or speech impairments (e.g., ALS, locked-in syndrome). 

By utilizing local webcam feeds, VoiceBridge tracks eye movements and blink gestures, translating them into speech synthesis, interface navigation, and life-saving emergency SOS alerts. It also features a real-time Caregiver Hub for remote monitoring and phrase injection.

---

## ✨ Key Features

### 1. Advanced Gaze & Blink Engine (Client-Side)
- **MediaPipe FaceLandmarker**: Highly accurate, low-latency facial landmark detection running entirely in the browser via WebAssembly. No video data is ever sent to a server.
- **Dwell Selection**: Stare at any phrase tile or button for 1.5 seconds to select it.
- **Blink Gestures**: Hardcoded safety mappings for quick actions:
  - **Single Blink**: Confirm / Select
  - **Double Blink**: Cancel / Go Back
  - **Triple Blink**: Instant Emergency SOS Trigger
  - **Hold Blink (2s)**: Pause/Mute eye-tracking (Rest mode)
- **Gaze Auto-scrolling**: Look at the top 15% or bottom 15% of the screen to smoothly scroll the page without any manual input.

### 2. Patient Interface
- **Phrase Board**: A dynamic grid of customizable phrases. Looking at a tile triggers the **Web Speech API** to speak the phrase out loud.
- **Emergency Zone**: A dedicated, safety-critical zone that triggers an immediate SOS alert when stared at or when a triple-blink is detected.
- **Adaptive Fallback**: If the webcam is lost or the engine crashes, a robust `TouchFallbackUI` gracefully takes over so the patient is never stranded without communication.

### 3. Caregiver Hub (Real-Time Monitoring)
- **Live Telemetry**: Caregivers can link to a patient via a secure UID and watch their connection status ("LIVE STREAM" vs "OFFLINE") and input mode (Gaze vs Touch) in real-time.
- **Emergency Feed**: A live feed of SOS alerts. When an alert is triggered, the caregiver dashboard flashes and plays a loud audio alarm. Max 6 alerts are kept to prevent overwhelming the UI.
- **Remote Tile Injector**: Caregivers can type custom phrases (e.g., "CALL NURSE ANITA") and inject them instantly onto the patient's screen. The patient's board acts as a sliding window of the 6 most recent tiles, automatically managing older tiles.

---

## 🛠️ Technology Stack
- **Frontend**: React 18, Vite, Vanilla CSS (`index.css` design system)
- **Machine Learning**: Google MediaPipe (FaceLandmarker, WASM)
- **Backend / Sync**: Firebase v9 (Firestore)
- **Offline Mode**: Multi-tab IndexedDB Persistence enabled (Allows local testing between tabs without an active internet connection or configured backend).
- **Audio/Speech**: Web Speech API (TTS), Web Audio API (Alarms)

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm or yarn
- A working Webcam

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/voicebridge.git
cd voicebridge
npm install
```

### 2. Firebase Configuration (Optional for Local Testing)
VoiceBridge uses **IndexedDB Offline Persistence**, meaning you can test it locally across two browser tabs *without* connecting to a real Firebase backend. 
However, to deploy it over the network, create a `.env` file in the root directory:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Run the Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📖 How to Use & Test (End-to-End)

To see the real-time syncing in action, you will need to simulate both a Patient and a Caregiver.

### Step 1: Set up the Patient Tab
1. Open `http://localhost:5173` in **Tab A**.
2. Ensure the top-right role toggle is set to **Patient**.
3. Click **Start Camera**. 
4. Allow browser camera permissions. Sit roughly an arm's length from the camera in good lighting.
5. Follow the 9-point calibration dots with your eyes.
6. Once calibrated, you are live. Your gaze will move the red cursor. 

### Step 2: Set up the Caregiver Tab
1. Open `http://localhost:5173` in **Tab B** (keep Tab A open in the background or side-by-side).
2. Switch the top-right role toggle to **Caregiver**.
3. Enter the default patient UID: `dev-patient-123` and click **Establish Secure Link**.
4. Click **Acknowledge & Start** to unlock the browser's audio engine for alarms.
5. You are now on the Caregiver Hub. Because Tab A is running the camera, the top status badge should instantly pulse green and say **LIVE STREAM**.

### Step 3: Test Real-Time Interactions
- **Inject a Phrase**: In the Caregiver tab (Tab B), type "I AM HUNGRY" into the Remote Tile Injector and hit Send. Look at the Patient tab (Tab A)—the tile will appear instantly! (Note: Only 6 tiles are kept on screen at a time).
- **Trigger an SOS Alert**: In the Patient tab (Tab A), stare at the red **Emergency Zone** for 2.5 seconds (or blink rapidly 3 times).
- **Observe the Alarm**: The Caregiver tab (Tab B) will instantly flash red, log the SOS alert in the feed, and play an audible siren.
- **Auto-scroll**: On the Patient tab, look near the very top or very bottom of your monitor to watch the page smoothly scroll up or down.

---

## 🔒 Security & Architecture Notes
- **IDOR Protection**: Patient linking requires server-side monitoring link documents (`monitoring_links/{caregiverUid}_{patientUid}`).
- **Staleness Checking**: Caregiver telemetry auto-downgrades to "OFFLINE" if a heartbeat isn't received from the patient within 10 seconds.
- **Engine Teardown**: Strict React cleanup functions ensure the MediaPipe WASM worker and `getUserMedia` camera streams are completely terminated when the component unmounts to prevent memory/hardware leaks.

---

*Built with ❤️ for accessibility and independence.*
