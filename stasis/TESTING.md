# Stasis final release checklist

## Static checks

- [ ] `app.js` passes JavaScript syntax validation
- [ ] `sw.js` passes JavaScript syntax validation
- [ ] `manifest.webmanifest` parses as JSON
- [ ] every local asset referenced by `index.html` exists
- [ ] no service-role / database / VAPID-private secrets are present

## Auth

- [ ] sign up
- [ ] email-confirmation flow if enabled
- [ ] sign in
- [ ] sign out
- [ ] forgot-password flow from signed-out page
- [ ] reset password
- [ ] display-name update
- [ ] light / dark / system theme
- [ ] account deletion

## Direct rooms

- [ ] generated code
- [ ] custom available code
- [ ] duplicate custom code rejected
- [ ] join by code
- [ ] join by invite link
- [ ] direct room automatically closes joining after second member
- [ ] room can be reopened only when it has fewer than two members
- [ ] code regeneration
- [ ] room rename/icon/accent
- [ ] leave room
- [ ] owner transfer after owner leaves
- [ ] permanent delete

## Cards

- [ ] status
- [ ] custom status
- [ ] mood
- [ ] custom mood
- [ ] availability
- [ ] until time
- [ ] note autosave
- [ ] 1500-character limit
- [ ] realtime update visible to other member
- [ ] another member cannot edit your card through API manipulation
- [ ] offline own-card change queues
- [ ] queued change syncs after reconnect

## Dashboard

- [ ] rooms persist across sign-in/devices
- [ ] pin/unpin
- [ ] pinned rooms sort first
- [ ] direct-room status peek
- [ ] group member count
- [ ] global “set everywhere” updates selected rooms only
- [ ] global custom status/mood
- [ ] global optional note
- [ ] copy card fields between rooms

## Group rooms

- [ ] 3+ members
- [ ] responsive multi-card layout
- [ ] owner promotes admin
- [ ] owner demotes admin
- [ ] owner transfers ownership
- [ ] admin manages room appearance/invite settings
- [ ] admin removes regular member
- [ ] admin cannot remove owner
- [ ] member cannot perform manager actions

## Blocking

- [ ] block another member
- [ ] existing direct room removed
- [ ] blocked accounts cannot create/join a new direct pairing together
- [ ] blocked card hidden in shared group
- [ ] unblock from settings

## Realtime

- [ ] card update
- [ ] member join/leave
- [ ] room rename/settings change
- [ ] dashboard refreshes
- [ ] room refresh does not overwrite an actively edited field

## PWA

- [ ] service worker installs
- [ ] app installs to home screen
- [ ] shell opens after going offline
- [ ] notification click opens correct room route

## Optional Web Push

- [ ] VAPID public key configured in frontend
- [ ] VAPID private key stored only in Edge Function secret
- [ ] device subscription saved
- [ ] per-room preference saved
- [ ] database webhook calls Edge Function
- [ ] status notification obeys preference
- [ ] mood notification obeys preference
- [ ] availability notification obeys preference
- [ ] note notification does not expose note contents
- [ ] quiet hours respected in recipient timezone
- [ ] expired browser subscriptions are removed
- [ ] disable-on-device unsubscribes and deletes the stored endpoint


## Arcade v1.2

- [ ] room shows status / games tabs
- [ ] only room members can select `game_sessions`
- [ ] create a 2-player game
- [ ] second room member can join
- [ ] non-host cannot start waiting lobby
- [ ] host can start once minimum players join
- [ ] only current turn player can submit a move
- [ ] second browser receives moves in realtime
- [ ] refresh preserves the match
- [ ] winner/draw state persists
- [ ] rematch creates a new lobby
- [ ] Dots & Boxes works with 3–4 players
- [ ] Filler works with 3–4 players
- [ ] Word Chain works with 3+ players
- [ ] cancelled lobby can no longer start
- [ ] block prevents blocked accounts from joining the same new lobby


## Arcade v1.2 expanded games

- [ ] Chess legal moves work; illegal moves are rejected; castling/en-passant/promotion work
- [ ] Checkers forces captures and supports multi-jumps/kings
- [ ] 8-Ball keeps solids/stripes separate and requires clearing the group before the 8
- [ ] 9-Ball progresses in numerical order
- [ ] Cup Pong removes cups and ends when a rack is cleared
- [ ] Anagrams rotates turns and ends at five points
- [ ] Darts / Archery / Basketball complete the configured attempts and score correctly
- [ ] Mini Golf completes five holes and lowest score wins
- [ ] Shuffleboard completes eight slides and highest score wins
- [ ] 1500-character room notes save normally
- [ ] two browsers see Arcade state update without refresh
