import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { EmergencyZone } from './EmergencyZone';
import { useAuth } from '../../context/AuthContext';
import { useGaze } from '../../context/GazeContext';
import { useDwellTracker } from '../phraseboard/useDwellTracker';
import { sendEmergencyAlert } from './emergencyService';
import { BLINK_GESTURE } from '../gaze/blinkDetector';

// Mock dependencies
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('../../context/GazeContext', () => ({
  useGaze: vi.fn()
}));

vi.mock('../phraseboard/useDwellTracker', () => ({
  useDwellTracker: vi.fn()
}));

vi.mock('./emergencyService', () => ({
  sendEmergencyAlert: vi.fn()
}));

describe('EmergencyZone Component', () => {
  let mockOnSelect;

  beforeEach(() => {
    vi.useFakeTimers();

    useAuth.mockReturnValue({
      currentUser: { uid: 'test-patient-123' }
    });

    useGaze.mockReturnValue({
      lastGesture: null
    });

    useDwellTracker.mockImplementation(({ onSelect }) => {
      mockOnSelect = onSelect;
      return { hoveredId: null, progress: 0 };
    });

    sendEmergencyAlert.mockResolvedValue('fake-doc-id');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders in IDLE state by default', () => {
    render(<EmergencyZone />);
    expect(screen.getByText('EMERGENCY')).toBeDefined();
    expect(screen.getByText('Dwell or Double-Blink to Alert')).toBeDefined();
  });

  it('triggers alert on DOUBLE blink gesture', async () => {
    const { rerender } = render(<EmergencyZone />);
    
    // Simulate triple blink from context
    useGaze.mockReturnValue({
      lastGesture: { gesture: BLINK_GESTURE.DOUBLE, timestamp: Date.now() }
    });
    
    rerender(<EmergencyZone />);
    
    // Should immediately switch to sending state
    expect(screen.getByText('SENDING ALERT...')).toBeDefined();
    expect(sendEmergencyAlert).toHaveBeenCalledWith('test-patient-123');

    // Resolve the promise
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('ALERT SENT')).toBeDefined();
  });

  it('triggers alert on gaze dwell completion', async () => {
    render(<EmergencyZone />);
    
    // Simulate useDwellTracker calling onSelect
    act(() => {
      mockOnSelect('emergency-trigger');
    });
    
    expect(screen.getByText('SENDING ALERT...')).toBeDefined();
    expect(sendEmergencyAlert).toHaveBeenCalledWith('test-patient-123');
    
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('ALERT SENT')).toBeDefined();
  });

  it('handles FCM / network failure gracefully', async () => {
    sendEmergencyAlert.mockRejectedValue(new Error('Network error'));
    
    render(<EmergencyZone />);
    
    act(() => {
      mockOnSelect('emergency-trigger');
    });
    
    expect(screen.getByText('SENDING ALERT...')).toBeDefined();
    
    await act(async () => {
      // Allow rejection to process
      await Promise.resolve();
    });

    // Should show error state
    expect(screen.getByText('FAILED TO SEND')).toBeDefined();
    expect(screen.getByText('Network error')).toBeDefined();
  });

  it('auto-resets back to IDLE after success', async () => {
    render(<EmergencyZone />);
    
    act(() => {
      mockOnSelect('emergency-trigger');
    });
    
    await act(async () => {
      await Promise.resolve();
    });
    
    expect(screen.getByText('ALERT SENT')).toBeDefined();
    
    // Fast forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    
    expect(screen.getByText('EMERGENCY')).toBeDefined();
  });

  it('triggers via hidden touch fallback (for subagent testing)', async () => {
    render(<EmergencyZone />);
    const btn = document.getElementById('emergency-zone-btn');
    
    fireEvent.click(btn);
    
    expect(screen.getByText('SENDING ALERT...')).toBeDefined();
    expect(sendEmergencyAlert).toHaveBeenCalledWith('test-patient-123');
  });
});
