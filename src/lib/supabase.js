import { createClient } from '@supabase/supabase-js';

// Cloud mode activates when a Supabase project is configured via env vars
// (see .env.example and SETUP-BACKEND.md). Without them the app runs in
// the localStorage sandbox mode, exactly as before.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudMode = Boolean(url && anonKey);

export const supabase = isCloudMode ? createClient(url, anonKey) : null;
