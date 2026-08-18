import { createClient } from '@supabase/supabase-js';

// Cloud mode activates when a Supabase project is configured via env vars
// (see .env.example and SETUP-BACKEND.md). Without them the app runs in
// the localStorage sandbox mode, exactly as before.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudMode = Boolean(url && anonKey);

export const supabase = isCloudMode ? createClient(url, anonKey) : null;

// A throwaway client used only to create accounts on an admin's behalf.
//
// supabase.auth.signUp() replaces the *current* session with the newly created
// user's, which would sign the admin out mid-task. persistSession/
// autoRefreshToken off keeps the new session entirely in memory and leaves the
// admin's stored session untouched.
//
// This deliberately uses the public anon key, never a service-role key: nothing
// secret may ship in a browser bundle. Accounts it creates are inert until an
// admin activates them (profiles.enabled defaults to false — see schema.sql).
export const createProvisioningClient = () =>
  isCloudMode
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    : null;
