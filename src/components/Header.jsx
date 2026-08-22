import React from 'react';
import { ShieldAlert, User, Eye, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { currentUser, role, setDevRoleOverride, signOut } = useAuth();

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-logo">
          <Eye className="brand-icon" size={24} />
          <span className="brand-name">VoiceBridge</span>
        </div>
        <span className="badge badge-subtle">AAC Primary Gaze Input</span>
      </div>

      <div className="header-right">
        {/* Development Role Switcher */}
        <div className="role-switch-container">
          <span className="role-switch-label">Role:</span>
          <button
            id="role-patient-btn"
            className={`pill-btn ${role === 'patient' ? 'active' : ''}`}
            onClick={() => setDevRoleOverride('patient')}
          >
            Patient
          </button>
          <button
            id="role-caregiver-btn"
            className={`pill-btn ${role === 'caregiver' ? 'active' : ''}`}
            onClick={() => setDevRoleOverride('caregiver')}
          >
            Caregiver
          </button>
        </div>

        {currentUser ? (
          <div className="user-profile-widget">
            <span className="user-email">{currentUser.email || 'Dev User'}</span>
            <button className="btn-secondary btn-sm" onClick={() => signOut()}>
              Sign Out
            </button>
          </div>
        ) : (
          <div className="auth-status-chip">
            <span className="status-dot online"></span>
            <span>Auth Shell Active</span>
          </div>
        )}
      </div>
    </header>
  );
}
