# Handling privacy requests

Requests arrive at the privacy contact in the notice. Answer within one month.
Verify identity by replying from the address on the account, never by asking
for ID documents. Keep a minimal log (date, request type, participant id,
outcome); keep it out of the database tables the request is about.

## Self-service (no admin needed)

| Request | Where |
|---|---|
| Stop or start future-event emails | `/ops/privacy` |
| Delete the dietary note (withdraw its consent) | `/ops/privacy` |
| Confirm newly added sponsors | `/ops/privacy` |
| Withdraw analytics | "Privacy settings" on any page, no account |
| Archive opt-in/out, food choice, experience | `/ops/dashboard` |

## Admin actions

- **Objection to / withdrawal from sponsor sharing:** Admin → participant →
  *Record sponsor objection*. It appends `objected` with the admin's id. The
  person is excluded from every later sponsor export, and their registration is
  untouched.
- **Data a sponsor already received:** a downloaded copy cannot be recalled
  automatically. Look up which exports included the person:
  `GET /api/admin/exports?edition=<slug>&participant=<id>` (or Admin → Sponsor
  sharing → Export log). Then:
  1. Tell the person which organisations received which fields, and when.
  2. Forward the request (erasure or objection) to each recipient's privacy
     contact. Each sponsor is an independent controller and handles it under its
     own policy.
  3. Note in the request log that it was forwarded, and when.
- **Access / portability:** the person's rows in `participants`,
  `registrations`, `registration_catering`, `consent_records`, and export-audit
  entries that include them. Analytics is not linked to accounts. If they ask
  about analytics, explain they can withdraw it in their browser, which deletes
  it.
- **Erasure:** Admin → participant → *Delete participant* deletes the auth
  user. It cascades to participants, registrations, catering and consent
  records. Then: handle sponsor copies (above), and add the participant id to
  the restore re-apply list (retention-and-deletion.md → Backups).
- **Correction:** most fields are self-service; otherwise edit in Supabase.
