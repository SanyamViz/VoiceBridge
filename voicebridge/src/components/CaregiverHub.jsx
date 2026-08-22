import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Heart, Bell, AlertTriangle, PlusCircle, Send, Clock, Activity, PhoneCall } from 'lucide-react';

// Connect to backend server
const socket = io('http://localhost:4000');

export default function CaregiverHub() {
  const [logs, setLogs] = useState([
    { id: 1, type: 'system', text: 'Caregiver Hub connected to Patient Terminal #01', timestamp: new Date().toLocaleTimeString(), priority: 'normal' }
  ]);
  const [customTileLabel, setCustomTileLabel] = useState('');
  const [customTileEmoji, setCustomTileEmoji] = useState('💬');
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Listen for live messages/SOS from Patient
    socket.on('caregiver_feed_update', (newLog) => {
      setLogs((prevLogs) => [newLog, ...prevLogs]);
      
      // Optional: Play audio chime for high priority SOS
      if (newLog.priority === 'high') {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('caregiver_feed_update');
    };
  }, []);

  // Dispatch custom phrase tile to Patient App
  const handleInjectTile = (e) => {
    e.preventDefault();
    if (!customTileLabel.trim()) return;

    const newTile = {
      id: `tile_${Date.now()}`,
      label: customTileLabel.toUpperCase(),
      icon: customTileEmoji || '💬',
      color: 'bg-emerald-600'
    };

    socket.emit('caregiver_add_tile', newTile);
    setCustomTileLabel('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* Dashboard Top Navigation */}
      <header className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
            <Heart className="w-7 h-7 text-rose-500 fill-rose-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">AugmentCom Caregiver Hub</h1>
            <p className="text-xs text-slate-400">Monitoring Bedside Terminal • Room 204</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-full">
            <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-500'}`} />
            <span className="font-semibold text-slate-300">{isConnected ? 'LIVE STREAM' : 'OFFLINE'}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Activity & Alert Stream */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" /> Patient Activity & Emergency Feed
              </h2>
              <span className="text-xs text-slate-500">{logs.length} events logged</span>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                    log.priority === 'high'
                      ? 'bg-rose-950/60 border-rose-700 text-rose-100 shadow-lg shadow-rose-950/50'
                      : 'bg-slate-950/60 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {log.priority === 'high' ? (
                      <AlertTriangle className="w-6 h-6 text-rose-400 animate-bounce" />
                    ) : (
                      <Bell className="w-5 h-5 text-emerald-400" />
                    )}
                    <div>
                      <p className="font-bold text-base tracking-wide">{log.text}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {log.timestamp}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border ${
                      log.priority === 'high'
                        ? 'bg-rose-900 border-rose-600 text-rose-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {log.priority === 'high' ? 'CRITICAL SOS' : 'EVENT'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Remote Tile Injector Controls */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-400" /> Remote Tile Injector
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Create and inject new response cards directly onto the patient's eye-gaze grid in real-time.
            </p>

            <form onSubmit={handleInjectTile} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block font-medium">Card Phrase / Text</label>
                <input
                  type="text"
                  value={customTileLabel}
                  onChange={(e) => setCustomTileLabel(e.target.value)}
                  placeholder="e.g. CALL NURSE ANITA"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block font-medium">Emoji Icon</label>
                <input
                  type="text"
                  value={customTileEmoji}
                  onChange={(e) => setCustomTileEmoji(e.target.value)}
                  placeholder="e.g. 👩‍⚕️"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950"
              >
                <Send className="w-4 h-4" /> Inject Tile to Patient Screen
              </button>
            </form>
          </div>

          <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <PhoneCall className="w-3.5 h-3.5 text-rose-400" /> Emergency Dispatch Status
            </p>
            <p>Caregiver SMS Notifications: <span className="text-emerald-400 font-bold">ACTIVE</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}