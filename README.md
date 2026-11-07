# MedTrack

Personal medicine inventory and dose tracker. Hosted on **GitHub Pages**. Each person uses their own account — no shared data between users.

**Live app:** https://aaronjstanley.github.io/med-track/

## Features

- **Home** — list medicines and remaining counts; **Take current medicine** deducts the current time-slot
- **Options** — add / edit / delete medicines and schedule entries; reorder with Up / Down
- **NFC (`/take/`)** — program an iPhone NFC tag to open `https://aaronjstanley.github.io/med-track/take/`
- **Push alerts** — subscriptions are stored in Neon; delivery requires a configured push Function endpoint

## Stack

- Next.js static export (GitHub Pages)
- Neon Auth + Lakebase Postgres Data API (RLS per user)
- Installable PWA (iOS 16.4+ Home Screen for push)

## Local development

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_VAPID_PUBLIC_KEY when using push notifications
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Leave `NEXT_PUBLIC_BASE_PATH` unset locally.

## GitHub Pages deploy

Pushes to `main` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

Required **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `NEXT_PUBLIC_PUSH_FUNCTION_URL` | Optional compatible push Function endpoint |

Pages is served at `/med-track/` (`NEXT_PUBLIC_BASE_PATH=/med-track`).

## Neon setup

This repo is linked to the same Neon project and `main` branch as
`storage-scan`. Apply
[`neon/migrations/001_med_track_schema.sql`](neon/migrations/001_med_track_schema.sql)
with a direct (`DATABASE_URL_UNPOOLED`) connection.

The browser uses `NEXT_PUBLIC_NEON_URL`; never expose `DATABASE_URL` in the
browser or commit `.env.local`.

Supabase password hashes are not compatible with Neon Auth. Existing users
must create new Neon accounts. Data exported from Supabase must be reassigned
to those new user IDs before import.

The `nfctake` Neon Function is deployed from
[`neon/functions/nfc-take.ts`](neon/functions/nfc-take.ts) and preserves the
Apple Shortcuts NFC workflow.

Low-stock push delivery remains optional until `NEXT_PUBLIC_PUSH_FUNCTION_URL`
points to a function that validates Neon Auth tokens and sends Web Push using
the VAPID private key. Inventory tracking, dose logging, and push subscription
storage work without it.

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
