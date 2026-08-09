import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const DbContext = createContext();

// Initial Mock Data
const INITIAL_SABHAS = [
  'Bal Sabha - Sub-group A1',
  'Bal Sabha - Sub-group A2',
  'Bal Sabha - Sub-group B1',
  'Kishore Mandal - East Wing',
  'Kishore Mandal - West Wing',
  'Yuva Mandal - Youth'
];

const INITIAL_KARYAKARS = [
  'Ghanshyam Patel',
  'Pramukh Swami Das',
  'Akshar Patel',
  'Mukund Dave',
  'Yogi Joshi',
  'Nilkanth Sharma'
];

const INITIAL_PARTICIPANTS = [
  {
    id: 'P-101',
    name: 'Aarav Patel',
    phone: '9876543210',
    sabha: 'Bal Sabha - Sub-group A1',
    karyakar: 'Ghanshyam Patel',
    guardianDetails: 'Manish Patel (Father) - 9876543211',
    createdAt: '2026-08-01T10:00:00Z',
    isNewRegistration: false,
    pendingReview: false
  },
  {
    id: 'P-102',
    name: 'Devansh Shah',
    phone: '9823456789',
    sabha: 'Bal Sabha - Sub-group A1',
    karyakar: 'Ghanshyam Patel',
    guardianDetails: 'Kiran Shah (Mother) - 9823456780',
    createdAt: '2026-08-01T10:05:00Z',
    isNewRegistration: false,
    pendingReview: false
  },
  {
    id: 'P-103',
    name: 'Harsh Dave',
    phone: '9765432109',
    sabha: 'Bal Sabha - Sub-group A2',
    karyakar: 'Mukund Dave',
    guardianDetails: 'Rajesh Dave (Father) - 9765432100',
    createdAt: '2026-08-02T11:00:00Z',
    isNewRegistration: false,
    pendingReview: false
  },
  {
    id: 'P-104',
    name: 'Mihir Parmar',
    phone: '9123456789',
    sabha: 'Kishore Mandal - East Wing',
    karyakar: 'Akshar Patel',
    guardianDetails: 'Sanjay Parmar (Father) - 9123456780',
    createdAt: '2026-08-03T09:00:00Z',
    isNewRegistration: false,
    pendingReview: false
  },
  {
    id: 'P-105',
    name: 'Rohan Sharma',
    phone: '9988776655',
    sabha: 'Kishore Mandal - West Wing',
    karyakar: 'Yogi Joshi',
    guardianDetails: 'Vijay Sharma (Father) - 9988776650',
    createdAt: '2026-08-04T12:00:00Z',
    isNewRegistration: false,
    pendingReview: false
  },
  {
    id: 'P-106',
    name: 'Siddharth Joshi',
    phone: '9012345678',
    sabha: 'Yuva Mandal - Youth',
    karyakar: 'Nilkanth Sharma',
    guardianDetails: 'Anita Joshi (Mother) - 9012345670',
    createdAt: '2026-08-05T14:00:00Z',
    isNewRegistration: false,
    pendingReview: false
  }
];

const INITIAL_EVENTS = [
  {
    id: 'E-001',
    name: 'Weekly Bal Sabha Assembly',
    date: '2026-08-09',
    startTime: '16:00',
    endTime: '18:00',
    sabhaMandalScope: 'Bal Sabha - Sub-group A1',
    status: 'Active'
  },
  {
    id: 'E-002',
    name: 'Regional Kishore Sammelan',
    date: '2026-08-08',
    startTime: '10:00',
    endTime: '13:00',
    sabhaMandalScope: 'Kishore Mandal - East Wing',
    status: 'Closed'
  },
  {
    id: 'E-003',
    name: 'Independence Day Special Assembly',
    date: '2026-08-15',
    startTime: '09:00',
    endTime: '11:30',
    sabhaMandalScope: 'All Sabhas',
    status: 'Draft'
  }
];

const INITIAL_ATTENDANCE = [
  {
    id: 'A-201',
    eventId: 'E-002',
    participantId: 'P-104',
    status: 'Present',
    markedAt: '2026-08-08T10:15:30Z',
    markedBy: 'Rahul Sharma'
  }
];

export const DbProvider = ({ children }) => {
  const { user } = useAuth();
  
  // Local Database States
  const [participants, setParticipants] = useState([]);
  const [events, setEvents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sabhas, setSabhas] = useState([]);
  const [karyakars, setKaryakars] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  
  // Initialize DB from localStorage or default static templates
  useEffect(() => {
    const db_participants = localStorage.getItem('ams_participants');
    const db_events = localStorage.getItem('ams_events');
    const db_attendance = localStorage.getItem('ams_attendance');
    const db_sabhas = localStorage.getItem('ams_sabhas');
    const db_karyakars = localStorage.getItem('ams_karyakars');
    const db_logs = localStorage.getItem('ams_audit_logs');

    if (db_participants) setParticipants(JSON.parse(db_participants));
    else {
      setParticipants(INITIAL_PARTICIPANTS);
      localStorage.setItem('ams_participants', JSON.stringify(INITIAL_PARTICIPANTS));
    }

    if (db_events) setEvents(JSON.parse(db_events));
    else {
      setEvents(INITIAL_EVENTS);
      localStorage.setItem('ams_events', JSON.stringify(INITIAL_EVENTS));
    }

    if (db_attendance) setAttendance(JSON.parse(db_attendance));
    else {
      setAttendance(INITIAL_ATTENDANCE);
      localStorage.setItem('ams_attendance', JSON.stringify(INITIAL_ATTENDANCE));
    }

    if (db_sabhas) setSabhas(JSON.parse(db_sabhas));
    else {
      setSabhas(INITIAL_SABHAS);
      localStorage.setItem('ams_sabhas', JSON.stringify(INITIAL_SABHAS));
    }

    if (db_karyakars) setKaryakars(JSON.parse(db_karyakars));
    else {
      setKaryakars(INITIAL_KARYAKARS);
      localStorage.setItem('ams_karyakars', JSON.stringify(INITIAL_KARYAKARS));
    }

    if (db_logs) setAuditLogs(JSON.parse(db_logs));
    else {
      const initLog = [{
        id: 'L-1',
        action: 'Database Initialization',
        timestamp: new Date().toISOString(),
        userId: 'system',
        userRole: 'System',
        details: 'Initial mock database loaded successfully.'
      }];
      setAuditLogs(initLog);
      localStorage.setItem('ams_audit_logs', JSON.stringify(initLog));
    }
  }, []);

  // Helper helper to write to storage
  const saveToStorage = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // Add Log Entry
  const addAuditLog = (action, details) => {
    const newLog = {
      id: 'L-' + Date.now() + Math.floor(Math.random() * 100),
      action,
      timestamp: new Date().toISOString(),
      userId: user ? user.name : 'Unauthenticated',
      userRole: user ? user.role : 'Guest',
      details
    };
    
    setAuditLogs(prev => {
      const updated = [newLog, ...prev];
      saveToStorage('ams_audit_logs', updated);
      return updated;
    });
  };

  // Participant search with basic text ranking/fuzzy score matching
  const queryParticipants = (searchString) => {
    if (!searchString || !searchString.trim()) {
      return participants.map(p => ({ item: p, score: 100 }));
    }
    
    const query = searchString.toLowerCase().trim();
    
    return participants.map(p => {
      let score = 0;
      const name = p.name.toLowerCase();
      const phone = p.phone.toLowerCase();
      const sabha = p.sabha.toLowerCase();
      const karyakar = p.karyakar.toLowerCase();
      
      // Match algorithms
      if (phone === query) score += 100;
      else if (phone.includes(query)) score += 50;
      
      if (name === query) score += 90;
      else if (name.startsWith(query)) score += 60;
      else if (name.includes(query)) score += 30;
      
      if (sabha.includes(query)) score += 20;
      if (karyakar.includes(query)) score += 15;
      
      return { item: p, score };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
  };

  // Register or insert spreadsheet imports
  const importExcelData = (parsedRows) => {
    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    const newParticipantsList = [...participants];

    parsedRows.forEach(row => {
      if (!row.name || !row.phone) {
        rejected++;
        return;
      }

      // Check if phone already exists
      const existingIdx = newParticipantsList.findIndex(
        p => p.phone.trim() === String(row.phone).trim()
      );

      if (existingIdx > -1) {
        // Update existing record
        newParticipantsList[existingIdx] = {
          ...newParticipantsList[existingIdx],
          name: row.name || newParticipantsList[existingIdx].name,
          sabha: row.sabha || newParticipantsList[existingIdx].sabha,
          karyakar: row.karyakar || newParticipantsList[existingIdx].karyakar,
          guardianDetails: row.guardianDetails || newParticipantsList[existingIdx].guardianDetails
        };
        updated++;
      } else {
        // Create new record
        const newId = 'P-' + (100 + newParticipantsList.length + 1);
        newParticipantsList.push({
          id: newId,
          name: row.name,
          phone: String(row.phone),
          sabha: row.sabha || 'Unassociated',
          karyakar: row.karyakar || 'None Assigned',
          guardianDetails: row.guardianDetails || '',
          createdAt: new Date().toISOString(),
          isNewRegistration: false,
          pendingReview: false
        });
        inserted++;
      }
    });

    setParticipants(newParticipantsList);
    saveToStorage('ams_participants', newParticipantsList);

    // Audit Log
    addAuditLog(
      'Excel Master Import',
      `Imported raw sheet data. Created ${inserted} new records, updated ${updated} records, and skipped ${rejected} invalid rows.`
    );

    return { inserted, updated, rejected };
  };

  // Events API
  const addEvent = (eventData) => {
    const newEvent = {
      id: 'E-' + (100 + events.length + 1),
      ...eventData,
      status: eventData.status || 'Draft'
    };
    
    const updatedEvents = [...events, newEvent];
    setEvents(updatedEvents);
    saveToStorage('ams_events', updatedEvents);
    addAuditLog('Event Creation', `Created event: "${newEvent.name}" scheduled on ${newEvent.date}.`);
    return newEvent;
  };

  const updateEvent = (eventId, updatedFields) => {
    const updatedEvents = events.map(e => {
      if (e.id === eventId) {
        return { ...e, ...updatedFields };
      }
      return e;
    });
    setEvents(updatedEvents);
    saveToStorage('ams_events', updatedEvents);
    
    const originalEvent = events.find(e => e.id === eventId);
    const details = Object.entries(updatedFields)
      .map(([k, v]) => `${k} changed to "${v}"`)
      .join(', ');
    addAuditLog('Event Update', `Updated event: "${originalEvent.name}" (${eventId}). Fields: ${details}`);
  };

  // Attendance Actions
  const markPresent = (eventId, participantId) => {
    // Check if event is Closed
    const event = events.find(e => e.id === eventId);
    if (!event) return { success: false, message: 'Event not found' };
    if (event.status === 'Closed') {
      return { success: false, message: 'Cannot register attendance: Event is closed.' };
    }

    // Check duplicate
    const duplicate = attendance.find(a => a.eventId === eventId && a.participantId === participantId);
    if (duplicate) {
      return { success: false, message: 'Participant already marked present.' };
    }

    const newAttendance = {
      id: 'A-' + Date.now(),
      eventId,
      participantId,
      status: 'Present',
      markedAt: new Date().toISOString(),
      markedBy: user ? user.name : 'Public Form'
    };

    const updatedAttendance = [...attendance, newAttendance];
    setAttendance(updatedAttendance);
    saveToStorage('ams_attendance', updatedAttendance);

    const participant = participants.find(p => p.id === participantId);
    addAuditLog(
      'Attendance Mark Present',
      `Marked present: ${participant ? participant.name : 'Unknown'} (${participantId}) for Event: ${event.name} (${eventId})`
    );

    return { success: true, attendance: newAttendance };
  };

  const undoAttendance = (eventId, participantId) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return { success: false, message: 'Event not found' };
    if (event.status === 'Closed') {
      return { success: false, message: 'Cannot modify attendance: Event is closed.' };
    }

    const targetIdx = attendance.findIndex(a => a.eventId === eventId && a.participantId === participantId);
    if (targetIdx === -1) {
      return { success: false, message: 'Attendance record not found.' };
    }

    const record = attendance[targetIdx];
    const updated = attendance.filter((_, idx) => idx !== targetIdx);
    
    setAttendance(updated);
    saveToStorage('ams_attendance', updated);

    const participant = participants.find(p => p.id === participantId);
    addAuditLog(
      'Attendance Correction (Undo)',
      `Undid present status for: ${participant ? participant.name : 'Unknown'} (${participantId}) at event: ${event.name}`
    );

    return { success: true };
  };

  // Register New Participant
  const registerNewParticipant = (formData, eventId = null) => {
    const newId = 'P-' + (100 + participants.length + 1);
    const newP = {
      id: newId,
      name: formData.name,
      phone: formData.phone,
      sabha: formData.sabha,
      karyakar: formData.karyakar || 'None Assigned',
      guardianDetails: formData.guardianDetails || '',
      createdAt: new Date().toISOString(),
      isNewRegistration: true,
      pendingReview: formData.pendingReview !== undefined ? formData.pendingReview : false
    };

    const updatedParticipants = [...participants, newP];
    setParticipants(updatedParticipants);
    saveToStorage('ams_participants', updatedParticipants);

    addAuditLog(
      'New Participant Registration',
      `Registered new person: ${newP.name} (ID: ${newId}) assigned to sabha: ${newP.sabha}.`
    );

    // If an active eventId is provided, mark present
    if (eventId) {
      const activeEvent = events.find(e => e.id === eventId);
      if (activeEvent && activeEvent.status === 'Active') {
        markPresent(eventId, newId);
      }
    }

    return newP;
  };

  // Administrative Participant Update
  const updateParticipant = (participantId, updatedFields) => {
    const updatedList = participants.map(p => {
      if (p.id === participantId) {
        return { ...p, ...updatedFields };
      }
      return p;
    });
    setParticipants(updatedList);
    saveToStorage('ams_participants', updatedList);

    const original = participants.find(p => p.id === participantId);
    addAuditLog(
      'Admin Participant Update',
      `Edited details for ${original.name} (${participantId}).`
    );
  };

  // Database Administration
  const clearDatabase = () => {
    setParticipants([]);
    setEvents([]);
    setAttendance([]);
    setAuditLogs([]);
    
    localStorage.removeItem('ams_participants');
    localStorage.removeItem('ams_events');
    localStorage.removeItem('ams_attendance');
    localStorage.removeItem('ams_audit_logs');
    
    const resetLog = [{
      id: 'L-' + Date.now(),
      action: 'Database Wipe',
      timestamp: new Date().toISOString(),
      userId: user ? user.name : 'Administrator',
      userRole: user ? user.role : 'Admin',
      details: 'All participant records, event schedules, and attendance metrics cleared.'
    }];
    
    setAuditLogs(resetLog);
    saveToStorage('ams_audit_logs', resetLog);
  };

  const resetToFactoryDefault = () => {
    setParticipants(INITIAL_PARTICIPANTS);
    setEvents(INITIAL_EVENTS);
    setAttendance(INITIAL_ATTENDANCE);
    setSabhas(INITIAL_SABHAS);
    setKaryakars(INITIAL_KARYAKARS);
    
    const resetLog = [{
      id: 'L-' + Date.now(),
      action: 'Database Factory Reset',
      timestamp: new Date().toISOString(),
      userId: user ? user.name : 'Administrator',
      userRole: user ? user.role : 'Admin',
      details: 'Database reset to original standard mock data.'
    }];
    setAuditLogs(resetLog);
    
    saveToStorage('ams_participants', INITIAL_PARTICIPANTS);
    saveToStorage('ams_events', INITIAL_EVENTS);
    saveToStorage('ams_attendance', INITIAL_ATTENDANCE);
    saveToStorage('ams_sabhas', INITIAL_SABHAS);
    saveToStorage('ams_karyakars', INITIAL_KARYAKARS);
    saveToStorage('ams_audit_logs', resetLog);
  };

  return (
    <DbContext.Provider value={{
      participants,
      events,
      attendance,
      sabhas,
      karyakars,
      auditLogs,
      queryParticipants,
      importExcelData,
      addEvent,
      updateEvent,
      markPresent,
      undoAttendance,
      registerNewParticipant,
      updateParticipant,
      clearDatabase,
      resetToFactoryDefault,
      setSabhas,
      setKaryakars,
      addAuditLog
    }}>
      {children}
    </DbContext.Provider>
  );
};

export const useDb = () => useContext(DbContext);
