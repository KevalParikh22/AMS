import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isCloudMode } from '../lib/supabase';

const AuthContext = createContext();

export const ROLES = {
  ADMIN: 'Admin',
  COORDINATOR: 'Coordinator',
  ATTENDANCE_VOLUNTEER: 'Attendance Volunteer',
  REGISTRATION_VOLUNTEER: 'Registration Volunteer'
};

const MOCK_USERS = [
  { id: '1', username: 'admin', name: 'Amit Patel', role: ROLES.ADMIN, enabled: true },
  { id: '2', username: 'coordinator', name: 'Rahul Sharma', role: ROLES.COORDINATOR, enabled: true },
  { id: '3', username: 'attendance_vol', name: 'Jayesh Vyas', role: ROLES.ATTENDANCE_VOLUNTEER, enabled: true },
  { id: '4', username: 'reg_vol', name: 'Sanjay Shah', role: ROLES.REGISTRATION_VOLUNTEER, enabled: true }
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    if (isCloudMode) return null; // session restores async via Supabase
    const savedUser = localStorage.getItem('ams_auth_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  // Cloud password-recovery flow: true after the user follows a reset link
  const [recoveryMode, setRecoveryMode] = useState(false);

  // Cloud mode: track the Supabase session and hydrate role from profiles
  useEffect(() => {
    if (!isCloudMode) return;
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      if (!session) {
        setUser(null);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (!profile || !profile.enabled) {
        await supabase.auth.signOut();
        setUser(null);
        return;
      }
      setUser({
        id: session.user.id,
        username: session.user.email,
        name: profile.name || session.user.email,
        role: profile.role
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Managed user accounts persist in localStorage; legacy entries without
  // an `enabled` flag are treated as enabled. In cloud mode the list comes
  // from the Supabase profiles table instead (fetched below for admins).
  const [users, setUsers] = useState(() => {
    if (isCloudMode) return [];
    const stored = localStorage.getItem('ams_users');
    if (stored) {
      return JSON.parse(stored).map(u => ({ ...u, enabled: u.enabled !== false }));
    }
    localStorage.setItem('ams_users', JSON.stringify(MOCK_USERS));
    return MOCK_USERS;
  });

  // Cloud mode: admins see the full profiles list (RLS restricts others)
  useEffect(() => {
    if (!isCloudMode || !user || user.role !== ROLES.ADMIN) return;
    supabase.from('profiles').select('*').order('created_at').then(({ data }) => {
      if (data) {
        setUsers(data.map(p => ({
          id: p.id,
          username: p.id, // profiles hold no email client-side; id keys the row
          name: p.name,
          role: p.role,
          enabled: p.enabled
        })));
      }
    });
  }, [user?.id, user?.role]);

  const saveUsers = (updated) => {
    setUsers(updated);
    localStorage.setItem('ams_users', JSON.stringify(updated));
  };

  const login = (username, customRole) => {
    // If it's a managed user account
    const found = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (found) {
      if (!found.enabled) {
        return { success: false, message: 'This account has been disabled. Contact the administrator.' };
      }
      setUser(found);
      localStorage.setItem('ams_auth_user', JSON.stringify(found));
      return { success: true };
    }

    // Support write-in custom user for testing convenience
    if (username.trim()) {
      const customUser = {
        id: 'custom_' + Date.now(),
        username: username.toLowerCase().replace(/\s+/g, '_'),
        name: username,
        role: customRole || ROLES.ATTENDANCE_VOLUNTEER
      };
      setUser(customUser);
      localStorage.setItem('ams_auth_user', JSON.stringify(customUser));
      return { success: true };
    }

    return { success: false, message: 'Please enter a valid name' };
  };

  // --- User management (Admin only) ---

  const addManagedUser = (name, username, role) => {
    if (user?.role !== ROLES.ADMIN) {
      return { success: false, message: 'Only administrators can manage users.' };
    }
    if (isCloudMode) {
      return {
        success: false,
        message: 'In cloud mode, create accounts from the Supabase dashboard (Authentication → Users), then set their role here.'
      };
    }
    const uname = username.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name.trim() || !uname) {
      return { success: false, message: 'Name and username are required.' };
    }
    if (users.some(u => u.username === uname)) {
      return { success: false, message: 'That username already exists.' };
    }
    saveUsers([...users, {
      id: 'U-' + Date.now(),
      username: uname,
      name: name.trim(),
      role: role || ROLES.ATTENDANCE_VOLUNTEER,
      enabled: true
    }]);
    return { success: true, username: uname };
  };

  const setManagedUserEnabled = (username, enabled) => {
    if (user?.role !== ROLES.ADMIN) {
      return { success: false, message: 'Only administrators can manage users.' };
    }
    const target = users.find(u => u.username === username);
    if (!target) return { success: false, message: 'User not found.' };
    if (!enabled) {
      const isSelf = isCloudMode ? target.id === user.id : target.username === user.username;
      if (isSelf) {
        return { success: false, message: 'You cannot disable your own account.' };
      }
      const remainingAdmins = users.filter(u => u.role === ROLES.ADMIN && u.enabled && u.username !== username);
      if (target.role === ROLES.ADMIN && remainingAdmins.length === 0) {
        return { success: false, message: 'At least one enabled admin account is required.' };
      }
    }
    if (isCloudMode) {
      supabase.from('profiles').update({ enabled }).eq('id', target.id).then(({ error }) => {
        if (!error) setUsers(prev => prev.map(u => u.id === target.id ? { ...u, enabled } : u));
      });
      return { success: true };
    }
    saveUsers(users.map(u => u.username === username ? { ...u, enabled } : u));
    return { success: true };
  };

  // Cloud mode: admins can change a user's role from the app
  const setManagedUserRole = (id, role) => {
    if (!isCloudMode || user?.role !== ROLES.ADMIN) {
      return { success: false, message: 'Only administrators can manage users.' };
    }
    if (!Object.values(ROLES).includes(role)) return { success: false, message: 'Invalid role.' };
    if (id === user.id && role !== ROLES.ADMIN) {
      return { success: false, message: 'You cannot demote your own account.' };
    }
    supabase.from('profiles').update({ role }).eq('id', id).then(({ error }) => {
      if (!error) setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    });
    return { success: true };
  };

  const logout = () => {
    if (isCloudMode) {
      supabase.auth.signOut();
      setUser(null);
      return;
    }
    setUser(null);
    localStorage.removeItem('ams_auth_user');
  };

  // --- Cloud auth (email/password via Supabase) ---

  const loginWithEmail = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    return { success: true }; // onAuthStateChange hydrates the user
  };

  const requestPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Password reset email sent. Check your inbox.' };
  };

  const completePasswordReset = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, message: error.message };
    setRecoveryMode(false);
    return { success: true };
  };

  // Helper getters for permission verification
  const hasPermission = (requiredRole) => {
    if (!user) return false;
    if (user.role === ROLES.ADMIN) return true; // Admin overrides all
    if (requiredRole === ROLES.ADMIN) return false; // Admin-only actions for everyone else
    if (requiredRole === ROLES.COORDINATOR) {
      return user.role === ROLES.COORDINATOR;
    }
    if (requiredRole === ROLES.REGISTRATION_VOLUNTEER) {
      return user.role === ROLES.COORDINATOR || user.role === ROLES.REGISTRATION_VOLUNTEER;
    }
    return true; // Volunteer actions are base level
  };

  // Guardian contact details are visible only to authorized roles (BRD rule);
  // Attendance Volunteers see them masked.
  const canViewGuardianDetails = !!user && (
    user.role === ROLES.ADMIN ||
    user.role === ROLES.COORDINATOR ||
    user.role === ROLES.REGISTRATION_VOLUNTEER
  );

  return (
    <AuthContext.Provider value={{
      user, login, logout, hasPermission, canViewGuardianDetails,
      users, addManagedUser, setManagedUserEnabled, setManagedUserRole,
      loginWithEmail, requestPasswordReset, completePasswordReset, recoveryMode,
      MOCK_USERS
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
