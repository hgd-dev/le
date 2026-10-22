# Stasis Arcade v1.2 + 1500-character upgrade

This patch is designed to overlay an existing working Stasis installation. **It intentionally does not ship `config.js` in the ZIP**, so your live Supabase URL/publishable key are preserved.

## 1. Database upgrade

Open Supabase -> SQL Editor -> New query and run the entire file:

`stasis/supabase/stasis_v1_2_complete_upgrade.sql`

This single migration:

- expands notes from 280 to 1500 characters
- updates the Set Everywhere note validation to 1500
- creates/updates `public.game_sessions`
- adds Arcade RLS and protected RPCs
- enables realtime game updates
- supports all v1.2 game types
- can upgrade a Stasis install whether or not the earlier Arcade migration was run

Do not rerun the full base schema on a database with real data. Use this migration.

## 2. Upload the files

Overlay the patch's `stasis/` folder on your existing `stasis/` folder. Keep your current `stasis/config.js`.

Commit and push to GitHub Pages. Hard-refresh once after deploy so the service worker replaces the older cache.

## Games included

**2 players:** Tic-Tac-Toe, Four in a Row, Gomoku, Reversi, Mancala, Chess, Checkers, 8-Ball, 9-Ball, Cup Pong.

**2–4 players:** Dots & Boxes, Filler, Darts, Archery, Basketball, Mini Golf, Shuffleboard.

**2–8 players:** Anagrams, Word Chain.

## Notes on game security

Room membership, joining, turn ownership, state versions, rematches and winners are protected through Supabase RPC/RLS. Individual game rules are evaluated in `games.js`, so Arcade is designed for casual private-room play, not tournament-grade anti-cheat. Hidden-information games such as Sea Battle and Crazy 8 are intentionally not faked with public JSON state; they should use a separate private-state/server-rule layer in a future release.
