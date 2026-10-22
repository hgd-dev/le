# Stasis final setup — Supabase + GitHub Pages

## Existing live Stasis install

If your original Stasis database is already running and you are upgrading to the Arcade release, run only `stasis/supabase/games_migration.sql` in the SQL Editor, then deploy the frontend files. See `ARCADE_SETUP.md`.

The application code is already complete. These are the connection/deployment steps to do later.

## 1. Create a Supabase project

Create a free Supabase project and wait for the database to finish provisioning.

## 2. Install the database

Open **Supabase → SQL Editor → New query** and run the entire contents of:

`stasis/supabase/schema.sql`

Use a fresh project or run this schema before adding production data. It creates the final tables, triggers, security policies, realtime publication, and RPC functions used by the frontend.

The schema includes:

- `profiles`
- `rooms`
- `room_members`
- `stasis_cards`
- `blocks`
- `notification_preferences`
- `push_subscriptions`
- `notification_outbox`
- `game_sessions`
- room-code / room-admin RPCs
- global-status and card-copy RPCs
- account-deletion handling
- Row Level Security
- Realtime publication
- notification outbox trigger

## 3. Configure Supabase Auth

Stasis uses email + password authentication.

In Supabase Auth settings:

1. Keep Email auth enabled.
2. Choose whether email confirmation is required.
3. Add the deployed Stasis URL to Auth redirect URLs, for example:

`https://YOUR-USERNAME.github.io/le/stasis/`

You can also add a local development URL while testing.

Password-recovery links return to the Stasis root and the app automatically opens its reset-password screen.

## 4. Fill in `config.js`

Open `stasis/config.js` and replace the placeholders:

```js
window.STASIS_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_REPLACE_ME",
  webPushPublicKey: "REPLACE_ME_WITH_PUBLIC_VAPID_KEY",
  appName: "Stasis"
};
```

Only the first two values are required for the main application.

The browser may safely contain:

- Supabase project URL
- Supabase **publishable** key
- Web Push **public** VAPID key

Never place these in GitHub Pages:

- Supabase `service_role` / secret key
- database password
- VAPID private key
- Edge Function webhook secret

## 5. Add the folder to `le`

Your repository can look like:

```text
le/
├── index.html
├── like-me/
├── what-i-like-about-you/
├── flowers/
└── stasis/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── config.js
    ├── manifest.webmanifest
    ├── sw.js
    ├── icons/
    └── supabase/
```

Stasis uses hash routes such as:

`/le/stasis/#/dashboard`

`/le/stasis/#/room/<uuid>`

`/le/stasis/#/join/<code>`

so GitHub Pages does not need server-side route rewrites.

## 6. Core two-account test

Use two browser profiles or one regular + one private window.

1. Create Account A.
2. Create Account B.
3. From A, create a two-person room.
4. Copy the code or invite link.
5. Join from B.
6. Keep the room open in both browsers.
7. Change A's status, mood, availability, and note.
8. Confirm B receives realtime updates without refreshing.
9. Confirm B cannot edit A's controls.
10. Try a manual database update from B against A's card and confirm RLS rejects it.
11. Test custom status/mood.
12. Test `until`.
13. Test copying A's card to a second room.
14. Test the dashboard “set everywhere” panel.
15. Test block/unblock from a room.

See `TESTING.md` for the full release checklist.

# Optional: Web Push notifications

The final folder already includes browser subscription code, notification preferences, quiet hours, an outbox trigger, and a Supabase Edge Function. You can connect it after the core app works.

## 7. Generate VAPID keys

Generate a Web Push VAPID keypair using a trusted Web Push tool/package.

You will receive:

- **public key** → goes in `config.js`
- **private key** → stays only in Supabase Edge Function secrets

## 8. Deploy the included Edge Function

Function path:

`stasis/supabase/functions/send-push/index.ts`

Deploy it as a Supabase Edge Function named `send-push`. Because the database webhook is authenticated with a custom secret rather than a user JWT, deploy the endpoint in the appropriate no-user-JWT mode and protect it with the `x-stasis-webhook-secret` header.

Set these server-side secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — e.g. `mailto:you@example.com`
- `STASIS_WEBHOOK_SECRET` — a long random value

Supabase provides the project URL and service-role credentials to Edge Functions; never copy the service-role key into the frontend.

## 9. Add a database webhook

Create a Supabase Database Webhook:

- table: `public.notification_outbox`
- event: `INSERT`
- destination: the deployed `send-push` Edge Function
- header: `x-stasis-webhook-secret: <same secret>`

The SQL trigger only creates outbox rows for recipients who already have at least one push subscription, so leaving Web Push unconfigured does not create unnecessary notification rows.

## 10. Enable a device

In Stasis:

1. Open **Settings**.
2. Choose **enable on this device**.
3. Grant browser notification permission.
4. Open a room → **room controls → notifications**.
5. Choose which changes to receive.
6. Optionally set quiet hours.

The frontend stores the browser Push API subscription in `push_subscriptions`. The private VAPID key remains server-side.

## PWA / mobile notes

Stasis is already installable as a PWA.

- iPhone/iPad: Safari → Share → Add to Home Screen
- Android/Chrome: browser install prompt / Add to Home Screen
- desktop Chromium browsers: Install app

The service worker provides an offline app shell and handles Web Push notification clicks. Your own card edits made while temporarily offline are queued in local storage and synced when connectivity returns.

If you later want App Store / Play Store packages, the frontend can be wrapped in Capacitor while keeping the Supabase backend and most app logic intact.
