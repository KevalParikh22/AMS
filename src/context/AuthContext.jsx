import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const ROLES = {
  ADMIN: 'Admin',
  COORDINATOR: 'Coordinator',
  ATTENDANCE_VOLUNTEER: 'Attendance Volunteer',
  REGISTRATION_VOLUNTEER: 'Registration Volunteer'
};

const MOCK_USERS = [
  { id: '1', username: 'admin', name: 'Amit Patel', role: ROLES.ADMIN },
  { id: '2', username: 'coordinator', name: 'Rahul Sharma', role: ROLES.COORDINATOR },
  { id: '3', username: 'attendance_vol', name: 'Jayesh Vyas', role: ROLES.ATTENDANCE_VOLUNTEER },
  { id: '4', username: 'reg_vol', name: 'Sanjay Shah', role: ROLES.REGISTRATION_VOLUNTEER }
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('ams_auth_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = (username, customRole) => {
    // If it's a preconfigured mock user
    const found = MOCK_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (found) {
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

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ams_auth_user');
  };

  // Helper getters for permission verification
  const hasPermission = (requiredRole) => {
    if (!user) return false;
    if (user.role === ROLES.ADMIN) return true; // Admin overrides all
    if (requiredRole === ROLES.COORDINATOR) {
      return user.role === ROLES.COORDINATOR;
    }
    if (requiredRole === ROLES.REGISTRATION_VOLUNTEER) {
      return user.role === ROLES.COORDINATOR || user.role === ROLES.REGISTRATION_VOLUNTEER;
    }
    return true; // Volunteer actions are base level
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission, MOCK_USERS }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
