import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUserProfile, signInWithEmail, signUpWithEmail, signOutUser } from '../firebase/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Mock switch mode for local development/testing without live Firebase keys
  const [devRoleOverride, setDevRoleOverride] = useState('patient');

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        if (user) {
          const profile = await getUserProfile(user.uid);
          setUserProfile(profile || {
            uid: user.uid,
            email: user.email,
            role: devRoleOverride
          });
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      }, (error) => {
        console.warn('[AuthContext] Auth listener notice (running in dev mode):', error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (err) {
      console.warn('[AuthContext] Firebase auth not fully initialized; fallback to dev mode', err);
      setLoading(false);
    }
  }, [devRoleOverride]);

  const mockUser = { uid: `dev-${devRoleOverride}-123`, email: `dev@${devRoleOverride}.local` };

  const value = {
    currentUser: currentUser || mockUser,
    userProfile,
    role: userProfile?.role || devRoleOverride,
    setDevRoleOverride,
    loading,
    signIn: signInWithEmail,
    signUp: signUpWithEmail,
    signOut: signOutUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
