import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGaze } from '../../context/GazeContext';
import { subscribeToPatientPhrases } from './phraseService';
import { useDwellTracker } from './useDwellTracker';
import { speakPhrase } from './index';

export function PhraseBoard() {
  const { currentUser } = useAuth();
  const [phrases, setPhrases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to phrases on mount
  useEffect(() => {
    const unsub = subscribeToPatientPhrases(currentUser?.uid, (data) => {
      setPhrases(data);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  // Gaze-based auto-scrolling
  const { gazePosition } = useGaze();
  useEffect(() => {
    if (!gazePosition || !gazePosition.valid) return;
    
    const y = gazePosition.y;
    const h = window.innerHeight;
    
    // Scroll speed
    const speed = 8;
    
    if (y < h * 0.15) {
       // Look up -> scroll up
       window.scrollBy({ top: -speed, behavior: 'auto' });
    } else if (y > h * 0.85) {
       // Look down -> scroll down
       window.scrollBy({ top: speed, behavior: 'auto' });
    }
  }, [gazePosition]);

  // Handle selection (either via dwell or blink)
  const handleSelect = (phraseId) => {
    const phrase = phrases.find(p => p.id === phraseId);
    if (phrase) {
      speakPhrase(phrase.text);
      
      // Visual feedback blink on the button (handled via CSS class in a real app,
      // but here we just rely on the TTS audio feedback for immediate response)
      console.log('[PhraseBoard] Selected:', phrase.text);
    }
  };

  // Wire up the dwell tracker
  const { hoveredId, progress } = useDwellTracker({
    dwellTimeMs: 1500,
    onSelect: handleSelect
  });

  if (loading) {
    return <div className="phraseboard-loading">Loading phrases...</div>;
  }

  return (
    <div className="phraseboard-container">
      <div className="phraseboard-grid">
        {phrases.map(phrase => {
          const isHovered = hoveredId === phrase.id;
          return (
            <button
              key={phrase.id}
              className={`phrase-tile ${isHovered ? 'hovered' : ''} ${phrase.category === 'urgent' ? 'urgent' : ''}`}
              data-dwell-target="true"
              data-phrase-id={phrase.id}
              onClick={() => handleSelect(phrase.id)} // Fallback for touch
            >
              <div className="phrase-tile-content">
                <Volume2 size={24} className="phrase-icon" />
                <span className="phrase-text">{phrase.text}</span>
              </div>
              
              {/* Dwell Progress Ring/Bar */}
              {isHovered && (
                <div 
                  className="dwell-progress-bar"
                  style={{ width: `${progress * 100}%` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
