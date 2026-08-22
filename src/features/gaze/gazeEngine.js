/**
 * GazeEngine — Core gaze tracking service built directly on MediaPipe FaceLandmarker.
 *
 * Owns the single camera pipeline and FaceLandmarker instance.
 * Per-frame landmarks are dispatched to both gaze-position extraction and the blink detector.
 *
 * Status lifecycle:
 *   UNINITIALIZED → INITIALIZING → TRACKING → LOST → ERROR
 *                                 ↕ CALIBRATING
 */

// ─── Status Enum ─────────────────────────────────────────────────────────────

export const GAZE_STATUS = {
  UNINITIALIZED: 'UNINITIALIZED',
  INITIALIZING: 'INITIALIZING',
  CALIBRATING: 'CALIBRATING',
  TRACKING: 'TRACKING',
  LOST: 'LOST',
  ERROR: 'ERROR'
};

// ─── Iris / Eye Landmark Indices (MediaPipe FaceLandmarker) ──────────────────

export const LANDMARKS = {
  LEFT_IRIS: 468,       // Left iris center
  RIGHT_IRIS: 473,      // Right iris center

  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,

  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,

  // Additional eyelid landmarks for EAR computation (blink detection)
  LEFT_EYE_TOP_2: 158,
  LEFT_EYE_BOTTOM_2: 153,
  RIGHT_EYE_TOP_2: 385,
  RIGHT_EYE_BOTTOM_2: 380,
  LEFT_EYE_TOP_3: 160,
  LEFT_EYE_BOTTOM_3: 144,
  RIGHT_EYE_TOP_3: 387,
  RIGHT_EYE_BOTTOM_3: 373
};

// ─── Eye Position Extraction ─────────────────────────────────────────────────

// Helper to average multiple landmarks
function avg(points, idx) {
  const t = idx.reduce((s, i) => ({ x: s.x + points[i].x, y: s.y + points[i].y }), { x: 0, y: 0 });
  return { x: t.x / idx.length, y: t.y / idx.length };
}

/**
 * Extract normalized iris position relative to eye corners (avoiding eyelid interference).
 * Also returns rough head pose (yaw/pitch).
 * Returns { x, y, yaw, pitch, valid } where valid=false means bad/missing data.
 */
export function getEyePosition(landmarks) {
  const L = LANDMARKS;

  const leftOuter  = landmarks[L.LEFT_EYE_OUTER];
  const leftInner  = landmarks[L.LEFT_EYE_INNER];
  const rightInner = landmarks[L.RIGHT_EYE_INNER];
  const rightOuter = landmarks[L.RIGHT_EYE_OUTER];
  const nose = landmarks[1];
  const leftEdge = landmarks[234];
  const rightEdge = landmarks[454];
  const top = landmarks[10];
  const bottom = landmarks[152];

  // If any critical landmark is missing, signal bad data
  if (!leftOuter || !leftInner || !rightInner || !rightOuter || !nose || !leftEdge || !rightEdge || !top || !bottom) {
    return { x: 0.5, y: 0.5, yaw: 0, pitch: 0, valid: false };
  }

  // Iris position (average of all 5 points per iris for stability)
  const leftIris = avg(landmarks, [468,469,470,471,472]);
  const rightIris = avg(landmarks, [473,474,475,476,477]);

  // Use horizontal eye width as the normalization factor for both X and Y.
  // This prevents vertical Y-normalization from being skewed by eyelids opening/closing.
  const leftWidth = leftInner.x - leftOuter.x;
  const rightWidth = rightOuter.x - rightInner.x;

  if (Math.abs(leftWidth) < 0.0001 || Math.abs(rightWidth) < 0.0001) {
    return { x: 0.5, y: 0.5, yaw: 0, pitch: 0, valid: false };
  }

  // Mid-points between the corners (stable vertical anchor)
  const leftMidY = (leftOuter.y + leftInner.y) / 2;
  const rightMidY = (rightInner.y + rightOuter.y) / 2;

  // Normalized relative to corners
  const leftX = (leftIris.x - leftOuter.x) / leftWidth;
  const rightX = (rightIris.x - rightInner.x) / rightWidth;
  const leftY = (leftIris.y - leftMidY) / leftWidth;
  const rightY = (rightIris.y - rightMidY) / rightWidth;

  const avgX = (leftX + rightX) / 2;
  const avgY = (leftY + rightY) / 2;

  // Rough head pose
  const yaw = (rightEdge.x - leftEdge.x) ? (nose.x - leftEdge.x) / (rightEdge.x - leftEdge.x) - 0.5 : 0;
  const pitch = (bottom.y - top.y) ? (nose.y - top.y) / (bottom.y - top.y) - 0.42 : 0;

  return { x: avgX, y: avgY, yaw, pitch, valid: true };
}

// ─── Exponential Moving Average Smoothing ────────────────────────────────────

export function smoothValue(current, target, alpha = 0.15) {
  return current + alpha * (target - current);
}

// ─── GazeEngine Class ────────────────────────────────────────────────────────

export class GazeEngine {
  constructor() {
    this._status = GAZE_STATUS.UNINITIALIZED;
    this._faceLandmarker = null;
    this._cameraStream = null;
    this._video = null;
    this._tracking = false;
    this._lastVideoTime = -1;
    this._animFrameId = null;

    // Smoothed gaze (normalized 0..1)
    this._smoothX = 0.5;
    this._smoothY = 0.5;
    this._alpha = 0.08;

    // Face-lost timing
    this._lastFaceDetectedAt = 0;
    this._faceLostThresholdMs = 500;    // → status LOST after this
    this._recalibPromptMs = 3000;       // → prompt recalibration after this

    // FPS tracking
    this._fpsFrames = 0;
    this._fpsLastTime = 0;
    this._currentFps = 0;

    // Listeners
    this._gazeListeners = new Set();
    this._statusListeners = new Set();
    this._landmarkListeners = new Set(); // raw landmark dispatch (for blink detector)
    this._fpsListeners = new Set();
  }

  // ── Public API ───────────────────────────────────────────────────────

  get status() { return this._status; }
  get fps() { return this._currentFps; }
  get isTracking() { return this._tracking; }

  /** Subscribe to gaze position updates: callback({ x, y, screenX, screenY, valid }) */
  onGaze(cb)      { this._gazeListeners.add(cb);     return () => this._gazeListeners.delete(cb); }
  /** Subscribe to status changes: callback(newStatus, oldStatus) */
  onStatus(cb)    { this._statusListeners.add(cb);    return () => this._statusListeners.delete(cb); }
  /** Subscribe to raw per-frame landmarks: callback(landmarks, timestamp) — used by blink detector */
  onLandmarks(cb) { this._landmarkListeners.add(cb);  return () => this._landmarkListeners.delete(cb); }
  /** Subscribe to FPS updates: callback(fps) */
  onFps(cb)       { this._fpsListeners.add(cb);       return () => this._fpsListeners.delete(cb); }

  /**
   * Initialize camera and MediaPipe, begin tracking.
   * @param {object} opts
   * @param {HTMLVideoElement} opts.videoElement — video element to attach camera to (optional, creates one if missing)
   * @param {string} opts.wasmPath — path to WASM directory (default: '/EyeTracker/wasm')
   * @param {string} opts.modelPath — path to face_landmarker.task (default: '/EyeTracker/face_landmarker.task')
   */
  async init(opts = {}) {
    if (this._status !== GAZE_STATUS.UNINITIALIZED && this._status !== GAZE_STATUS.ERROR) {
      return;
    }

    this._setStatus(GAZE_STATUS.INITIALIZING);

    try {
      // ── Camera ──
      await this._startCamera(opts.videoElement);

      // ── MediaPipe ──
      await this._loadMediaPipe(opts);

      // ── Begin tracking loop ──
      this._tracking = true;
      this._lastFaceDetectedAt = performance.now();
      this._fpsLastTime = performance.now();
      this._setStatus(GAZE_STATUS.TRACKING);
      this._animFrameId = requestAnimationFrame((ts) => this._trackingLoop(ts));

    } catch (err) {
      this._setStatus(GAZE_STATUS.ERROR);
      throw err; // let caller handle UI
    }
  }

  /** Stop tracking, release camera, tear down MediaPipe */
  destroy() {
    this._tracking = false;

    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(t => t.stop());
      this._cameraStream = null;
    }

    if (this._video) {
      this._video.srcObject = null;
    }

    if (this._faceLandmarker) {
      this._faceLandmarker.close();
      this._faceLandmarker = null;
    }

    this._setStatus(GAZE_STATUS.UNINITIALIZED);
  }

  /** Get the video element (for calibration to run detectForVideo against) */
  getVideo() { return this._video; }

  /** Get the FaceLandmarker instance (for calibration) */
  getFaceLandmarker() { return this._faceLandmarker; }

  /** Temporarily pause/resume the tracking loop (e.g. during calibration) */
  pauseLoop() { this._tracking = false; }
  resumeLoop() {
    if (!this._tracking && this._faceLandmarker) {
      this._tracking = true;
      this._animFrameId = requestAnimationFrame((ts) => this._trackingLoop(ts));
    }
  }

  // ── Camera Setup ─────────────────────────────────────────────────────

  async _startCamera(existingVideo) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera API unavailable. Ensure this page is served over HTTPS or localhost.'
      );
    }

    try {
      this._cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
    } catch (err) {
      // Discriminate camera errors
      if (err.name === 'NotAllowedError') {
        throw new Error('Camera permission was denied. VoiceBridge requires camera access for eye tracking.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('No camera found. Please connect a webcam and reload.');
      } else if (err.name === 'OverconstrainedError') {
        throw new Error('Camera does not support the requested resolution. Try a different camera.');
      }
      throw err;
    }

    // Create or reuse video element
    if (existingVideo) {
      this._video = existingVideo;
    } else {
      this._video = document.createElement('video');
      this._video.setAttribute('autoplay', '');
      this._video.setAttribute('playsinline', '');
      this._video.setAttribute('muted', '');
      this._video.style.display = 'none';
      document.body.appendChild(this._video);
    }

    this._video.srcObject = this._cameraStream;
    await this._video.play();
    await this._waitForVideo();
  }

  /** Wait for video to have real dimensions, with 10-second timeout */
  _waitForVideo() {
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + 10000;

      const check = () => {
        if (this._video.readyState >= 2 && this._video.videoWidth > 0) {
          resolve();
          return;
        }
        if (performance.now() > deadline) {
          reject(new Error('Camera feed timed out after 10 seconds. Check camera connection.'));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  // ── MediaPipe Loading ────────────────────────────────────────────────

  async _loadMediaPipe(opts = {}) {
    const wasmPath  = opts.wasmPath  || '/EyeTracker/wasm';
    const modelPath = opts.modelPath || '/EyeTracker/face_landmarker.task';
    const bundlePath = opts.bundlePath || '/EyeTracker/vision_bundle.mjs';

    // Dynamic import of local MediaPipe bundle
    const mp = await import(/* @vite-ignore */ bundlePath);

    const { FaceLandmarker, FilesetResolver } = mp;
    if (!FaceLandmarker) throw new Error('FaceLandmarker not exported by vision_bundle.mjs');
    if (!FilesetResolver) throw new Error('FilesetResolver not exported by vision_bundle.mjs');

    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    this._faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    if (!this._faceLandmarker) {
      throw new Error('MediaPipe FaceLandmarker failed to initialize.');
    }
  }

  // ── Tracking Loop ────────────────────────────────────────────────────

  _trackingLoop(timestamp) {
    if (!this._tracking) return;

    // FPS
    this._fpsFrames++;
    if (timestamp - this._fpsLastTime >= 1000) {
      this._currentFps = this._fpsFrames;
      this._fpsFrames = 0;
      this._fpsLastTime = timestamp;
      for (const cb of this._fpsListeners) cb(this._currentFps);
    }

    // Detect
    if (this._faceLandmarker && this._video.readyState >= 2 &&
        this._video.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = this._video.currentTime;

      try {
        const result = this._faceLandmarker.detectForVideo(this._video, timestamp);
        this._processFrame(result, timestamp);
      } catch (err) {
        console.error('[GazeEngine] Detection error:', err);
      }
    }

    this._animFrameId = requestAnimationFrame((ts) => this._trackingLoop(ts));
  }

  _processFrame(result, timestamp) {
    const hasLandmarks = result.faceLandmarks && result.faceLandmarks.length > 0;
    const blendshapes = result.faceBlendshapes && result.faceBlendshapes.length > 0 ? result.faceBlendshapes[0] : null;

    if (!hasLandmarks) {
      // Face lost — check timeouts
      const elapsed = timestamp - this._lastFaceDetectedAt;

      if (elapsed > this._faceLostThresholdMs && this._status === GAZE_STATUS.TRACKING) {
        this._setStatus(GAZE_STATUS.LOST);
      }

      // Emit null gaze so consumers know cursor should hide
      for (const cb of this._gazeListeners) {
        cb({ x: 0, y: 0, screenX: 0, screenY: 0, valid: false });
      }
      return;
    }

    // Face found
    this._lastFaceDetectedAt = timestamp;

    // Recover from LOST
    if (this._status === GAZE_STATUS.LOST) {
      this._setStatus(GAZE_STATUS.TRACKING);
    }

    const landmarks = result.faceLandmarks[0];

    // Dispatch raw landmarks to blink detector and other subscribers
    for (const cb of this._landmarkListeners) {
      cb(landmarks, timestamp, blendshapes);
    }

    // Extract eye position
    const eye = getEyePosition(landmarks);

    if (!eye.valid) {
      for (const cb of this._gazeListeners) {
        cb({ x: this._smoothX, y: this._smoothY, screenX: 0, screenY: 0, valid: false });
      }
      return;
    }

    // Smooth
    this._smoothX = smoothValue(this._smoothX, eye.x, this._alpha);
    this._smoothY = smoothValue(this._smoothY, eye.y, this._alpha);

    // Emit smoothed gaze (normalized 0..1 — screen mapping happens in calibration consumer)
    // Also emit rough head pose (yaw, pitch) for polynomial calibration features
    for (const cb of this._gazeListeners) {
      cb({ x: this._smoothX, y: this._smoothY, rawX: eye.x, rawY: eye.y, yaw: eye.yaw, pitch: eye.pitch, valid: true });
    }
  }

  // ── Status Management ────────────────────────────────────────────────

  _setStatus(newStatus) {
    const old = this._status;
    if (old === newStatus) return;
    this._status = newStatus;
    for (const cb of this._statusListeners) cb(newStatus, old);
  }
}
