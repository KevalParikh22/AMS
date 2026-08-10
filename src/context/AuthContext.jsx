import React, { createContext, useContext, useState, useEffect } from 'react';

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
    const savedUser = localStorage.getItem('ams_auth_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Managed user accounts persist in localStorage; legacy entries without
  // an `enabled` flag are treated as enabled.
  const [users, setUsers] = useState(() => {
    const stored = localStorage.getItem('ams_users');
    if (stored) {
      return JSON.parse(stored).map(u => ({ ...u, enabled: u.enabled !== false }));
    }
    localStorage.setItem('ams_users', JSON.stringify(MOCK_USERS));
    return MOCK_USERS;
  });

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
      if (target.username === user.username) {
        return { success: false, message: 'You cannot disable your own account.' };
      }
      const remainingAdmins = users.filter(u => u.role === ROLES.ADMIN && u.enabled && u.username !== username);
      if (target.role === ROLES.ADMIN && remainingAdmins.length === 0) {
        return { success: false, message: 'At least one enabled admin account is required.' };
      }
    }
    saveUsers(users.map(u => u.username === username ? { ...u, enabled } : u));
    return { success: true };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ams_auth_user');
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
    <AuthContext.Provider value={{ user, login, logout, hasPermission, canViewGuardianDetails, users, addManagedUser, setManagedUserEnabled, MOCK_USERS }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
