-- ============================================================
-- Sabha Mandal AMS — Supabase schema + row-level security
-- Run this once in the Supabase SQL Editor (Dashboard → SQL).
-- Safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- ---------- Profiles (one row per auth user; holds role + enabled flag) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  -- Email is mirrored here so an admin can tell accounts apart in the app:
  -- auth.users is not readable from the client, so without this the user list
  -- can only show a UUID.
  email text not null default '',
  role text not null default 'Attendance Volunteer'
    check (role in ('Admin', 'Coordinator', 'Attendance Volunteer', 'Registration Volunteer')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Backfill for projects created before the email column existed.
alter table public.profiles add column if not exists email text not null default '';

-- Auto-create a profile when an auth user is created.
--
-- New accounts are created DISABLED. Signing up is not the same as being let
-- in: an admin activates the account in Admin Control, and that activation is
-- the security boundary. This is what makes it safe to create volunteer logins
-- from inside the app with the public anon key — and it also neutralises
-- Supabase's default open email signup, where a stranger would otherwise land
-- as an enabled Attendance Volunteer able to read the whole roster.
-- Promote and enable your first admin manually — see SETUP-BACKEND.md.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, enabled)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Role helpers (mirror the D4 permission matrix) ----------
create or replace function public.my_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid() and enabled = true
$$;

create or replace function public.has_permission(required text)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when public.my_role() is null then false
    when public.my_role() = 'Admin' then true
    when required = 'Admin' then false
    when required = 'Coordinator' then public.my_role() = 'Coordinator'
    when required = 'Registration Volunteer'
      then public.my_role() in ('Coordinator', 'Registration Volunteer')
    else true
  end
$$;

-- ---------- Domain tables (columns mirror the app's camelCase fields) ----------
create table if not exists public.sabhas (
  name text primary key,
  -- Areas roll several mandals up into one reporting group. Added after the
  -- table shipped, so existing deployments pick it up via the alter below.
  area text not null default 'Unassigned'
);
alter table public.sabhas add column if not exists area text not null default 'Unassigned';

create table if not exists public.karyakars (
  name text primary key,
  sabha text not null default 'Unassigned'
);

create table if not exists public.participants (
  id text primary key,
  name text not null,
  phone text not null default '',
  sabha text not null default 'Unassociated',
  karyakar text not null default 'None Assigned',
  guardian_details text not null default '',
  created_at timestamptz not null default now(),
  registered_for_event_id text,
  is_new_registration boolean not null default false,
  status text not null default 'approved'
    check (status in ('approved', 'pending', 'rejected', 'linked', 'archived')),
  linked_to_id text
);
create index if not exists participants_phone_idx on public.participants (phone);
create index if not exists participants_status_idx on public.participants (status);

create table if not exists public.events (
  id text primary key,
  name text not null,
  date date not null,
  start_time text not null default '16:00',
  end_time text not null default '18:00',
  sabha_mandal_scope text not null default 'All Sabhas',
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'Closed'))
);

create table if not exists public.attendance (
  id text primary key,
  event_id text not null references public.events(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  status text not null default 'Present',
  marked_at timestamptz not null default now(),
  marked_by text not null default '',
  unique (event_id, participant_id)
);

create table if not exists public.audit_logs (
  id text primary key,
  action text not null,
  timestamp timestamptz not null default now(),
  user_id text not null default '',
  user_role text not null default '',
  details text not null default ''
);

-- ---------- Row-level security ----------
alter table public.profiles     enable row level security;
alter table public.sabhas       enable row level security;
alter table public.karyakars    enable row level security;
alter table public.participants enable row level security;
alter table public.events       enable row level security;
alter table public.attendance   enable row level security;
alter table public.audit_logs   enable row level security;

-- Profiles: everyone signed-in reads their own; Admin reads/updates all.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.has_permission('Admin'));
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.has_permission('Admin'));
-- Removing a volunteer deletes their profile row. my_role() then returns NULL
-- for them, so RLS refuses them everywhere and the app signs them out — the
-- auth.users row survives (deleting that needs the service key, i.e. the
-- dashboard), but it grants nothing on its own.
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete using (public.has_permission('Admin'));

-- Sabhas: readable by anyone (the public form lists them); writes are Admin.
drop policy if exists sabhas_read on public.sabhas;
create policy sabhas_read on public.sabhas for select using (true);
drop policy if exists sabhas_write on public.sabhas;
create policy sabhas_write on public.sabhas
  for all using (public.has_permission('Admin')) with check (public.has_permission('Admin'));

-- Karyakars: read by any ENABLED account; Admin writes.
-- my_role() returns NULL for a disabled or profile-less user, so these reads
-- require an activated account rather than just a valid JWT.
drop policy if exists karyakars_read on public.karyakars;
create policy karyakars_read on public.karyakars for select using (public.my_role() is not null);
drop policy if exists karyakars_write on public.karyakars;
create policy karyakars_write on public.karyakars
  for all using (public.has_permission('Admin')) with check (public.has_permission('Admin'));

-- Events: readable by anyone (shared links show event info); writes Coordinator+.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
-- Insert/update are Coordinator+, but DELETE is Admin only. This used to be one
-- `for all` policy, and in Postgres FOR ALL covers DELETE — so any coordinator
-- could remove an event straight through the API, taking every attendance row
-- with it via the cascade below. Narrowed to match participants_delete.
drop policy if exists events_write on public.events;
create policy events_write on public.events
  for insert with check (public.has_permission('Coordinator'));
drop policy if exists events_update on public.events;
create policy events_update on public.events
  for update using (public.has_permission('Coordinator')) with check (public.has_permission('Coordinator'));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete using (public.has_permission('Admin'));

-- Participants: read by any ENABLED account (never anonymous — this table holds
-- guardian contact details). The PUBLIC form may INSERT but never read the
-- registry (BRD privacy rule): pending rows any time, or approved rows only
-- while some event is Active (self check-in). Registration Volunteer+
-- inserts approved rows; edits are Coordinator+.
drop policy if exists participants_read on public.participants;
create policy participants_read on public.participants for select using (public.my_role() is not null);
drop policy if exists participants_public_insert on public.participants;
create policy participants_public_insert on public.participants
  for insert with check (
    public.has_permission('Registration Volunteer')
    or status = 'pending'
    -- Public self check-in from the shared link. Only permitted while some
    -- event is actually Active, which time-boxes the window in which an
    -- anonymous visitor can create roster rows.
    or (status = 'approved' and exists (
      select 1 from public.events e where e.status = 'Active'
    ))
  );
drop policy if exists participants_update on public.participants;
create policy participants_update on public.participants
  for update using (public.has_permission('Coordinator'));
drop policy if exists participants_delete on public.participants;
create policy participants_delete on public.participants
  for delete using (public.has_permission('Admin'));

-- Attendance: enabled-account read + signed-in insert (any volunteer marks present);
-- corrections (delete) are Coordinator+; rows are never updated.
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select using (public.my_role() is not null);
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance
  for insert with check (
    -- my_role(), not auth.uid(): a disabled or not-yet-activated account still
    -- holds a valid JWT, and must not be able to write attendance.
    public.my_role() is not null
    -- Public self check-in may only mark presence against an Active event,
    -- never a draft, closed, or arbitrary past one.
    or exists (
      select 1 from public.events e where e.id = event_id and e.status = 'Active'
    )
  );
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance
  for delete using (public.has_permission('Coordinator'));

-- Audit logs: append-only. Anyone (including the public form) can insert;
-- Coordinator+ can read; nobody can update or delete → immutability.
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert with check (true);
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs
  for select using (public.has_permission('Coordinator'));

-- ---------- Seed lookup data (matches the app's factory defaults) ----------
insert into public.sabhas (name, area) values
  ('Bal Sabha - Sub-group A1', 'North Zone'),
  ('Bal Sabha - Sub-group A2', 'North Zone'),
  ('Bal Sabha - Sub-group B1', 'South Zone'),
  ('Kishore Mandal - East Wing', 'East Zone'),
  ('Kishore Mandal - West Wing', 'West Zone'),
  ('Yuva Mandal - Youth', 'North Zone')
on conflict (name) do nothing;

insert into public.karyakars (name, sabha) values
  ('Ghanshyam Patel', 'Bal Sabha - Sub-group A1'),
  ('Pramukh Swami Das', 'Bal Sabha - Sub-group B1'),
  ('Akshar Patel', 'Kishore Mandal - East Wing'),
  ('Mukund Dave', 'Bal Sabha - Sub-group A2'),
  ('Yogi Joshi', 'Kishore Mandal - West Wing'),
  ('Nilkanth Sharma', 'Yuva Mandal - Youth')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Multi-device live sync needs these tables in the supabase_realtime
-- publication. This used to be a manual dashboard step (SETUP-BACKEND.md §7);
-- skipping it meant subscribeToChanges silently never fired and other devices
-- only saw changes on reload. Guarded so re-running the schema is safe.
do $$
declare t text;
begin
  foreach t in array array['participants','events','attendance','sabhas','karyakars','audit_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
