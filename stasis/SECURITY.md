# Stasis security model

Stasis is designed so the public GitHub Pages frontend is not trusted with authorization decisions.

## Browser-safe configuration

The frontend may contain only:

- Supabase project URL
- Supabase publishable key
- public VAPID key

The following must never appear in the repository:

- Supabase service-role / secret key
- database password
- VAPID private key
- webhook secret

## Database-enforced rules

Row Level Security and security-definer RPCs enforce the important boundaries.

### Profiles

A profile is readable only by the account itself or someone who shares a room with that account. Display names are not globally enumerable by every authenticated user.

### Rooms

Rooms and room membership are readable only by room members.

### Cards

A card is readable only by an allowed member of that room. A user can insert/update only a card whose `user_id = auth.uid()` and only while they belong to the room.

Disabling an HTML input is not treated as security; the database rejects unauthorized writes even if someone manually calls the API.

### Blocking

A block prevents new direct-room pairing between the accounts. Existing direct rooms shared by the pair are removed. In shared group rooms the blocked pair remains in the group, but the blocked card is hidden by RLS/UI behavior.

### Room administration

- owners: full room administration, role changes, ownership transfer, deletion
- admins: room appearance/invite management and member removal
- members: own card, personal pinning, own notification preferences, leave room

Admins cannot remove the owner. Ownership must be transferred explicitly.

### Account deletion

Before deleting an Auth user, the database transfers owned rooms to another member (preferring admins) or deletes rooms with no remaining members. This prevents foreign-key failures and avoids orphaned rooms.

## Invite codes

Generated codes use an alphabet that removes easily confused characters and are protected by a database unique constraint. Custom codes are normalized and checked both before creation and by the unique constraint to protect against races.

The room UUID remains independent of its invite code, so regenerating a code does not replace the room.

## Push notifications

Push subscriptions are private to their user. Notification outbox rows are not granted to browser roles. The Edge Function uses the service role only on the server and stores the VAPID private key in server-side secrets.

Notes are not included verbatim in notification bodies by default; a note change produces a generic “left a new note” message.

## Encryption boundary

Stasis uses authenticated transport and database access control, but room notes are not end-to-end encrypted. A Supabase project administrator with database access can read stored plaintext. Client-side/E2E note encryption would be a separate architectural feature.

## Arcade security boundary

Arcade sessions inherit room privacy: `game_sessions` can only be selected by authenticated members of the parent Stasis Room. All mutations go through RPCs that verify membership; joining also respects Stasis blocks. Turn submissions are serialized with row locks, require the caller to be the current player, and require the client's expected session version to match the current database version.

The v1.2 Arcade keeps individual game-rule evaluation in `games.js`. This prevents accidental/out-of-turn writes but is not designed as tournament anti-cheat: a participant who intentionally modifies their own browser client could submit a fabricated board state during their legal turn. No private/hidden-information games are included in this release, so game state being readable by room members does not reveal hidden hands or secrets.
