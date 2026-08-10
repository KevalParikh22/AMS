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

## 3. Create your admin account

1. Dashboard → **Authentication → Users → Add user → Create new user**.
   Enter your email and a password; check **Auto Confirm User**.
2. Every new account starts as *Attendance Volunteer*. Promote yourself to Admin — open **SQL Editor** and run:

   ```sql
   update public.profiles set role = 'Admin'
   where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
   ```

3. Add more users the same way (volunteers, coordinators). Once you can log into the app as Admin, you assign *their* roles from **Admin Control** in the app — no SQL needed.

## 4. Connect the app

1. Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
2. In the project folder, copy `.env.example` to `.env.local` and paste both values.
3. Restart the dev server (`npm run dev`). The login screen now asks for email + password, and Admin Control shows "Data backend: Supabase Cloud".

> The anon key is safe to ship in the frontend — it only grants what the row-level-security policies allow.

## 5. Migrate your sandbox data (optional, one time)

If you used the app in sandbox mode before connecting the cloud, the app snapshots that data automatically on first cloud start. To move it into Supabase: log in as Admin → **Admin Control** → **Upload sandbox data to cloud**.

## 6. Enable realtime sync (multi-device)

Dashboard → **Database → Replication** → under `supabase_realtime`, enable the tables: `participants`, `events`, `attendance`, `sabhas`, `karyakars`, `audit_logs`. (If you skip this, everything still works — other devices just refresh data on reload instead of live.)

## 7. Deploy the frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → sign up with your GitHub account → **Add New → Project** → import `KevalParikh22/AMS`.
2. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist` (defaults).
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values as `.env.local`.
4. Deploy. Every push to `main` redeploys automatically.
5. Back in Supabase: **Authentication → URL Configuration** → set **Site URL** to your Vercel URL (e.g. `https://ams-xyz.vercel.app`) so password-reset emails link to the right place.

## How the sync works (for the curious)

- The React app keeps all data in memory (source of truth for the UI) and mirrors every change to browser storage *and* Supabase (write-through). If the network drops mid-event, the app keeps working from the local cache and shows an `error`/`offline` badge in Admin Control; data written while offline lives locally until the next successful save of that table.
- Other devices' changes arrive via Supabase realtime and refresh the affected table.
- Server-side, RLS policies enforce the role matrix from [phase-0-decisions.md](phase-0-decisions.md) (D4) independently of the UI: the public form can only *insert pending registrations* and can never read the registry; audit logs are append-only for everyone.

## Troubleshooting

- **Login says "Invalid login credentials"** — the user doesn't exist or the password is wrong; check Authentication → Users.
- **Login works but the app signs you straight out** — your profile is disabled, or the `profiles` row is missing (re-run the schema; the trigger creates profiles for new users only, so for pre-existing users insert a row manually).
- **Changes don't appear on other devices until reload** — enable realtime replication (step 6).
- **"Cloud sync failed" badge** — check the browser console; usually RLS denying a write because the logged-in user's role doesn't permit it.
