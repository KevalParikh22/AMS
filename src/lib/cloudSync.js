import { supabase } from './supabase';

// Write-through sync between the app's in-memory/localStorage state and
// Supabase. The React state stays the synchronous source of truth (so no
// view code changes); every save is mirrored to Postgres as a full-table
// reconciliation (upsert current rows, delete vanished ones). At the
// confirmed scale (~1,000 participants) this is well within free-tier
// limits and keeps the sync logic simple and correct.

// localStorage key → { table, toRow, fromRow, key }
const TABLE_MAP = {
  ams_participants: {
    table: 'participants',
    key: 'id',
    toRow: (p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone || '',
      sabha: p.sabha || 'Unassociated',
      karyakar: p.karyakar || 'None Assigned',
      guardian_details: p.guardianDetails || '',
      created_at: p.createdAt || new Date().toISOString(),
      registered_for_event_id: p.registeredForEventId || null,
      is_new_registration: !!p.isNewRegistration,
      status: p.status || 'approved',
      linked_to_id: p.linkedToId || null
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      sabha: r.sabha,
      karyakar: r.karyakar,
      guardianDetails: r.guardian_details,
      createdAt: r.created_at,
      registeredForEventId: r.registered_for_event_id,
      isNewRegistration: r.is_new_registration,
      status: r.status,
      linkedToId: r.linked_to_id
    })
  },
  ams_events: {
    table: 'events',
    key: 'id',
    toRow: (e) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      start_time: e.startTime || '16:00',
      end_time: e.endTime || '18:00',
      sabha_mandal_scope: e.sabhaMandalScope || 'All Sabhas',
      status: e.status || 'Draft'
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      startTime: r.start_time,
      endTime: r.end_time,
      sabhaMandalScope: r.sabha_mandal_scope,
      status: r.status
    })
  },
  ams_attendance: {
    table: 'attendance',
    key: 'id',
    toRow: (a) => ({
      id: a.id,
      event_id: a.eventId,
      participant_id: a.participantId,
      status: a.status || 'Present',
      marked_at: a.markedAt || new Date().toISOString(),
      marked_by: a.markedBy || ''
    }),
    fromRow: (r) => ({
      id: r.id,
      eventId: r.event_id,
      participantId: r.participant_id,
      status: r.status,
      markedAt: r.marked_at,
      markedBy: r.marked_by
    })
  },
  ams_sabhas: {
    table: 'sabhas',
    key: 'name',
    toRow: (name) => ({ name }),
    fromRow: (r) => r.name
  },
  ams_karyakars: {
    table: 'karyakars',
    key: 'name',
    toRow: (k) => ({ name: k.name, sabha: k.sabha || 'Unassigned' }),
    fromRow: (r) => ({ name: r.name, sabha: r.sabha })
  },
  ams_audit_logs: {
    table: 'audit_logs',
    key: 'id',
    appendOnly: true, // logs are immutable — only new rows are pushed
    toRow: (l) => ({
      id: l.id,
      action: l.action,
      timestamp: l.timestamp || new Date().toISOString(),
      user_id: String(l.userId || ''),
      user_role: l.userRole || '',
      details: l.details || ''
    }),
    fromRow: (r) => ({
      id: r.id,
      action: r.action,
      timestamp: r.timestamp,
      userId: r.user_id,
      userRole: r.user_role,
      details: r.details
    })
  }
};

export const CLOUD_KEYS = Object.keys(TABLE_MAP);

// Fetch every table; returns { ams_participants: [...], ... } in app shape.
// Throws on network failure so the caller can fall back to the local cache.
export async function fetchAllTables() {
  const result = {};
  for (const [storageKey, cfg] of Object.entries(TABLE_MAP)) {
    const query = supabase.from(cfg.table).select('*');
    const { data, error } = cfg.table === 'audit_logs'
      ? await query.order('timestamp', { ascending: false }).limit(500)
      : await query;
    if (error) throw new Error(`${cfg.table}: ${error.message}`);
    result[storageKey] = (data || []).map(cfg.fromRow);
  }
  return result;
}

// Reconcile one table with the given rows. Serialized per table so rapid
// successive saves cannot interleave out of order.
const pending = {};
export function pushTable(storageKey, rows) {
  const cfg = TABLE_MAP[storageKey];
  if (!cfg || !supabase) return Promise.resolve();

  const run = async () => {
    const mapped = rows.map(cfg.toRow);
    if (mapped.length > 0) {
      const { error } = await supabase.from(cfg.table).upsert(mapped, { onConflict: cfg.key });
      if (error) throw new Error(`${cfg.table} upsert: ${error.message}`);
    }
    if (!cfg.appendOnly) {
      const keep = mapped.map(r => r[cfg.key]);
      const del = supabase.from(cfg.table).delete();
      const { error } = keep.length > 0
        ? await del.not(cfg.key, 'in', `(${keep.map(k => `"${String(k).replace(/"/g, '')}"`).join(',')})`)
        : await del.neq(cfg.key, '');
      if (error) throw new Error(`${cfg.table} prune: ${error.message}`);
    }
  };

  pending[storageKey] = (pending[storageKey] || Promise.resolve()).then(run, run);
  return pending[storageKey];
}

// Fetch a single table (used by realtime refresh).
export async function fetchTable(storageKey) {
  const cfg = TABLE_MAP[storageKey];
  const query = supabase.from(cfg.table).select('*');
  const { data, error } = cfg.table === 'audit_logs'
    ? await query.order('timestamp', { ascending: false }).limit(500)
    : await query;
  if (error) throw new Error(`${cfg.table}: ${error.message}`);
  return (data || []).map(cfg.fromRow);
}

// Subscribe to remote changes on all tables. onRemoteChange(storageKey)
// fires (debounced per table) when another device modifies data.
export function subscribeToChanges(onRemoteChange) {
  const timers = {};
  const channel = supabase.channel('ams-sync');
  for (const [storageKey, cfg] of Object.entries(TABLE_MAP)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: cfg.table },
      () => {
        clearTimeout(timers[storageKey]);
        timers[storageKey] = setTimeout(() => onRemoteChange(storageKey), 800);
      }
    );
  }
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
