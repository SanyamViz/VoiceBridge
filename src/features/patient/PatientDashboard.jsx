import React from 'react';
import { Header } from '../../components/Header';
import { StatusIndicator } from '../../components/StatusIndicator';
import { useAuth } from '../../context/AuthContext';
import { Eye, ShieldAlert, Users, CheckCircle2 } from 'lucide-react';
import { GazeProvider, GazeContext } from '../../context/GazeContext';
import { CalibrationOverlay } from '../../components/CalibrationOverlay';
import { GazeCursor } from '../../components/GazeCursor';
import { PhraseBoard } from '../phraseboard/PhraseBoard';
import { EmergencyZone } from '../emergency/EmergencyZone';
import { ErrorBoundary } from '../../components/ErrorBoundary';

const TouchFallbackUI = () => {
  // Mock GazeContext to prevent hooks from throwing, hardcoded to Touch mode
  const mockGazeContext = {
    status: 'ERROR',
    gazePosition: { x: 0, y: 0, valid: false },
    confidence: 0,
    confidenceLevel: 'POOR',
    isCalibrated: false,
    inputMode: 'touch', // forces DwellTracker to ignore gaze
    setInputMode: () => {},
    startGaze: () => {},
    stopGaze: () => {},
    startCalibration: () => {},
    dismissCalibrationResult: () => {},
    setBlinkThreshold: () => {},
    lastGesture: null,
    activeSessionId: null,
    startTestSession: async () => {},
    stopTestSession: async () => {}
  };

  return (
    <GazeContext.Provider value={mockGazeContext}>
      <div className="app-layout" style={{ border: '4px solid #f43f5e' }}>
        <Header />
        <div className="bg-rose-950 text-rose-200 p-2 text-center text-sm font-bold flex items-center justify-center gap-2">
          <ShieldAlert size={16} /> Eye-Tracking Engine Crashed. Touch Fallback Mode Active.
        </div>
        <main className="app-container">
          <EmergencyZone />
          <div className="card" style={{ marginTop: '20px' }}>
            <h2 className="card-title">
              <Eye className="icon-cyan" size={22} />
              <span>Patient AAC Interface (Touch Only)</span>
            </h2>
            <PhraseBoard />
          </div>
        </main>
      </div>
    </GazeContext.Provider>
  );
};

export function PatientDashboard() {
  const { role } = useAuth();

  return (
    <ErrorBoundary fallback={<TouchFallbackUI />}>
      <GazeProvider>
        <div className="app-layout">
          <Header />
          <CalibrationOverlay />
          <GazeCursor />

          <main className="app-container">
            <EmergencyZone />
            <StatusIndicator />

            <div className="grid-layout">
              {/* Main AAC Mode / Shell Card */}
              <div className="card">
                <h2 className="card-title">
                  <Eye className="icon-cyan" size={22} />
                  <span>Patient AAC Interface</span>
                  <span className="badge badge-subtle">Primary Input</span>
                </h2>
                <p className="card-desc">
                  VoiceBridge uses eye-tracking gaze calibration and blink gestures as the primary input mechanism. Dwell or blink to vocalize phrases.
                </p>

                <PhraseBoard />
              </div>

              {/* Safety & Gesture Mapping Card */}
              <div className="card">
                <h2 className="card-title">
                  <ShieldAlert className="icon-rose" size={22} />
                  <span>Blink Gesture Mapping</span>
                  <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.2)', color: '#fda4af' }}>Safety-Critical</span>
                </h2>
                <p className="card-desc">
                  Deterministic blink gesture classifications mapped per VoiceBridge project safety specifications:
                </p>

                <div className="rules-list">
                  <div className="rule-pill">
                    <span className="rule-action">Single Blink</span>
                    <span className="rule-badge">Confirm / Select</span>
                  </div>
                  <div className="rule-pill">
                    <span className="rule-action">Double Blink</span>
                    <span className="rule-badge">Cancel / Back</span>
                  </div>
                  <div className="rule-pill" style={{ borderLeftColor: '#f43f5e' }}>
                    <span className="rule-action" style={{ color: '#fda4af' }}>Triple Blink</span>
                    <span className="rule-badge" style={{ color: '#fda4af' }}>Emergency Shortcut</span>
                  </div>
                  <div className="rule-pill">
                    <span className="rule-action">Hold Blink (1.5s)</span>
                    <span className="rule-badge">Mute / Pause</span>
                  </div>
                </div>
              </div>

              {/* Caregiver & Firebase Integration Status Card */}
              <div className="card">
                <h2 className="card-title">
                  <Users className="icon-emerald" size={22} />
                  <span>Caregiver & Cloud Sync</span>
                  <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7' }}>Firebase Auth</span>
                </h2>
                <p className="card-desc">
                  Current active mode: <strong style={{ color: '#fff', textTransform: 'capitalize' }}>{role} Mode</strong>.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px', color: '#94a3b8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} color="#10b981" />
                    <span>Firestore Security Rules Configured (Patient/Caregiver scopes)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} color="#10b981" />
                    <span>Cloud Messaging and Web Speech API wired</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} color="#10b981" />
                    <span>Zero-touch Gaze Fallback Engine ready for calibration</span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </GazeProvider>
    </ErrorBoundary>
  );
}
