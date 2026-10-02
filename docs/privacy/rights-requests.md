# Handling privacy requests

**Where requests arrive:** `contact@liberhack.org`, the address in the
notice. Before launch, confirm the mailbox is monitored and has a named owner:
send a test request and record who answered and when.

**Deadline:** one month.

**Identity:** verify by replying from the address on the account. Never ask
for ID documents.

**Request log:** keep a minimal log (date, request type, participant ID,
outcome), outside the tables the request is about.

## Self-service (no admin needed)

| Request | Where |
|---|---|
| Say Yes or No (or change it) to sharing with each named organisation | `/ops/privacy` |
| Stop or start future-event emails | `/ops/privacy` |
| Delete the food note (withdraw its consent) | `/ops/privacy` |
| Withdraw analytics; deletes this browser's events | *Privacy settings* on any page, no account needed |
| Public archive opt-in/out, food choice, experience | `/ops/dashboard` |

## Admin actions

Personal-data exports and the export log need an admin session with a
verified second factor (`/ops/admin/mfa`).

### Objection to sponsor sharing, by email

Admin → participant → *Record sponsor objection*.

- It appends an edition-wide `objected` record with the admin's ID.
- It overrides earlier Yes answers for every recipient. Only a later explicit
  Yes from the person changes that.
- The registration is untouched.

### Data a sponsor already received

A downloaded file cannot be recalled automatically.

1. Find the exports that included the person. Use Admin → Sponsor sharing →
   Export log, or call
   `GET /api/admin/exports?edition=<slug>&participant=<id>`.
2. Tell the person which organisations received which fields, and when.
3. Forward the request (erasure, objection) to each recipient's privacy
   contact. Each one is an independent controller and handles it under its
   own policy.
4. Record the forwarding in the request log.

### Queued exports and earlier files

There are none to change. Exports are generated per request, are never stored
or queued, and have no reusable links. A withdrawal applies to the next
download. Files downloaded before the withdrawal are covered by the previous
section.

### Access and portability

Give the person their rows in:

- `participants`
- `registrations`
- `registration_catering`
- `consent_records`
- the export-log entries that include them

Analytics is not linked to accounts. Explain that withdrawing in their browser
deletes it.

### Erasure

1. Admin → participant → *Delete participant*. This deletes the auth user and
   cascades to participants, registrations, catering and consent records. A
   trigger writes the ID to `deletion_ledger`, so a backup restore re-applies
   the deletion.
2. Handle sponsor copies as above.

The export log keeps the account ID. See README → remaining technical work.

### Correction

Most fields are self-service. Edit anything else in Supabase.
