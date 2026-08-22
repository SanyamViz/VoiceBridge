import React, { useState, useEffect } from 'react';
import { Heart, Bell, AlertTriangle, PlusCircle, Send, Clock, Activity, PhoneCall, Link as LinkIcon, Trash2, Eye, Hand, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { savePatientPhrase } from '../phraseboard/phraseService';

export function CaregiverDashboard() {
  const { currentUser } = useAuth();
  
  // Dashboard State
  const [patientUid, setPatientUid] = useState('');
  const [isLinked, setIsLinked] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  
  // Patient Data State
  const [isConnected, setIsConnected] = useState(false); // Telemetry status
  const [patientInputMode, setPatientInputMode] = useState('gaze'); // Telemetry input mode
  const [lastSeen, setLastSeen] = useState(null);
  
  const [alerts, setAlerts] = useState([]);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  
  // Audio alarm helper
  const [audioCtx, setAudioCtx] = useState(null);

  const initAudio = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume(); // force resume on interaction
      setAudioCtx(ctx);
      setHasAcknowledged(true);
    } catch (e) {
      console.warn('AudioContext init failed', e);
      setHasAcknowledged(true); // let them through anyway
    }
  };

  const [phrases, setPhrases] = useState([]); // If we ever wanted to show phrases
  const [sessionMetrics, setSessionMetrics] = useState(null);
  
  const [customTileLabel, setCustomTileLabel] = useState('');
  const [customTileEmoji, setCustomTileEmoji] = useState('💬');

  // Play alarm sound for high priority alerts
  const playAlarmSound = () => {
    if (!audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (err) {
      console.log('Audio playback blocked');
    }
  };

  // 1. Fetch Monitoring Link on mount
  useEffect(() => {
    if (!currentUser) return;
    
    const savedPatient = localStorage.getItem('voicebridge_monitored_patient');
    if (savedPatient) {
      setPatientUid(savedPatient);
      setIsLinked(true);
    }
  }, [currentUser]);

  // 2. Listen to Patient Telemetry (Presence)
  useEffect(() => {
    if (!isLinked || !patientUid) return;

    const unsub = onSnapshot(doc(db, 'presence', patientUid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const lastUpdate = data.updatedAt?.toDate() || new Date();
        setLastSeen(lastUpdate);
        
        // Only set tracking if the update was recent
        const isStale = Date.now() - lastUpdate.getTime() > 10000;
        setIsConnected(isStale ? false : data.isTracking);
        setPatientInputMode(data.inputMode || 'gaze');
      } else {
        setIsConnected(false);
      }
    }, (err) => {
      console.error("Telemetry access denied or failed", err);
      setIsConnected(false);
    });

    const stalenessInterval = setInterval(() => {
      setLastSeen((currentLastSeen) => {
        if (currentLastSeen && Date.now() - currentLastSeen.getTime() > 10000) {
          setIsConnected(false);
        }
        return currentLastSeen;
      });
    }, 5000);

    return () => {
      unsub();
      clearInterval(stalenessInterval);
    };
  }, [isLinked, patientUid]);

  // 3. Listen to Patient Alerts
  useEffect(() => {
    if (!isLinked || !patientUid) return;

    const q = query(
      collection(db, 'alerts'),
      where('patientUid', '==', patientUid),
      orderBy('createdAt', 'desc'),
      limit(6)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const newAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAlerts(newAlerts);
      
      // If there's a new active alert within the last 10 seconds, play sound
      const hasRecentActive = newAlerts.some(a => 
        a.status === 'active' && 
        a.createdAt && 
        (Date.now() - a.createdAt.toDate().getTime() < 10000)
      );
      
      if (hasRecentActive) {
        playAlarmSound();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🚨 VOICEBRIDGE EMERGENCY ALERT', {
            body: 'Patient triggered an SOS request!',
          });
        }
      }
    }, (err) => {
      console.error("Alerts access denied or failed", err);
    });

    return () => unsub();
  }, [isLinked, patientUid]);

  // 4. Listen to Live Test Session Metrics
  useEffect(() => {
    if (!isLinked || !patientUid) return;

    const q = query(
      collection(db, 'sessions'),
      where('patientUid', '==', patientUid),
      where('status', '==', 'active'),
      orderBy('startTime', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setSessionMetrics(snapshot.docs[0].data().metrics);
      } else {
        setSessionMetrics(null);
      }
    }, (err) => {
      console.error("Sessions access denied or failed", err);
    });

    return () => unsub();
  }, [isLinked, patientUid]);

  const handleLinkPatient = async (e) => {
    e.preventDefault();
    const targetUid = linkInput.trim();
    if (!targetUid || !currentUser) return;
    
    try {
      const linkId = `${currentUser.uid}_${targetUid}`;
      const savePromise = setDoc(doc(db, 'monitoring_links', linkId), {
        caregiverUid: currentUser.uid,
        patientUid: targetUid,
        createdAt: new Date()
      });
      // 3 second timeout for offline/local-dev support
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([savePromise, timeoutPromise]);
    } catch (err) {
      console.warn('Note on link save:', err);
    } finally {
      setPatientUid(targetUid);
      setIsLinked(true);
      localStorage.setItem('voicebridge_monitored_patient', targetUid);
    }
  };
  
  const handleUnlinkPatient = async () => {
    if (!currentUser || !patientUid) return;
    
    try {
      const linkId = `${currentUser.uid}_${patientUid}`;
      const deletePromise = deleteDoc(doc(db, 'monitoring_links', linkId));
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([deletePromise, timeoutPromise]);
    } catch (err) {
      console.error('Failed to unlink patient:', err);
    } finally {
      setIsLinked(false);
      setPatientUid('');
      localStorage.removeItem('voicebridge_monitored_patient');
    }
  };

  const handleInjectTile = async (e) => {
    e.preventDefault();
    const cleanLabel = customTileLabel.trim();
    if (!cleanLabel || !isLinked || !patientUid || cleanLabel.length > 40) return;

    try {
      const savePromise = savePatientPhrase(patientUid, {
        id: `tile_${Date.now()}`,
        text: cleanLabel.toUpperCase(),
        category: 'custom',
        order: Date.now() // rough order
      });
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 3000));
      await Promise.race([savePromise, timeoutPromise]);
      
      setCustomTileLabel('');
    } catch (err) {
      console.error("Failed to inject tile:", err);
      alert('Failed to inject tile. Check permissions.');
    }
  };

  // If not linked yet, show Linking UI
  if (!isLinked) {
    return (
      <div className="app-container" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
            <Heart size={32} color="var(--accent-rose)" />
            <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Caregiver Hub</h1>
          </div>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
            Link to a patient's terminal using their secure UID to monitor alerts and manage their phrase board.
          </p>

          <form onSubmit={handleLinkPatient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                Patient UID
              </label>
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="e.g. dev-patient-123"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-subtle)',
                  color: '#fff',
                  fontSize: '15px',
                  outline: 'none'
                }}
                required
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              style={{
                width: '100%',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '15px',
                background: 'var(--accent-emerald)',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <LinkIcon size={18} /> Establish Secure Link
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Audio Acknowledgement Gate (FINDING 8)
  if (!hasAcknowledged) {
    return (
      <div className="app-container" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '32px', textAlign: 'center' }}>
          <ShieldAlert size={48} color="var(--accent-rose)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>Start Monitoring</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
            You must acknowledge this prompt to allow critical SOS alarm sounds to play in the background.
          </p>
          <button
            onClick={initAudio}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              background: 'var(--accent-emerald)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Acknowledge & Start
          </button>
        </div>
      </div>
    );
  }

  // Active Monitoring Dashboard UI
  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header className="card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(244, 63, 94, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
            <Heart className="icon-pulse" size={28} color="var(--accent-rose)" fill="var(--accent-rose)" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>VoiceBridge Caregiver Hub</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Monitoring Patient: <span style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{patientUid}</span></p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px' }}>
          {/* Input Mode Badge */}
          <div className="badge-subtle" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: 'var(--radius-full)' }}>
            {patientInputMode === 'touch' ? (
               <><Hand size={16} color="var(--accent-amber)" /><span style={{ fontWeight: '600' }}>TOUCH INPUT</span></>
            ) : (
               <><Eye size={16} color="var(--accent-cyan)" /><span style={{ fontWeight: '600' }}>GAZE INPUT</span></>
            )}
          </div>
          {/* Stream Status Badge */}
          <div className="badge-subtle" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: 'var(--radius-full)', border: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)', boxShadow: isConnected ? '0 0 8px var(--accent-emerald)' : 'none', animation: isConnected ? 'pulse-glow 2s infinite' : 'none' }} />
            <span style={{ fontWeight: '600', color: isConnected ? 'var(--text-primary)' : 'var(--accent-rose)' }}>{isConnected ? 'LIVE STREAM' : 'OFFLINE'}</span>
          </div>
          <button 
            onClick={handleUnlinkPatient}
            className="btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={16} /> Unlink
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', flex: 1 }}>
        {/* Feed Stream */}
        <div className="card" style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="card-title">
              <Activity size={22} color="var(--accent-emerald)" /> Patient Emergency Feed
            </h2>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{alerts.length} alerts logged</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '14px' }}>
                No alerts recorded for this patient.
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: alert.status === 'active' ? '1px solid var(--accent-rose)' : '1px solid var(--border-subtle)',
                    background: alert.status === 'active' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: alert.status === 'active' ? 1 : 0.7
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {alert.status === 'active' ? (
                      <AlertTriangle size={24} color="var(--accent-rose)" className="icon-pulse" />
                    ) : (
                      <CheckCircle2 size={20} color="var(--accent-emerald)" />
                    )}
                    <div>
                      <p style={{ fontWeight: '700', fontSize: '15px', color: alert.status === 'active' ? '#fff' : 'var(--text-primary)' }}>
                        {alert.type === 'TRIPLE_BLINK_OR_DWELL' ? 'Gaze/Blink Emergency Triggered' : 'SOS Alert'}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <Clock size={12} /> 
                        {alert.createdAt ? alert.createdAt.toDate().toLocaleTimeString() : 'Just now'}
                      </p>
                    </div>
                  </div>

                  <span className="badge" style={{ background: alert.status === 'active' ? 'var(--accent-rose)' : 'transparent', border: alert.status === 'active' ? 'none' : '1px solid var(--border-subtle)', color: alert.status === 'active' ? '#fff' : 'var(--text-secondary)' }}>
                    {alert.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Injector & Metrics Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: '8px' }}>
              <PlusCircle size={22} color="var(--accent-emerald)" /> Remote Tile Injector
            </h2>
            <p className="card-desc" style={{ marginBottom: '24px' }}>
              Create and inject new response cards directly onto the patient's eye-gaze grid in real-time.
            </p>

            <form onSubmit={handleInjectTile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>Card Phrase / Text</label>
                <input
                  type="text"
                  value={customTileLabel}
                  onChange={(e) => setCustomTileLabel(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. CALL NURSE ANITA"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', width: '100%' }}>
                <Send size={16} /> Inject Tile to Patient Screen
              </button>
            </form>

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <p style={{ fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <PhoneCall size={14} color="var(--accent-rose)" /> Emergency Dispatch Status
              </p>
              <p>Caregiver SMS Notifications: <span style={{ color: 'var(--accent-emerald)', fontWeight: '700' }}>ACTIVE</span></p>
            </div>
          </div>
          
          {/* Live Test Metrics (if active) */}
          {sessionMetrics && (
            <div className="card">
              <h2 className="card-title" style={{ marginBottom: '16px', color: '#c084fc' }}>
                <Activity size={22} color="#c084fc" /> Live Test Metrics
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Dwell Success</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-emerald)' }}>{sessionMetrics.dwellSuccessCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Dwell Aborts</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-rose)' }}>{sessionMetrics.dwellFailCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Blinks Detected</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-cyan)' }}>{sessionMetrics.gestureCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Mode Switches</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-amber)' }}>{sessionMetrics.modeSwitchCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Time to SOS</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#fff' }}>
                    {sessionMetrics.timeToEmergencyMs > 0 ? `${(sessionMetrics.timeToEmergencyMs / 1000).toFixed(1)}s` : '--'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
