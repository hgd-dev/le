# Stasis v1.2.0

- bundled 1500-character note upgrade
- expanded Arcade from 8 to 19 games
- added Chess with legal-move validation, castling, en passant and promotion
- added Checkers with mandatory captures, multi-jumps and kings
- added 8-Ball and 9-Ball timing-based pool games
- added Cup Pong
- added Anagrams
- added Darts, Archery, Basketball, Mini Golf and Shuffleboard
- preserved realtime lobbies, rematches, room win counts and turn-version protection
- service worker cache bumped to v1.2

# Changelog

## 1.1.0-arcade — 2026-10-21

### Arcade
- room-level Games tab
- persistent realtime game sessions
- waiting lobbies, joins, host start, resign, cancel, rematch
- optimistic versioning to prevent stale-turn overwrites
- room-only RLS access and protected game RPCs
- room win leaderboard
- Tic-Tac-Toe
- Four in a Row
- Gomoku
- Reversi
- Mancala
- Dots & Boxes (2–4)
- Filler (2–4)
- Word Chain (2–8)
- PWA cache updated for Arcade assets
- 1500-character note limit retained in this release

## 1.0.0-final — 2026-08-25

Final pre-connection application folder.

### Core
- account dashboard
- direct and group Stasis rooms
- generated/custom unique codes
- shareable invite links
- realtime status cards
- status, custom status, mood, custom mood, availability, until, note
- database-enforced own-card editing

### Dashboard / rooms
- global “set everywhere” workflow
- copy selected card fields between rooms
- room pinning
- room icon and accent themes
- room rename
- joining controls
- code regeneration

### Groups
- owner/admin/member roles
- owner-controlled admin promotion/demotion
- ownership transfer
- manager member removal
- safe ownership transfer when owner leaves

### Safety / account
- stronger profile privacy
- blocking and unblock management
- password recovery
- light/dark/system appearance
- safe account deletion

### Mobile / reliability
- responsive phone layout
- installable PWA
- service-worker shell cache
- queued offline own-card writes
- online/offline indicator

### Notifications
- per-room preferences
- quiet hours
- timezone sync
- browser Push API subscription management
- notification outbox trigger
- included `send-push` Supabase Edge Function
- push click routing
