import React from 'react';
import { useAuth } from './context/AuthContext';
import { PatientDashboard } from './features/patient/PatientDashboard';
import { CaregiverDashboard } from './features/caregiver/CaregiverDashboard';

export function App() {
  const { role } = useAuth();

  if (role === 'caregiver') {
    return <CaregiverDashboard />;
  }

  return <PatientDashboard />;
}
export default App;
