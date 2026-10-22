# CIRCADIA v1.2 — Native Stasis Integration

This ZIP contains **all original Stasis files** and a native CIRCADIA section at `stasis/circadia/`. No npm, React build, new GitHub repository, second login, or environment variable is required. It reuses the existing `stasis/config.js` and the same-origin Supabase Auth session. Games, existing rooms, and Stasis database tables are preserved.

## Deploy

1. Back up your existing Stasis repository and Supabase database before changing anything.
2. In your existing **Stasis Supabase project**, first review and run **`stasis/supabase/circadia_schema.sql`** with SQL Editor. This migration creates CIRCADIA-only `cycles`, `daily_logs`, `private_notes`, `partner_grants`, and `invites` tables and its invitation RPC functions. Inspect for naming conflicts before running. It does NOT change Stasis rooms or profiles.
3. Replace the repository's existing `stasis/` folder content with the `stasis/` content in this ZIP (or copy the changed files). Keep the folder layout you currently deploy (for a repository whose root already is Stasis, copy the **contents**, not a nested `stasis/` directory).
4. Commit and push to GitHub. From the signed-in Stasis dashboard, click **Open CIRCADIA**, or visit the Stasis base URL followed by `/circadia/`.
5. Create two *test* accounts, issue an invitation as account A, redeem it as account B, and verify that all permission toggles are off. Grant **only cycles**, verify no symptom or notes records can be queried from B using the browser Supabase client, then revoke access and repeat the query. Check cross-account insert/update/delete denial as well.
6. Test on mobile and refresh Stasis and CIRCADIA with each account after logging in or out. Confirm Stasis rooms and games still behave as they did before.

## Safeguards

- The cycle journal is private by default and requires a separate explicit partner grant. Stasis room membership confers no access.
- Access is enforced using Postgres Row Level Security, not just frontend checkboxes. The UI clears partner data and refreshes grants on focus / every 15 seconds, but copied data cannot be revoked.
- CIRCADIA records are **not end-to-end encrypted**. Supabase administrators can potentially access database contents. Do not enter real data until you validate RLS and privacy in production with test records.
- Forecast uses a simple Bayesian-shrinkage heuristic and displays an **uncalibrated** estimated interval. It is not for pregnancy prevention, ovulation prediction, diagnosis or treatment. The original prototype neural network is not deployed or claimed trained.
- Research links open PubMed search results and transmit the search keywords to PubMed (not diary entries).
- Stasis's existing account deletion RPC may need amendment to remove Auth users and CIRCADIA health records safely. Check this function before relying on account deletion. CIRCADIA records cascade when the Auth user is deleted.

## Files changed/added

- `app.js`: Stasis dashboard card and top-bar navigation to CIRCADIA
- `style.css`: dashboard card styling
- `sw.js`: version bump and excludes CIRCADIA routes from Stasis's shell fallback
- `circadia/index.html`, `circadia/circadia.js`, `circadia/circadia.css`: dependency-free Stasis-authenticated CIRCADIA app
- `supabase/circadia_schema.sql`: additive RLS-protected medical data migration
- `CIRCADIA_INTEGRATION.md`: these instructions

## Original development source

The previous standalone React/CIRCADIA v1.1 source has **not** been rebuilt here. Instead, this release implements its core functional concepts as a static, native Stasis module, without requiring npm. Its untrained neural-network framework is not included in the runtime. Future model research belongs in a separate, tested experimental module, not production health predictions.
