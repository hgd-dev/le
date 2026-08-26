# Optional Web Push sender

This Edge Function is already wired to the final Stasis schema. It consumes rows from `notification_outbox`, looks up the recipient's saved browser subscriptions, respects per-room quiet hours using the recipient profile timezone, sends Web Push, deletes expired subscriptions, and marks the outbox event processed.

Do **not** deploy this until the base app is working. `SETUP.md` contains the later deployment steps and required secrets.
