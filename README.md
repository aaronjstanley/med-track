# Med Track

Personal medicine inventory and dose tracker. Hosted on **GitHub Pages**. Each person uses their own account — no shared data between users.

**Live app:** https://aaronjstanley.github.io/med-track/

## Features

- **Home** — list medicines and remaining counts; **Take current medicine** deducts the current time-slot
- **Options** — add / edit / delete medicines and schedule entries; reorder with Up / Down
- **NFC (`/take/`)** — program an iPhone NFC tag to open `https://aaronjstanley.github.io/med-track/take/`
- **Push alerts** — when any medicine hits its reorder threshold (default 5), a Web Push is sent via a Supabase Edge Function

## Stack

- Next.js static export (GitHub Pages)
- Supabase Auth + Postgres (RLS per user) + Edge Function for push
- Installable PWA (iOS 16.4+ Home Screen for push)

## Local development

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_* and NEXT_PUBLIC_VAPID_PUBLIC_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Leave `NEXT_PUBLIC_BASE_PATH` unset locally.

## GitHub Pages deploy

Pushes to `main` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

Required **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key |

Pages is served at `/med-track/` (`NEXT_PUBLIC_BASE_PATH=/med-track`).

## Supabase setup

1. Apply [`supabase/migrations/20260830210000_init_med_track_schema.sql`](supabase/migrations/20260830210000_init_med_track_schema.sql)
2. Deploy Edge Function `send-low-stock-push` (already in repo under `supabase/functions/`). In the [Edge Function Secrets](https://supabase.com/dashboard/project/ltryvlcrnjdfjyqcufgq/functions/secrets) page, add:

   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (e.g. `mailto:you@example.com`)

   Without these, reorder push notifications will not send (inventory tracking still works).
3. Auth → **URL Configuration**:
   - Site URL: `https://aaronjstanley.github.io/med-track`
   - Redirect URLs: `https://aaronjstanley.github.io/med-track/**`, `http://localhost:3000/**`
4. Auth → Email: turn off **Confirm email** for a personal app without SMTP

## Dual accounts

Create separate accounts on the same URL. RLS keeps each user’s medicines private.

## iPhone: Home Screen + push

1. Open the live URL in Safari
2. Share → **Add to Home Screen**
3. Launch from the icon → sign in → **Enable push alerts**

## NFC tag

```text
https://aaronjstanley.github.io/med-track/take/
```

Stay signed in on that device. Scanning around e.g. 12:15 deducts the latest scheduled slot at or before now (12:00), once per day per slot.

## Dose matching

- Uses device timezone
- Latest scheduled time **≤ now**
- Same slot cannot be taken twice in one day
