import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth, ROLES } from './AuthContext';
import { isCloudMode } from '../lib/supabase';
import { fetchAllTables, fetchTable, pushTable, insertRow, upsertRows, deleteRow, subscribeToChanges, CLOUD_KEYS } from '../lib/cloudSync';
import { uniqueId } from '../lib/ids';
import { extractGuardianPhone, normalizePhone, participantKey } from '../lib/participantIdentity';

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

// Each karyakar is mapped to their mandal/sabha so forms need a single pick;
// search still matches both the sabha and karyakar text on participants.
const INITIAL_KARYAKARS = [
  { name: 'Ghanshyam Patel', sabha: 'Bal Sabha - Sub-group A1' },
  { name: 'Pramukh Swami Das', sabha: 'Bal Sabha - Sub-group B1' },
  { name: 'Akshar Patel', sabha: 'Kishore Mandal - East Wing' },
  { name: 'Mukund Dave', sabha: 'Bal Sabha - Sub-group A2' },
  { name: 'Yogi Joshi', sabha: 'Kishore Mandal - West Wing' },
  { name: 'Nilkanth Sharma', sabha: 'Yuva Mandal - Youth' }
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
    status: 'approved'
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
    status: 'approved'
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
    status: 'approved'
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
    status: 'approved'
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
    status: 'approved'
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
    status: 'approved'
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

// An event is expired once the current time passes its end date+time (PRD FR-6)
const isEventExpired = (event) => {
  if (!event || !event.date) return false;
  const end = new Date(`${event.date}T${event.endTime || '23:59'}`);
  return !isNaN(end.getTime()) && Date.now() > end.getTime();
};

// Effective status treats expired Active/Draft events as Closed
const getEffectiveStatus = (event) => {
  if (!event) return 'Closed';
  if (event.status === 'Closed') return 'Closed';
  return isEventExpired(event) ? 'Closed' : event.status;
};

// Monotonic ID sequence persisted in localStorage so deletions never cause reuse
const nextSeqId = (prefix, counterKey, list) => {
  const stored = parseInt(localStorage.getItem(counterKey) || '0', 10) || 0;
  const maxExisting = list.reduce((max, item) => {
    const n = parseInt(String(item.id).replace(prefix, ''), 10);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 100);
  const next = Math.max(stored, maxExisting) + 1;
  localStorage.setItem(counterKey, String(next));
  return prefix + next;
};

// Migrate legacy participant records (pendingReview flags, "[REJECTED]" name
// prefixes, "LINKED-" id rewrites) into explicit lifecycle statuses.
const migrateParticipantsList = (list) => list.map(p => {
  if (p.status) return p;
  let status = 'approved';
  let name = p.name;
  if (p.pendingReview) status = 'pending';
  else if (String(p.name).startsWith('[REJECTED] ')) {
    status = 'rejected';
    name = String(p.name).replace('[REJECTED] ', '');
  }
  else if (String(p.id).startsWith('LINKED-')) status = 'linked';
  const { pendingReview, ...rest } = p;
  return { ...rest, name, status };
});

// Migrate legacy plain-string karyakar entries to { name, sabha } objects
const migrateKaryakarsList = (list) => {
  if (list.length > 0 && typeof list[0] === 'string') {
    return list.map(name => {
      const known = INITIAL_KARYAKARS.find(k => k.name === name);
      return { name, sabha: known ? known.sabha : 'Unassigned' };
    });
  }
  return list;
};

export const DbProvider = ({ children }) => {
  const { user, hasPermission } = useAuth();

  // Local Database States
  const [participants, setParticipants] = useState([]);
  const [events, setEvents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [sabhas, setSabhas] = useState([]);
  const [karyakars, setKaryakars] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  // 'local' (sandbox) | 'syncing' | 'online' | 'offline' (cloud unreachable,
  // serving cached data) | 'error' (a cloud write failed)
  const [cloudStatus, setCloudStatus] = useState(isCloudMode ? 'syncing' : 'local');

  // Initialize from the cloud (when configured) or localStorage sandbox
  useEffect(() => {
    // Sandbox loader — also the offline fallback in cloud mode
    const loadFromLocal = (seedIfEmpty) => {
      const read = (key, initial) => {
        const stored = localStorage.getItem(key);
        if (stored) return JSON.parse(stored);
        return seedIfEmpty ? initial : [];
      };

      const loadedParticipants = migrateParticipantsList(read('ams_participants', INITIAL_PARTICIPANTS));
      setParticipants(loadedParticipants);
      localStorage.setItem('ams_participants', JSON.stringify(loadedParticipants));

      let loadedEvents = read('ams_events', INITIAL_EVENTS);
      // Auto-close sweep: persist Closed status for events past their end date/time
      const expired = loadedEvents.filter(e => e.status !== 'Closed' && isEventExpired(e));
      let loadedLogs = read('ams_audit_logs', []);
      if (expired.length > 0) {
        loadedEvents = loadedEvents.map(e =>
          expired.some(x => x.id === e.id) ? { ...e, status: 'Closed' } : e
        );
        loadedLogs = [{
          id: 'L-' + Date.now(),
          action: 'Event Auto-Close',
          timestamp: new Date().toISOString(),
          userId: 'system',
          userRole: 'System',
          details: `Automatically closed ${expired.length} event(s) past their end time: ${expired.map(e => `${e.name} (${e.id})`).join(', ')}.`
        }, ...loadedLogs];
      }
      setEvents(loadedEvents);
      localStorage.setItem('ams_events', JSON.stringify(loadedEvents));

      setAttendance(read('ams_attendance', INITIAL_ATTENDANCE));
      setSabhas(read('ams_sabhas', INITIAL_SABHAS));
      setKaryakars(migrateKaryakarsList(read('ams_karyakars', INITIAL_KARYAKARS)));

      if (loadedLogs.length === 0 && seedIfEmpty) {
        loadedLogs = [{
          id: 'L-1',
          action: 'Database Initialization',
          timestamp: new Date().toISOString(),
          userId: 'system',
          userRole: 'System',
          details: 'Initial mock database loaded successfully.'
        }];
      }
      setAuditLogs(loadedLogs);
      localStorage.setItem('ams_audit_logs', JSON.stringify(loadedLogs));
    };

    if (!isCloudMode) {
      loadFromLocal(true);
      return;
    }

    // Cloud mode: preserve any pre-cloud sandbox data once, so it can be
    // uploaded later from Admin Control (the cloud load overwrites the cache).
    if (!localStorage.getItem('ams_sandbox_backup')) {
      const snapshot = {};
      CLOUD_KEYS.forEach(k => {
        const v = localStorage.getItem(k);
        if (v) snapshot[k] = JSON.parse(v);
      });
      if (Object.keys(snapshot).length > 0) {
        localStorage.setItem('ams_sandbox_backup', JSON.stringify(snapshot));
      }
    }

    fetchAllTables()
      .then(data => {
        setParticipants(migrateParticipantsList(data.ams_participants));

        // Auto-close sweep against cloud events
        let loadedEvents = data.ams_events;
        const expired = loadedEvents.filter(e => e.status !== 'Closed' && isEventExpired(e));
        let logs = data.ams_audit_logs;
        if (expired.length > 0) {
          loadedEvents = loadedEvents.map(e =>
            expired.some(x => x.id === e.id) ? { ...e, status: 'Closed' } : e
          );
          const closeLog = {
            id: 'L-' + Date.now(),
            action: 'Event Auto-Close',
            timestamp: new Date().toISOString(),
            userId: 'system',
            userRole: 'System',
            details: `Automatically closed ${expired.length} event(s) past their end time: ${expired.map(e => `${e.name} (${e.id})`).join(', ')}.`
          };
          logs = [closeLog, ...logs];
          pushTable('ams_events', loadedEvents).catch(() => {});
          pushTable('ams_audit_logs', [closeLog]).catch(() => {});
        }
        setEvents(loadedEvents);
        setAttendance(data.ams_attendance);
        setSabhas(data.ams_sabhas);
        setKaryakars(data.ams_karyakars);
        setAuditLogs(logs);

        // Refresh the local cache with cloud truth
        localStorage.setItem('ams_participants', JSON.stringify(data.ams_participants));
        localStorage.setItem('ams_events', JSON.stringify(loadedEvents));
        localStorage.setItem('ams_attendance', JSON.stringify(data.ams_attendance));
        localStorage.setItem('ams_sabhas', JSON.stringify(data.ams_sabhas));
        localStorage.setItem('ams_karyakars', JSON.stringify(data.ams_karyakars));
        localStorage.setItem('ams_audit_logs', JSON.stringify(logs));
        setCloudStatus('online');
      })
      .catch(err => {
        console.error('Cloud load failed, serving cached data:', err);
        loadFromLocal(false);
        setCloudStatus('offline');
      });
  }, []);

  // Realtime: refresh a table when another device changes it
  useEffect(() => {
    if (!isCloudMode) return;
    const setters = {
      ams_participants: (rows) => setParticipants(migrateParticipantsList(rows)),
      ams_events: setEvents,
      ams_attendance: setAttendance,
      ams_sabhas: setSabhas,
      ams_karyakars: setKaryakars,
      ams_audit_logs: setAuditLogs
    };
    const unsubscribe = subscribeToChanges(async (storageKey) => {
      try {
        const rows = await fetchTable(storageKey);
        setters[storageKey](rows);
        localStorage.setItem(storageKey, JSON.stringify(rows));
      } catch (err) {
        console.error('Realtime refresh failed:', err);
      }
    });
    return unsubscribe;
  }, []);

  // Pull the authoritative copy of one table after a rejected write, so the
  // device stops showing a row the server never accepted.
  const refreshFromCloud = (key, setter) => {
    if (!isCloudMode) return;
    fetchTable(key)
      .then(rows => {
        setter(rows);
        localStorage.setItem(key, JSON.stringify(rows));
      })
      .catch(err => console.error('Refresh after failed write:', err));
  };

  // Persist locally (cache) and write through to the cloud when configured
  const saveToStorage = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
    if (isCloudMode) {
      pushTable(key, data)
        .then(() => setCloudStatus('online'))
        .catch(err => {
          console.error('Cloud sync failed:', err);
          setCloudStatus('error');
        });
    }
  };

  // One-time migration: push the pre-cloud sandbox snapshot into Supabase
  const uploadLocalSandbox = async () => {
    if (!isCloudMode) return { success: false, message: 'Cloud mode is not configured.' };
    if (!hasPermission(ROLES.ADMIN)) return { success: false, message: 'Only administrators can migrate data.' };
    const backup = localStorage.getItem('ams_sandbox_backup');
    if (!backup) return { success: false, message: 'No local sandbox snapshot found.' };
    try {
      const snapshot = JSON.parse(backup);
      if (snapshot.ams_participants) await pushTable('ams_participants', migrateParticipantsList(snapshot.ams_participants));
      if (snapshot.ams_events) await pushTable('ams_events', snapshot.ams_events);
      if (snapshot.ams_attendance) await pushTable('ams_attendance', snapshot.ams_attendance);
      if (snapshot.ams_sabhas) await pushTable('ams_sabhas', snapshot.ams_sabhas);
      if (snapshot.ams_karyakars) await pushTable('ams_karyakars', migrateKaryakarsList(snapshot.ams_karyakars));
      if (snapshot.ams_audit_logs) await pushTable('ams_audit_logs', snapshot.ams_audit_logs);
      const fresh = await fetchAllTables();
      setParticipants(migrateParticipantsList(fresh.ams_participants));
      setEvents(fresh.ams_events);
      setAttendance(fresh.ams_attendance);
      setSabhas(fresh.ams_sabhas);
      setKaryakars(fresh.ams_karyakars);
      setAuditLogs(fresh.ams_audit_logs);
      localStorage.removeItem('ams_sandbox_backup');
      addAuditLog('Cloud Migration', 'Uploaded local sandbox data into the cloud database.');
      return { success: true };
    } catch (err) {
      return { success: false, message: 'Migration failed: ' + err.message };
    }
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

  // Participant search with basic text ranking/fuzzy score matching.
  // Only active records (approved/pending) are searchable — rejected,
  // linked, and archived participants never appear at the desk.
  // Memoized so consumers' effects only re-run when the roster changes.
  const queryParticipants = useCallback((searchString) => {
    const searchable = participants.filter(p => p.status === 'approved' || p.status === 'pending');
    if (!searchString || !searchString.trim()) {
      return searchable.map(p => ({ item: p, score: 100 }));
    }

    const query = searchString.toLowerCase().trim();
    
    return searchable.map(p => {
      let score = 0;
      const name = p.name.toLowerCase();
      const phone = String(p.phone || '').toLowerCase();
      const sabha = String(p.sabha || '').toLowerCase();
      const karyakar = String(p.karyakar || '').toLowerCase();
      const guardian = String(p.guardianDetails || '').toLowerCase();

      // Match algorithms. The number is the guardian's, so a guardian looking
      // themselves up by their own name should find their balak too.
      if (phone === query) score += 100;
      else if (phone.includes(query)) score += 50;

      if (name === query) score += 90;
      else if (name.startsWith(query)) score += 60;
      else if (name.includes(query)) score += 30;
      
      if (sabha.includes(query)) score += 20;
      if (karyakar.includes(query)) score += 15;
      if (guardian.includes(query)) score += 10;
      
      return { item: p, score };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
  }, [participants]);

  // Add sabhas/karyakars an import referenced but that aren't configured yet.
  // Goes through saveToStorage so cloud mode syncs both lookup tables (Admin only, per D4).
  const addLookupEntries = ({
    sabhas: newSabhaNames = [],
    karyakars: newKaryakarEntries = [],
    // Karyakars that already exist but should be moved to a different sabha.
    // Kept separate from the add list because adding silently skips existing
    // names — a re-import could otherwise never correct a wrong mapping.
    remapKaryakars = [],
    // When a karyakar moves, optionally move the balaks under them too, so the
    // roster does not keep pointing at the karyakar's old sabha.
    cascadeParticipants = false
  }) => {
    if (!hasPermission(ROLES.ADMIN)) {
      return { error: 'Only administrators can edit master data.' };
    }

    const addedSabhas = [];
    const updatedSabhas = [...sabhas];
    newSabhaNames.forEach(rawName => {
      const name = String(rawName || '').trim();
      if (!name || updatedSabhas.includes(name)) return;
      updatedSabhas.push(name);
      addedSabhas.push(name);
    });

    const addedKaryakars = [];
    let updatedKaryakars = [...karyakars];
    newKaryakarEntries.forEach(entry => {
      const name = String(entry?.name || '').trim();
      if (!name || updatedKaryakars.some(k => k.name === name)) return;
      const sabha = String(entry?.sabha || '').trim() || 'Unassigned';
      updatedKaryakars.push({ name, sabha });
      addedKaryakars.push({ name, sabha });
    });

    const remapped = [];
    remapKaryakars.forEach(entry => {
      const name = String(entry?.name || '').trim();
      const sabha = String(entry?.sabha || '').trim();
      if (!name || !sabha) return;
      const existing = updatedKaryakars.find(k => k.name === name);
      if (!existing || existing.sabha === sabha) return;
      remapped.push({ name, from: existing.sabha, to: sabha });
      updatedKaryakars = updatedKaryakars.map(k => (k.name === name ? { ...k, sabha } : k));
    });

    if (addedSabhas.length > 0) {
      setSabhas(updatedSabhas);
      saveToStorage('ams_sabhas', updatedSabhas);
    }
    if (addedKaryakars.length > 0 || remapped.length > 0) {
      setKaryakars(updatedKaryakars);
      saveToStorage('ams_karyakars', updatedKaryakars);
    }

    // Move the balaks who follow a remapped karyakar. Restricted to those still
    // sitting in that karyakar's OLD sabha: anyone already elsewhere is an
    // inconsistency this import has no basis to resolve, so leave them be.
    let movedParticipants = 0;
    if (cascadeParticipants && remapped.length > 0) {
      const moves = new Map(remapped.map(r => [r.name, r]));
      const touched = [];
      const nextParticipants = participants.map(p => {
        if (p.status !== 'approved' && p.status !== 'pending') return p;
        const move = moves.get(p.karyakar);
        if (!move || p.sabha !== move.from) return p;
        const updated = { ...p, sabha: move.to };
        touched.push(updated);
        return updated;
      });

      if (touched.length > 0) {
        movedParticipants = touched.length;
        setParticipants(nextParticipants);
        if (isCloudMode) {
          // Only the touched rows — never a full-table reconcile, which would
          // prune participants this device has not received yet.
          localStorage.setItem('ams_participants', JSON.stringify(nextParticipants));
          upsertRows('ams_participants', touched)
            .then(() => setCloudStatus('online'))
            .catch(err => {
              console.error('Cascade update failed:', err);
              setCloudStatus('error');
            });
        } else {
          saveToStorage('ams_participants', nextParticipants);
        }
      }
    }

    if (addedSabhas.length > 0 || addedKaryakars.length > 0 || remapped.length > 0) {
      addAuditLog(
        'Add Import Lookups',
        `Created ${addedSabhas.length} sabha(s) and ${addedKaryakars.length} karyakar(s), remapped ${remapped.length}.` +
        (addedSabhas.length ? ` Sabhas: ${addedSabhas.join(', ')}.` : '') +
        (addedKaryakars.length ? ` Karyakars: ${addedKaryakars.map(k => `${k.name} → ${k.sabha}`).join(', ')}.` : '') +
        (remapped.length ? ` Remapped: ${remapped.map(r => `${r.name} ${r.from} → ${r.to}`).join(', ')}.` : '') +
        (movedParticipants ? ` Moved ${movedParticipants} participant(s) to follow their karyakar.` : '')
      );
    }

    return { addedSabhas, addedKaryakars, remapped, movedParticipants };
  };

  // Register or insert spreadsheet imports (Admin only, per decision D4)
  const importExcelData = (parsedRows) => {
    if (!hasPermission(ROLES.ADMIN)) {
      return { error: 'Only administrators can import master data.' };
    }
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let rejected = 0;
    let review = 0;
    let duplicates = 0;
    const newParticipantsList = [...participants];
    const seenKeysInFile = new Set();

    parsedRows.forEach(row => {
      const name = String(row.name || '').trim();
      const guardianDetails = String(row.guardianDetails || '').trim();
      // Rosters carry the guardian's number in the free-text guardian column;
      // an explicit phone value still wins if the sheet supplies one.
      const phone = normalizePhone(row.phone) || extractGuardianPhone(guardianDetails);

      if (!name) {
        rejected++;
        return;
      }

      // No contactable guardian number = no unique identifier: create flagged
      // for manual review (decision D3, as revised for guardian-held contacts)
      if (!phone) {
        newParticipantsList.push({
          id: nextSeqId('P-', 'ams_seq_participant', newParticipantsList),
          name,
          phone: '',
          sabha: row.sabha || 'Unassociated',
          karyakar: row.karyakar || 'None Assigned',
          guardianDetails,
          createdAt: new Date().toISOString(),
          isNewRegistration: false,
          status: 'pending'
        });
        review++;
        return;
      }

      // Duplicate row within the same file: skip so the first occurrence wins.
      // Keyed on name + number so siblings on one guardian number both import.
      const rowKey = participantKey(name, phone);
      if (seenKeysInFile.has(rowKey)) {
        duplicates++;
        return;
      }
      seenKeysInFile.add(rowKey);

      const existingIdx = newParticipantsList.findIndex(
        p => participantKey(p.name, p.phone) === rowKey && (p.status === 'approved' || p.status === 'pending')
      );

      if (existingIdx > -1) {
        const existing = newParticipantsList[existingIdx];
        const merged = {
          ...existing,
          name: name || existing.name,
          phone: phone || existing.phone,
          sabha: row.sabha || existing.sabha,
          karyakar: row.karyakar || existing.karyakar,
          guardianDetails: guardianDetails || existing.guardianDetails
        };
        const isSame = merged.name === existing.name &&
          merged.phone === existing.phone &&
          merged.sabha === existing.sabha &&
          merged.karyakar === existing.karyakar &&
          merged.guardianDetails === existing.guardianDetails;
        if (isSame) {
          unchanged++;
        } else {
          newParticipantsList[existingIdx] = merged;
          updated++;
        }
      } else {
        newParticipantsList.push({
          id: nextSeqId('P-', 'ams_seq_participant', newParticipantsList),
          name,
          phone,
          sabha: row.sabha || 'Unassociated',
          karyakar: row.karyakar || 'None Assigned',
          guardianDetails,
          createdAt: new Date().toISOString(),
          isNewRegistration: false,
          status: 'approved'
        });
        inserted++;
      }
    });

    setParticipants(newParticipantsList);
    saveToStorage('ams_participants', newParticipantsList);

    // Audit Log
    addAuditLog(
      'Excel Master Import',
      `Imported raw sheet data. Created ${inserted} new, updated ${updated}, ${unchanged} unchanged, ${review} routed to review (no phone), ${duplicates} duplicate rows skipped, ${rejected} rejected.`
    );

    return { inserted, updated, unchanged, rejected, review, duplicates };
  };

  // Events API (Coordinator+, per decision D4)
  const addEvent = (eventData) => {
    if (!hasPermission(ROLES.COORDINATOR)) {
      return { error: 'Only coordinators or admins can manage events.' };
    }
    const newEvent = {
      id: nextSeqId('E-', 'ams_seq_event', events),
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
    if (!hasPermission(ROLES.COORDINATOR)) {
      return { error: 'Only coordinators or admins can manage events.' };
    }
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
    if (!user) {
      return { success: false, message: 'Sign in required to mark attendance.' };
    }
    // Check if event is Closed (explicitly or expired past its end time)
    const event = events.find(e => e.id === eventId);
    if (!event) return { success: false, message: 'Event not found' };
    if (getEffectiveStatus(event) === 'Closed') {
      return { success: false, message: 'Cannot register attendance: Event is closed.' };
    }

    // Check duplicate
    const duplicate = attendance.find(a => a.eventId === eventId && a.participantId === participantId);
    if (duplicate) {
      return { success: false, message: 'Participant already marked present.' };
    }

    const newAttendance = {
      // Collision-resistant: 'A-' + Date.now() gave two volunteers marking in
      // the same millisecond the same id, so one overwrote the other.
      id: uniqueId('A-'),
      eventId,
      participantId,
      status: 'Present',
      markedAt: new Date().toISOString(),
      markedBy: user ? user.name : 'Public Form'
    };

    const updatedAttendance = [...attendance, newAttendance];
    setAttendance(updatedAttendance);

    let syncPromise;
    if (isCloudMode) {
      // Insert just this row. saveToStorage would reconcile the WHOLE table and
      // prune every row missing from this device's copy — which silently
      // deletes marks made by other volunteers in the last few seconds.
      localStorage.setItem('ams_attendance', JSON.stringify(updatedAttendance));
      syncPromise = insertRow('ams_attendance', newAttendance)
        .then(() => setCloudStatus('online'))
        .catch(err => {
          // The (event_id, participant_id) unique constraint is the real
          // arbiter between devices: losing that race means someone else
          // already marked this person. Drop the optimistic row either way.
          setAttendance(prev => prev.filter(a => a.id !== newAttendance.id));
          setCloudStatus('error');
          refreshFromCloud('ams_attendance', setAttendance);
          throw new Error(
            /duplicate key|unique constraint/i.test(err.message)
              ? 'Already marked present by another volunteer.'
              : 'Could not save attendance — check the connection and try again.'
          );
        });
    } else {
      saveToStorage('ams_attendance', updatedAttendance);
    }

    const participant = participants.find(p => p.id === participantId);
    addAuditLog(
      'Attendance Mark Present',
      `Marked present: ${participant ? participant.name : 'Unknown'} (${participantId}) for Event: ${event.name} (${eventId})`
    );

    return { success: true, attendance: newAttendance, syncPromise };
  };

  // Attendance corrections are Coordinator+ (decision D4)
  const undoAttendance = (eventId, participantId) => {
    if (!hasPermission(ROLES.COORDINATOR)) {
      return { success: false, message: 'Only coordinators or admins can correct attendance.' };
    }
    const event = events.find(e => e.id === eventId);
    if (!event) return { success: false, message: 'Event not found' };
    if (getEffectiveStatus(event) === 'Closed') {
      return { success: false, message: 'Cannot modify attendance: Event is closed.' };
    }

    const targetIdx = attendance.findIndex(a => a.eventId === eventId && a.participantId === participantId);
    if (targetIdx === -1) {
      return { success: false, message: 'Attendance record not found.' };
    }

    const record = attendance[targetIdx];
    const updated = attendance.filter((_, idx) => idx !== targetIdx);
    
    setAttendance(updated);

    if (isCloudMode) {
      // Delete just this row, for the same reason markPresent inserts just one:
      // a full-table reconcile would prune concurrent volunteers' marks.
      localStorage.setItem('ams_attendance', JSON.stringify(updated));
      deleteRow('ams_attendance', record.id)
        .then(() => setCloudStatus('online'))
        .catch(err => {
          console.error('Undo attendance failed:', err);
          setCloudStatus('error');
          refreshFromCloud('ams_attendance', setAttendance);
        });
    } else {
      saveToStorage('ams_attendance', updated);
    }

    const participant = participants.find(p => p.id === participantId);
    addAuditLog(
      'Attendance Correction (Undo)',
      `Undid present status for: ${participant ? participant.name : 'Unknown'} (${participantId}) at event: ${event.name}`
    );

    return { success: true };
  };

  // Register New Participant. Attendance is NOT marked here — callers must
  // explicitly call markPresent after user confirmation (PRD FR-4).
  const registerNewParticipant = (formData, eventId = null) => {
    const isPublicSubmission = formData.pendingReview === true;
    // Public shared-form submissions are unauthenticated by design; internal
    // immediate-approval registrations need Registration Volunteer+ (D4)
    if (!isPublicSubmission && !hasPermission(ROLES.REGISTRATION_VOLUNTEER)) {
      return { error: 'Only registration volunteers, coordinators, or admins can register participants directly.' };
    }
    const guardianDetails = String(formData.guardianDetails || '').trim();
    // Same rule as the importer: the contact number is the guardian's, and the
    // free-text guardian field is a fallback source for it.
    const phone = normalizePhone(formData.phone) || extractGuardianPhone(guardianDetails);
    // An anonymous visitor cannot read the participants table (RLS), so its
    // local list is empty and nextSeqId would restart at P-101 and collide with
    // a real record. Public submissions get an id that needs no prior reads.
    const newId = isPublicSubmission
      ? uniqueId('PUB-')
      : nextSeqId('P-', 'ams_seq_participant', participants);
    const newP = {
      id: newId,
      name: formData.name,
      phone,
      sabha: formData.sabha,
      karyakar: formData.karyakar || 'None Assigned',
      guardianDetails,
      createdAt: new Date().toISOString(),
      registeredForEventId: eventId || null,
      isNewRegistration: true,
      // No guardian number = no unique identifier: force manual review (D3)
      status: (!phone || isPublicSubmission) ? 'pending' : 'approved'
    };

    const updatedParticipants = [...participants, newP];
    setParticipants(updatedParticipants);

    if (isPublicSubmission && isCloudMode) {
      // Insert just this row rather than reconciling the whole (RLS-emptied)
      // array, and hand the caller the in-flight write so the public form can
      // report a real failure instead of showing a false success receipt.
      localStorage.setItem('ams_participants', JSON.stringify(updatedParticipants));
      newP.syncPromise = insertRow('ams_participants', newP)
        .then(() => setCloudStatus('online'))
        .catch(err => {
          setCloudStatus('error');
          throw err;
        });
    } else {
      saveToStorage('ams_participants', updatedParticipants);
    }

    addAuditLog(
      'New Participant Registration',
      `Registered new person: ${newP.name} (ID: ${newId}) assigned to sabha: ${newP.sabha}.`
    );

    return newP;
  };

  // The event a shared link should target: whichever is Active right now.
  const getCurrentPublicEvent = () => events.find(e => getEffectiveStatus(e) === 'Active') || null;

  // Public self check-in from the shared link.
  //
  // Distinct from registerNewParticipant + markPresent because there is no
  // signed-in user: markPresent requires one, and the roster in Reports only
  // counts status === 'approved', so a 'pending' row would never show up in
  // the present list. The event is resolved server-side-of-the-truth here —
  // whichever event is Active right now — so one permanent link always lands
  // on today's session instead of a stale event id.
  //
  // Note: RLS hides the participant table from anonymous visitors, so this
  // cannot check whether the person is already on the roster. Duplicates are
  // reconciled afterwards with the merge tools in Reports.
  const publicSelfCheckIn = (formData) => {
    const event = getCurrentPublicEvent();
    if (!event) {
      return { error: 'No session is open for check-in right now.' };
    }

    const guardianDetails = String(formData.guardianDetails || '').trim();
    const phone = normalizePhone(formData.phone) || extractGuardianPhone(guardianDetails);

    const newP = {
      id: uniqueId('PUB-'),
      name: String(formData.name || '').trim(),
      phone,
      sabha: formData.sabha || event.sabhaMandalScope || 'Unassociated',
      karyakar: 'None Assigned', // assigned by a coordinator later
      guardianDetails,
      createdAt: new Date().toISOString(),
      registeredForEventId: event.id,
      isNewRegistration: true,
      status: 'approved'
    };

    const record = {
      id: uniqueId('A-'),
      eventId: event.id,
      participantId: newP.id,
      status: 'Present',
      markedAt: new Date().toISOString(),
      markedBy: 'Public Self Check-in'
    };

    const nextParticipants = [...participants, newP];
    const nextAttendance = [...attendance, record];
    setParticipants(nextParticipants);
    setAttendance(nextAttendance);

    let syncPromise;
    if (isCloudMode) {
      localStorage.setItem('ams_participants', JSON.stringify(nextParticipants));
      localStorage.setItem('ams_attendance', JSON.stringify(nextAttendance));
      // Row-level inserts, never a full-table reconcile: an anonymous device
      // cannot read the other rows and would prune them.
      syncPromise = insertRow('ams_participants', newP)
        .then(() => insertRow('ams_attendance', record))
        .then(() => setCloudStatus('online'))
        .catch(err => {
          setParticipants(prev => prev.filter(p => p.id !== newP.id));
          setAttendance(prev => prev.filter(a => a.id !== record.id));
          setCloudStatus('error');
          throw err;
        });
    } else {
      saveToStorage('ams_participants', nextParticipants);
      saveToStorage('ams_attendance', nextAttendance);
    }

    addAuditLog(
      'Public Self Check-in',
      `${newP.name} (${newP.id}) checked in via the shared link and was marked present for ${event.name} (${event.id}).`
    );

    return { participant: newP, event, attendance: record, syncPromise };
  };

  // The only participant fields an editor may change. Everything else is
  // either identity (id, createdAt) or lifecycle state owned by
  // setParticipantStatus / mergeParticipants — editing those here would
  // bypass the audit trail those actions write.
  const EDITABLE_PARTICIPANT_FIELDS = ['name', 'phone', 'sabha', 'karyakar', 'guardianDetails'];

  // Administrative Participant Update (Coordinator+, per decision D4)
  const updateParticipant = (participantId, updatedFields) => {
    if (!hasPermission(ROLES.COORDINATOR)) {
      return { success: false, message: 'Only coordinators or admins can edit master data.' };
    }
    const original = participants.find(p => p.id === participantId);
    if (!original) return { success: false, message: 'Participant not found.' };

    // Whitelist rather than spreading whatever the caller passed
    const changes = {};
    EDITABLE_PARTICIPANT_FIELDS.forEach(field => {
      if (!(field in updatedFields)) return;
      const value = field === 'phone'
        ? normalizePhone(updatedFields.phone)
        : String(updatedFields[field] ?? '').trim();
      if (value !== original[field]) changes[field] = value;
    });

    const changedFields = Object.keys(changes);
    if (changedFields.length === 0) return { success: true, unchanged: true };

    const updatedRecord = { ...original, ...changes };
    const updatedList = participants.map(p => (p.id === participantId ? updatedRecord : p));
    setParticipants(updatedList);

    if (isCloudMode) {
      // Write just this row. saveToStorage would reconcile the whole table and
      // prune any cloud participant missing from this device's copy, so two
      // coordinators editing from stale tabs could delete each other's people.
      localStorage.setItem('ams_participants', JSON.stringify(updatedList));
      upsertRows('ams_participants', [updatedRecord])
        .then(() => setCloudStatus('online'))
        .catch(err => {
          console.error('Participant update failed:', err);
          setCloudStatus('error');
          refreshFromCloud('ams_participants', rows => setParticipants(migrateParticipantsList(rows)));
        });
    } else {
      saveToStorage('ams_participants', updatedList);
    }

    addAuditLog(
      'Admin Participant Update',
      `Edited ${original.name} (${participantId}): ` +
      changedFields.map(f => `${f} "${original[f] ?? ''}" → "${changes[f]}"`).join(', ') + '.'
    );
    return { success: true, changedFields };
  };

  // --- Participant lifecycle actions (Coordinator+, per decision D4) ---

  const setParticipantStatus = (participantId, status, extraFields, action, details) => {
    if (!hasPermission(ROLES.COORDINATOR)) {
      return { success: false, message: 'Only coordinators or admins can review registrations.' };
    }
    const target = participants.find(p => p.id === participantId);
    if (!target) return { success: false, message: 'Participant not found.' };

    const updatedList = participants.map(p =>
      p.id === participantId ? { ...p, status, ...extraFields } : p
    );
    setParticipants(updatedList);
    saveToStorage('ams_participants', updatedList);
    addAuditLog(action, details.replace('{name}', target.name));
    return { success: true };
  };

  const approveParticipant = (participantId) =>
    setParticipantStatus(participantId, 'approved', { isNewRegistration: false },
      'Registration Approved', `Approved registration for {name} (${participantId}).`);

  const rejectParticipant = (participantId) =>
    setParticipantStatus(participantId, 'rejected', {},
      'Registration Rejected', `Rejected registration for {name} (${participantId}).`);

  const linkParticipant = (participantId, existingId) =>
    setParticipantStatus(participantId, 'linked', { linkedToId: existingId },
      'Registration Linked', `Linked registration {name} (${participantId}) to existing master record ${existingId}.`);

  // Archive supports the keep-until-removal retention policy (decision D7):
  // the record and its attendance history are retained but leave all rosters.
  const archiveParticipant = (participantId) =>
    setParticipantStatus(participantId, 'archived', {},
      'Participant Archived', `Archived participant {name} (${participantId}) — removed from active rosters, history retained.`);

  const restoreParticipant = (participantId) =>
    setParticipantStatus(participantId, 'pending', { linkedToId: null },
      'Participant Restored', `Restored {name} (${participantId}) to the pending review queue.`);

  // Merge two records: attendance moves to the survivor (skipping events where
  // the survivor is already marked), empty survivor fields fill from the
  // duplicate, and the duplicate is kept as a linked record for audit.
  const mergeParticipants = (survivorId, duplicateId) => {
    if (!hasPermission(ROLES.COORDINATOR)) {
      return { success: false, message: 'Only coordinators or admins can merge records.' };
    }
    const survivor = participants.find(p => p.id === survivorId);
    const duplicate = participants.find(p => p.id === duplicateId);
    if (!survivor || !duplicate || survivorId === duplicateId) {
      return { success: false, message: 'Invalid merge selection.' };
    }

    const survivorEventIds = new Set(
      attendance.filter(a => a.participantId === survivorId).map(a => a.eventId)
    );
    let movedMarks = 0;
    let droppedMarks = 0;
    const updatedAttendance = attendance
      .map(a => {
        if (a.participantId !== duplicateId) return a;
        if (survivorEventIds.has(a.eventId)) { droppedMarks++; return null; }
        movedMarks++;
        return { ...a, participantId: survivorId };
      })
      .filter(Boolean);

    const mergedSurvivor = {
      ...survivor,
      phone: survivor.phone || duplicate.phone,
      guardianDetails: survivor.guardianDetails || duplicate.guardianDetails,
      karyakar: survivor.karyakar === 'None Assigned' ? duplicate.karyakar : survivor.karyakar
    };
    const updatedList = participants.map(p => {
      if (p.id === survivorId) return mergedSurvivor;
      if (p.id === duplicateId) return { ...p, status: 'linked', linkedToId: survivorId };
      return p;
    });

    setAttendance(updatedAttendance);
    saveToStorage('ams_attendance', updatedAttendance);
    setParticipants(updatedList);
    saveToStorage('ams_participants', updatedList);
    addAuditLog(
      'Participants Merged',
      `Merged ${duplicate.name} (${duplicateId}) into ${survivor.name} (${survivorId}). Moved ${movedMarks} attendance mark(s), dropped ${droppedMarks} duplicate mark(s).`
    );
    return { success: true };
  };

  // Database Administration (Admin only)
  const clearDatabase = () => {
    if (!hasPermission(ROLES.ADMIN)) return;
    setParticipants([]);
    setEvents([]);
    setAttendance([]);
    setAuditLogs([]);
    
    localStorage.removeItem('ams_participants');
    localStorage.removeItem('ams_events');
    localStorage.removeItem('ams_attendance');
    localStorage.removeItem('ams_audit_logs');

    // In cloud mode, clear the shared tables too (audit trail is append-only
    // server-side, so cloud logs are retained by design)
    if (isCloudMode) {
      pushTable('ams_attendance', []).catch(() => {});
      pushTable('ams_events', []).catch(() => {});
      pushTable('ams_participants', []).catch(() => {});
    }
    
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
    if (!hasPermission(ROLES.ADMIN)) return;
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
      publicSelfCheckIn,
      getCurrentPublicEvent,
      updateParticipant,
      approveParticipant,
      rejectParticipant,
      linkParticipant,
      archiveParticipant,
      restoreParticipant,
      mergeParticipants,
      clearDatabase,
      resetToFactoryDefault,
      getEffectiveStatus,
      isEventExpired,
      cloudStatus,
      uploadLocalSandbox,
      setSabhas,
      setKaryakars,
      addLookupEntries,
      saveToStorage,
      addAuditLog
    }}>
      {children}
    </DbContext.Provider>
  );
};

export const useDb = () => useContext(DbContext);
