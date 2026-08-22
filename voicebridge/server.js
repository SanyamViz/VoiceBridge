import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// Server Health Endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'VoiceBridge Server Running', timestamp: new Date() });
});

// Initial Patient Grid Presets Endpoint
app.get('/api/patient/tiles', (req, res) => {
  res.json([
    { id: 'tile_1', label: 'I NEED WATER', icon: '🥛', color: 'bg-blue-600' },
    { id: 'tile_2', label: 'IN SEVERE PAIN', icon: '⚠️', color: 'bg-rose-600' },
    { id: 'tile_3', label: 'ADJUST BED', icon: '🛏️', color: 'bg-amber-600' },
    { id: 'tile_4', label: 'THANK YOU', icon: '🙏', color: 'bg-emerald-600' }
  ]);
});

const server = createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['*'] },
  transports: ['polling', 'websocket']
});

io.on('connection', (socket) => {
  console.log('⚡ Device Connected:', socket.id);

  // ---------------------------------------------------------
  // 1. PATIENT-INITIATED EVENTS (Patient App -> Caregiver Hub)
  // ---------------------------------------------------------

  // Patient selects/speaks a card tile (gaze dwell, blink, or tap)
  socket.on('patient_phrase_spoken', (data) => {
    console.log('🗣️ Patient Spoke:', data);
    
    // Broadcast to Caregiver Hub feed
    io.emit('caregiver_feed_update', {
      id: Date.now(),
      type: 'phrase',
      text: data.phrase,
      timestamp: new Date().toLocaleTimeString(),
      priority: data.priority || 'normal'
    });
  });

  // Patient triggers emergency SOS gaze hold
  socket.on('patient_sos_triggered', (data) => {
    console.log('🚨 EMERGENCY SOS TRIGGERED by Patient');
    
    // Broadcast high-priority alert to Caregiver Hub
    io.emit('caregiver_feed_update', {
      id: Date.now(),
      type: 'sos',
      text: '🚨 CRITICAL: EMERGENCY HELP REQUESTED',
      timestamp: new Date().toLocaleTimeString(),
      priority: 'high'
    });
  });

  // ---------------------------------------------------------
  // 2. CAREGIVER-INITIATED EVENTS (Caregiver Hub -> Patient App)
  // ---------------------------------------------------------

  // Caregiver injects a custom phrase card onto the patient's screen
  socket.on('caregiver_add_tile', (tileData) => {
    console.log('➕ Caregiver Injected Tile:', tileData);
    
    // Send new tile directly to Patient App
    io.emit('patient_receive_new_tile', tileData);
  });

  socket.on('disconnect', () => {
    console.log('❌ Device Disconnected:', socket.id);
  });
});

const PORT = 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VoiceBridge Dual-App Server running on http://localhost:${PORT}`);
});