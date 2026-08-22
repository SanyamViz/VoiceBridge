/**
 * Feature: Phrase Board & TTS
 * Dwell-to-select phrase board with Web Speech API integration.
 */
export const DEFAULT_PHRASES = [
  { id: '1', text: 'Yes', category: 'basic' },
  { id: '2', text: 'No', category: 'basic' },
  { id: '3', text: 'Thank you', category: 'basic' },
  { id: '4', text: 'I need water', category: 'needs' },
  { id: '5', text: 'I am in pain', category: 'needs' },
  { id: '7', text: 'Call caregiver', category: 'urgent' }
];

export function speakPhrase(text, options = {}) {
  if (!('speechSynthesis' in window)) {
    console.warn('[TTS] Speech Synthesis is not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate || 1.0;
  utterance.pitch = options.pitch || 1.0;
  window.speechSynthesis.speak(utterance);
}
