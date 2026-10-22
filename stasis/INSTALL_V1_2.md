# Install Stasis v1.2 in two steps

This is an upgrade for an existing working Stasis deployment.

## Step 1 — Supabase

Open **Supabase -> SQL Editor -> New query** and run the entire contents of:

`stasis/supabase/stasis_v1_2_complete_upgrade.sql`

This one migration includes both the 1500-character note upgrade and the full Arcade backend.

## Step 2 — GitHub

Overlay this patch's `stasis/` directory onto your existing repository's `stasis/` directory, commit, and push.

**Do not replace your existing `stasis/config.js`.** The patch ZIP intentionally does not contain that file, so your current Supabase URL and publishable key remain in place.

After GitHub Pages deploys, hard refresh Stasis once so the v1.2 service worker cache replaces the old one.

See `ARCADE_SETUP.md` and `TESTING.md` for the full checklist.
