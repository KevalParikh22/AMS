# Backend Setup — Supabase + Vercel

The app runs in two modes:

- **Local sandbox** (default): all data in this browser's storage, mock logins. Nothing to set up.
- **Cloud mode**: data in Supabase Postgres, synced across devices in realtime, real email/password logins with password reset, and the role matrix enforced server-side by row-level security.

Cloud mode turns on automatically when the two environment variables below are present.

## 1. Create the Supabase project (~5 minutes)

1. Go to [supabase.com](https://supabase.com) → sign up (free) → **New project**.
2. Pick any name (e.g. `sabha-ams`), a strong database password (store it safely — you rarely need it again), and the region closest to you.
3. Wait for the project to finish provisioning.

## 2. Create the database schema

1. In the Supabase dashboard, open **SQL Editor**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. You should see "Success". This creates all tables, the role-based security policies, and seeds the default sabha/karyakar lists. The script is safe to re-run.

## 3. Authentication settings

Dashboard → **Authentication → Providers → Email**:

- **Turn OFF "Confirm email".** The app creates volunteer logins directly, and an unconfirmed account cannot sign in.
- **Turn OFF "Allow new users to sign up".** Defence in depth — the schema already creates every new account *disabled*, so a stranger who signs up gets nothing, but there is no reason to leave the door open.

## 4. Create your admin account

This is the only account you create by hand; every other user is added from inside the app.

1. Dashboard → **Authentication → Users → Add user → Create new user**.
   Enter your email and a password; check **Auto Confirm User**.
2. New accounts start as a *disabled* Attendance Volunteer. Promote **and enable** yourself — open **SQL Editor** and run:

   ```sql
   update public.profiles set role = 'Admin', enabled = true
   where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
   ```

3. Sign into the app as Admin. From now on, add volunteers in **Admin Control → User Accounts & Roles**: enter their name, email, and an initial password, pick a role, and they can sign in immediately on their own phone. No dashboard, no SQL.

### Which role to give a volunteer

| Role | Mark attendance | Register walk-ins | Undo / approve | Events, Reports | Admin Control |
|---|:--:|:--:|:--:|:--:|:--:|
| **Registration Volunteer** ← use this | ✓ | ✓ | — | — | — |
| Attendance Volunteer | ✓ | — | — | — | — |
| Coordinator | ✓ | ✓ | ✓ | ✓ | — |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |

**Registration Volunteer** is the right tier for a typical event volunteer: marking attendance is the base level every signed-in user has, so this role covers both everyday jobs while corrections and approvals stay with you.

To revoke access after the event you have two options in **Admin Control**:

- **Disable** — reversible. They are signed out on their next page load and the server stops answering them regardless of any session they hold. Use this for "not right now".
- **Remove** (trash icon) — permanent. Deletes their profile, so they vanish from the list and can never sign in again. Attendance and audit history they created is kept, because those columns store a name, not a link to the account.

One caveat on Remove in cloud mode: deleting the underlying Supabase login needs the service-role key, which must never ship in a browser, so **the auth user survives**. That grants nothing on its own — without a profile row every policy refuses them — but it does keep the email address reserved. To reuse that address, also delete it under **Authentication → Users** in the dashboard.

## 5. Connect the app

1. Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. In the project folder, copy `.env.example` to `.env.local` and paste both values.
3. Restart the dev server (`npm run dev`). The login screen now asks for email + password, and Admin Control shows "Data backend: Supabase Cloud".

> The anon key is safe to ship in the frontend — it only grants what the row-level-security policies allow.

## 6. Migrate your sandbox data (optional, one time)

If you used the app in sandbox mode before connecting the cloud, the app snapshots that data automatically on first cloud start. To move it into Supabase: log in as Admin → **Admin Control** → **Upload sandbox data to cloud**.

## 7. Realtime sync (multi-device)

**Nothing to do — `schema.sql` now adds all six tables to the `supabase_realtime` publication for you.** This used to be a manual step that was easy to miss, and skipping it silently disabled live sync.

To confirm, Dashboard → **Database → Replication** should list `participants`, `events`, `attendance`, `sabhas`, `karyakars`, and `audit_logs` under `supabase_realtime`.

## 8. Deploy the frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → sign up with your GitHub account → **Add New → Project** → import `KevalParikh22/AMS`.
2. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist` (defaults).
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as `.env.local`.
4. Deploy. Every push to `main` redeploys automatically.
5. Back in Supabase: **Authentication → URL Configuration** → set **Site URL** to your Vercel URL (e.g. `https://ams-xyz.vercel.app`) so password-reset emails link to the right place.

## How the sync works (for the curious)

- The React app keeps all data in memory (source of truth for the UI) and mirrors every change to browser storage *and* Supabase (write-through). If the network drops mid-event, the app keeps working from the local cache and shows an `error`/`offline` badge in Admin Control; data written while offline lives locally until the next successful save of that table.
- Other devices' changes arrive via Supabase realtime and refresh the affected table.
- Server-side, RLS policies enforce the role matrix from [phase-0-decisions.md](phase-0-decisions.md) (D4) independently of the UI: the public form can only *insert* and can never read the registry; roster reads require an **enabled** account, so a disabled or self-signed-up user sees nothing; audit logs are append-only for everyone.

## Upgrading an existing project

Re-running [`supabase/schema.sql`](supabase/schema.sql) is how you apply updates. **Do not drop any tables first** — the script is written to upgrade in place (`create table if not exists`, `create or replace function`, `drop policy if exists` + recreate, `add column if not exists`, `on conflict do nothing`). It contains no `drop table`, `truncate`, or `delete`.

This was tested by seeding a database with the previous schema and running the current one over it: participant, event, attendance, audit, sabha and karyakar row counts were all preserved, and existing profiles kept their role and `enabled` flag — so **re-running will not lock out your admin**.

### One-time: backfill emails on pre-existing accounts

Accounts created before `profiles.email` existed have a blank email, so Admin Control shows a truncated UUID (`#a1b2c3d4`) instead of a person. `auth.users` is not readable from the browser, so copy the addresses across once in the **SQL Editor**:

```sql
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email = '';
```

Purely cosmetic — nothing depends on it, and volunteers added through the app get their email automatically. Safe to re-run.

## Troubleshooting

- **Login says "Invalid login credentials"** — the user doesn't exist or the password is wrong; check Authentication → Users.
- **Login works but the app signs you straight out** — your profile is disabled (new accounts start disabled by design — enable it from Admin Control), or the `profiles` row is missing (re-run the schema; the trigger creates profiles for new users only, so for pre-existing users insert a row manually).
- **User list shows `#a1b2c3d4` instead of names/emails** — pre-existing accounts have a blank email; run the backfill query under *Upgrading an existing project*.
- **Changes don't appear on other devices until reload** — re-run `schema.sql`; it registers the tables for realtime (step 7).
- **"An account with that email already exists" when adding a volunteer** — the auth user exists but its profile may be disabled; find them in the list below the form and hit **Enable**.
- **A new volunteer can't sign in** — "Confirm email" is still on in Authentication → Providers → Email (step 3), so their account is unconfirmed.
- **"Cloud sync failed" badge** — check the browser console; usually RLS denying a write because the logged-in user's role doesn't permit it.
- **`violates row-level security policy (USING expression)` on `audit_logs` or `attendance`** — you are on a build from before this was fixed. Those two tables are immutable by design (insert and delete only, never update), but the sync layer was re-pushing existing rows with `ON CONFLICT DO UPDATE`, which needs an UPDATE policy that deliberately does not exist. Deploy the current build; it uses `ON CONFLICT DO NOTHING` for those tables. No schema change is needed.
