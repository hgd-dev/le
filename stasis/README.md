# Stasis ♡ — final application folder

Stasis is a realtime private status-room app designed to live inside the `le` GitHub Pages repository.

It is intentionally quieter than chat: every room contains one current card per person. A card can show status, mood, availability, an optional end time, and a short note. Everyone in the room can see the allowed cards; the database permits each person to edit only their own.

## Included in this release

- email/password accounts
- password recovery
- saved account dashboard
- two-person rooms
- multi-person group rooms
- owner / admin / member roles
- generated unique invite codes
- custom invite codes with availability checks
- shareable invite links
- enable / disable room joining
- room name, icon, accent, and pinning
- status dropdown
- custom status text
- mood dropdown
- custom mood text
- availability / contact preference
- optional `until` time
- 1500-character current note
- realtime room updates
- realtime dashboard refresh
- database-enforced “edit only your own card”
- global “set everywhere” status updates
- copy selected card fields between rooms
- leave room
- remove group members
- promote / demote admins
- transfer ownership
- permanently delete rooms
- strong account blocking
- block-list management
- light / dark / system themes
- offline shell caching
- queued offline edits for your own card
- installable PWA
- per-room notification preferences
- Web Push subscription management
- quiet hours with timezone awareness
- optional Supabase Edge Function for background push delivery
- account deletion with safe room-ownership transfer
- privacy-focused Row Level Security


## Stasis Arcade v1.2

Every created room has a **games** tab with persistent realtime room games. This release includes 19 playable games:

- Tic-Tac-Toe
- Four in a Row
- Gomoku
- Reversi
- Mancala
- Chess
- Checkers
- 8-Ball
- 9-Ball
- Cup Pong
- Dots & Boxes
- Filler
- Anagrams
- Word Chain
- Darts
- Archery
- Basketball
- Mini Golf
- Shuffleboard

Lobbies, turns, winners, rematches, room leaderboards, and match state are saved in Supabase and survive refreshes. Direct rooms naturally host 2-player games; group rooms can run supported 2–4 and 2–8 player games. The 1500-character note upgrade is included in the same database migration.

The physics-inspired games use lightweight timing/skill mechanics designed for GitHub Pages and realtime turn syncing rather than copying GamePigeon assets or code.

## Folder layout

```text
stasis/
├── index.html
├── style.css
├── games.css
├── games.js
├── app.js
├── config.js
├── manifest.webmanifest
├── sw.js
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── supabase/
│   ├── schema.sql
│   ├── games_migration.sql
│   └── functions/
│       └── send-push/
│           ├── index.ts
│           └── README.md
├── README.md
├── ARCADE_SETUP.md
├── SETUP.md
├── SECURITY.md
├── TESTING.md
└── CHANGELOG.md
```

## Deployment model

The app has no frontend build step:

- **GitHub Pages** serves the static frontend.
- **Supabase Auth** provides accounts.
- **Supabase Postgres** stores rooms/cards/preferences.
- **Supabase RLS** enforces room privacy and write permissions.
- **Supabase Realtime** streams room/card changes.
- **Supabase Edge Functions** are optional and used only for background Web Push delivery.

The frontend contains only public browser-safe values: the Supabase project URL, Supabase publishable key, and optional public VAPID key. Secret keys never belong in this folder.

See `SETUP.md` when you are ready to connect the finished app.

## Optional local verification

If Node.js is installed, run:

```bash
node stasis/scripts/verify.mjs
```

It checks JavaScript parsing, the manifest, local assets, frontend RPC/schema consistency, core RLS markers, notification schema presence, and common secret patterns. It intentionally allows the placeholder public config until you connect Supabase.
