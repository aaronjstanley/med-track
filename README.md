# Med Track

Personal medicine inventory and dose tracker. Each person uses their own account — no shared data between users (you and your spouse each sign up separately).

## Features

- **Home** — list medicines and remaining counts; **Take current medicine** deducts the current time-slot
- **Options** — add / edit / delete medicines and schedule entries; reorder schedule with Up / Down
- **NFC (`/take`)** — program an iPhone NFC tag to open `https://<your-domain>/take` (or `http://localhost:3000/take` while testing). It records the same dose as the home button
- **Push alerts** — when any medicine hits its reorder threshold (default 5), a Web Push notification is sent

## Stack

- Next.js (App Router) + TypeScript
- Supabase Auth + Postgres (RLS per user)
- Installable PWA + Web Push (iOS 16.4+ via Home Screen)

## Setup

1. Copy env vars:

```bash
cp .env.example .env.local
```

Fill in your Supabase project URL and anon key, plus VAPID keys:

```bash
npx web-push generate-vapid-keys
```

2. Apply the SQL in [`supabase/migrations/20260830210000_init_med_track_schema.sql`](supabase/migrations/20260830210000_init_med_track_schema.sql) to your Supabase project (already applied if you used the Med Track project created for this app).

3. In Supabase Dashboard → **Authentication**:

- **URL Configuration** — Site URL: `http://localhost:3000` (and later your production URL). Redirect URLs: `http://localhost:3000/auth/callback`, `https://<your-domain>/auth/callback`
- **Providers → Email** — for a personal app, turn off **Confirm email** so you can sign up and use the app immediately without inbox setup

4. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, add medicines and a schedule.

## Dual accounts (no crossover)

1. Create account A (you) → add your medicines/schedule
2. Sign out → create account B (spouse) on the same app URL
3. Each login only sees that user’s rows (enforced by RLS)

## iPhone: Home Screen + push

1. Open the site in Safari
2. Share → **Add to Home Screen**
3. Launch from the icon (not a Safari tab)
4. Sign in, then tap **Enable push alerts** on the home screen
5. iOS only delivers Web Push to the installed Home Screen app

## NFC tag

Program the tag (Shortcuts / NFC Tools / etc.) to open:

```text
https://<your-domain>/take
```

You must already be signed in on that device (Safari or the Home Screen app). Scanning around e.g. 12:15 deducts every medicine scheduled for the latest slot at or before now (12:00), once per day per slot.

## Dose matching rules

- Uses your device timezone
- Picks the latest scheduled time **≤ now**
- Same slot cannot be taken twice in one day
- Before the first scheduled time of the day, you’ll get “no scheduled dose yet”

## Deploy

Deploy to Vercel (or similar), set the same env vars, update Supabase Auth URLs to the production domain, and reprogram the NFC tag to the production `/take` URL.
