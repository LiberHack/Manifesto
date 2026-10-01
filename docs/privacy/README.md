# Privacy, consent and source attribution

What the code does, what it does not, and what has to be decided before the
optional parts are switched on. None of this is a legal certification: it
describes safeguards built into the software. Whether the processing is lawful
depends on the organisational and legal decisions listed at the end.

Related:
[retention-and-deletion.md](retention-and-deletion.md) (deployment, scheduled
deletion, cleanup, backups) ·
[rights-requests.md](rights-requests.md) (access, objection, sponsor copies) ·
[operations-checklist.md](operations-checklist.md) (processors, access, DPIA).

## Purposes are separate

Registration (`/ops/register-edition` → `POST /api/me/registration` →
`register_with_consents()` in one transaction) records one row per purpose in
`consent_records`, with participant, edition, decision, notice version and, for
sponsors, the exact recipient ids:

| Purpose | Required? | Recorded as |
|---|---|---|
| `terms` — Регламент + Code of Conduct | yes | `accepted` |
| `privacy_notice` — notice read | yes | `acknowledged` (not consent) |
| `sponsor_sharing` | yes (organiser decision, see below) | `acknowledged` + `recipient_ids` |
| `marketing_email` | no, explicit yes/no | `granted` / `denied`, later `withdrawn` |
| `dietary_note` | only if a note is given | `granted`, later `withdrawn` |

Browser analytics consent is **not** in this table. It belongs to the browser,
not the account (`analytics_browsers`).

Nothing is backfilled. Legacy `registrations.accepted_terms_at` stays as it was
and never counts as sponsor, marketing or analytics consent. A test checks this
(`supabase/tests/06-verify-privacy.sql`).

### Sponsor sharing is mandatory: an open legal decision

The organisers chose to make sponsor sharing a condition of taking part. The
form therefore has one required checkbox, *"I understand my details will be
shared with the organisations listed above"*. It is recorded as an
**acknowledgment**, not as consent. Under GDPR Art. 7(4), consent that is a
condition of a service is generally not freely given, so labelling it "consent"
would create misleading evidence.

That leaves the legal basis **undecided**. Contractual necessity
(Art. 6(1)(b)) or legitimate interests (Art. 6(1)(f)) would each need a
documented assessment. Legitimate interests would also need a balancing test
and a working right to object. The code does not choose one for you.

**Launch blocker:** do not run sponsor exports until a documented legal
assessment names the basis. If the assessment concludes sharing must be
optional, switch the checkbox to an explicit Yes/No. The schema already
supports `granted`/`denied`, and `sponsor_export_rows()` only needs to accept
`granted`.

Objection/withdrawal is supported either way. An admin records it from the
participant dialog ("Record sponsor objection"). It excludes the person from
every later export and does not touch their registration.

## Sponsor exports

- `GET /api/admin/sponsors/:id/export` is the only sponsor-facing export. The
  participant and team CSVs are internal and say so.
- Eligibility is decided in the database at download time
  (`sponsor_export_rows`): the recipient is active, and the person's **latest**
  `sponsor_sharing` record is an acknowledgment that **lists this recipient**.
  Someone who acknowledged before a sponsor was added is not included for it
  until they confirm again on `/ops/privacy`. Old acknowledgments are never
  extended to new recipients.
- Only `name, email, skills, experience` are available. A check constraint
  limits `sponsor_recipients.shared_fields` to that set, and the function's
  return type cannot carry anything else.
- Every export (sponsor, internal participant/team, catering, aggregate
  reports) checks admin rights on the request itself. It is written to
  `export_audit` (who, kind, recipient, participant ids, row count, time)
  **before** the file is returned; if the log fails, the export fails. Responses
  are `Cache-Control: no-store, private`. CSV cells are escaped against formula
  injection (`=`, `+`, `-`, `@`, tab, CR).
- The aggregate sponsor report (`/api/admin/sponsors/report`) suppresses groups
  below `NUXT_SPONSOR_REPORT_MIN_GROUP` (default 5, floor 3). It also hides a
  second cell when only one would be hidden, so a total cannot reveal it. This
  is a privacy safeguard, **not** anonymisation.

## Analytics: consent-gated, off by default

- `editions.analytics_enabled` defaults to **false**. While it is off, the
  banner never shows, `POST /api/analytics/consent` refuses to mint an id, and
  `analytics_record()` records nothing. Turning it on is a manual admin action
  (Editions table) with a confirmation that points here.
- **Allow analytics** → `analytics_grant()` creates a random UUID with a fixed
  30-day life (`expires_at = consented_at + 30 days`, enforced by a check
  constraint). The server sets it as `lh_aid`: `HttpOnly; Secure;
  SameSite=Lax; Max-Age=30d`, never refreshed. A readable `lh_analytics` cookie
  holds only the answer and its expiry (`granted.<ms>` / `denied`) so the
  banner knows whether to ask.
- **Reject analytics** stores `lh_analytics=denied` for 180 days, deletes any
  existing id, and creates none.
- Before consent, after rejection and after withdrawal, the browser sends
  nothing and stores nothing (`trackIfGranted`). Without `lh_aid` the server
  records nothing, and nothing is queued. No account id, IP hash or fingerprint
  ever stands in for the id.
- Events: `landing_viewed`, `registration_cta_clicked`, `registration_started`
  from the browser. `registration_completed` comes **only** from the
  registration endpoint, after the registration row exists, once per browser and
  edition (unique index).
- Stored per event: browser id, event, edition, source-link id **or** referrer
  category, and the time truncated to the hour. No URLs, query strings, full
  referrers, form contents, names, emails or account ids.
- **Consent-time landing.** The visitor usually arrives through a poster link
  before seeing the banner. On **Allow**, the page they are on is recorded once,
  with the tag it was opened with, which is held in memory only. Nothing from
  earlier page loads exists to send. If your legal review reads this as
  replaying pre-consent data, remove the `trackLanding()` call in
  `useAnalyticsConsent().decide`. Attribution will then only start on the
  *next* tagged visit.
- Withdrawal (`DELETE /api/analytics/consent`, or the Privacy settings dialog on
  every page, no account needed) deletes the browser row and, by cascade, its
  events. `analytics_record()` takes a `FOR SHARE` lock on the browser row, so an
  in-flight event either commits first and is removed by the cascade, or finds
  no row afterwards. Both orders are tested with two real sessions in
  `scripts/test-migrations.sh`.
- Failure never blocks registration: `recordRegistrationCompleted()` catches
  everything, and browser calls are fire-and-forget.

### Minors

Participants are 14–25 (Регламент). Visitors may be younger. Under Bulgarian law
(чл. 25в ЗЗЛД) a child under 14 needs a parent's consent for information-society
services offered on the basis of consent. The banner asks under-14s to involve a
parent. The site cannot know a visitor's age, and asking for it just for
analytics would collect more data, not less. **Decision needed:** whether that
is enough, or whether analytics should stay off for pages aimed at
school-age audiences. Do not collect dates of birth or ID documents for
analytics.

## Sources and attribution

- `source_links`: stable id, **immutable, never-reused** tag, label, note,
  edition, channel, active flag, `archived_at`. A trigger blocks tag changes,
  deletes and reactivating archived links. Tags cannot shadow system sources
  (`direct`, `unknown`, `ref-*`).
- `/go/<tag>` redirects to `/?src=<tag>` for an active link of the current
  edition, otherwise to `/`. It records nothing, so a short-link visit is
  counted once, on the landing page.
- An unknown or disabled `?src=` creates no record. The visit falls back to the
  referrer category. Referrers are reduced to a category by exact or true
  subdomain hostname match (`instagram.com`, `l.instagram.com` → `ref-instagram`,
  `instagram.com.evil.io` → `ref-other`). Only the hostname leaves the browser,
  and only the category is stored.
- Attribution is computed on the server from the browser's own recorded
  landings, never from client-supplied history (`computeAttribution`): a
  30-day window up to completion is applied first, then `direct` landings are
  dropped (a direct return never overwrites the last source), then the earliest
  plus the latest nine are kept. **First** = earliest kept, **last** = latest,
  **assisted** = each distinct earlier source except the last, once per
  registration. The result increments `attribution_daily` (edition, Sofia date,
  model, source, count). No browser or account id is stored there, so reports
  outlive the 60-day event limit.
- Registration-linked touches are **not** stored per person. The admin view
  shows aggregates only.

## Reporting

Admin → Sources: model switch (first/last/assisted), channel filter, bar chart
by source, stacked daily chart (Europe/Sofia), funnel, CSV exports
(`/api/admin/sources/export?kind=sources|funnel`), all aggregate.

- Labelled as *registrations from consenting browsers*. Total registrations are
  shown next to it for context and never used as a denominator.
- Funnel conversion = browsers that completed within 7 days of their first
  landing ÷ browsers that landed, both from the same **closed** cohorts. Cohorts
  whose 7 days are not over are shown separately.
- `assisted` totals can exceed registrations; the view says so.

## Catering, public archive, auth metadata

- Signup no longer sends dietary data (or any consent) into Supabase auth
  metadata. Only name, skills and experience are sent, to pre-fill the edition
  form.
- Food is a structured choice in `registration_catering` (server-only). A
  free-text note needs explicit consent, can be withdrawn on `/ops/privacy`
  (the note is deleted in the same transaction), and is never in a sponsor
  export. The migration copied existing free-text answers as `legacy` notes
  without inventing consent. See retention-and-deletion.md for what to do with
  them and for the reviewed cleanup of the old copies.
- The public archive is opt-in: `registrations.public` defaults to false, and
  `public_opted_in_at` is set only by an explicit opt-in. Archive tooling (not
  built yet) must publish only rows with `public_opted_in_at`, because
  `public = true` on older rows was a default, not a choice. Team pages inside
  `/ops` are for registered participants forming teams; they are not public.

## 1. Implemented and verified safeguards

Verified by `bun run test` (110 tests) and `bun run test:db` (all PASS),
using the stub database and a throwaway Postgres only:

- Separate purpose records, required acknowledgment, explicit marketing answer,
  notice version, recipient scope, no legacy backfill, append-only records.
- Recipient-specific sponsor eligibility; new recipients not covered; objection
  and retirement exclude; field limit; server-side rechecks; export audit;
  `no-store`; CSV formula escaping; small-group suppression.
- Analytics off by default per edition; no collection or storage without
  consent; a fixed 30-day id; rejection remembered; withdrawal deletes events,
  and in-flight events cannot recreate them (tested with two sessions);
  idempotent completion; failure isolation.
- Immutable, non-reusable tags; unknown and disabled tags create nothing;
  spoofed referrer domains go to `ref-other`; payload size and shape limits.
- Attribution window, ten-touch truncation, first/last/assisted definitions;
  closed vs open funnel cohorts with consistent numerator and denominator.
- Retention job (`analytics_purge`) deletes events after 60 days and ids 30
  days after expiry, and rolls up cohorts first. It is logged in
  `maintenance_runs`, and the admin view warns when it is stale.
- All new tables have RLS with no policies and revoked client grants. All new
  functions revoke execute from `anon`/`authenticated`. Direct `anon` queries
  and RPCs are refused (tested).
- Dietary data removed from signup metadata, and a reviewed, dry-run-by-default
  cleanup script for old copies (tested).

## 2. Remaining technical work

- **Schedule the purge** in each environment (pg_cron is not enabled by the
  migration). Add alerting on `maintenance_runs` beyond the admin-panel warning.
- **Run the dietary cleanup** after review, then add a migration dropping
  `registrations.dietary` and `participants.dietary` (and the now-unused
  `participants.skills/experience`).
- **Retention for non-analytics data** (per-edition details, catering after the
  event, consent evidence, export log) is not automated. Pick periods, then
  build the jobs.
- **Account deletion** cascades consent records and catering. Decide whether
  minimal consent evidence must outlive the account. If so, move it to a
  separate table without the cascade.
- **Admin MFA** is not enforced in code. Consider requiring `aal2` on
  `requireAdmin` for exports once admins have MFA set up.
- **Rate limits**: `/go/*` is outside `/api` and therefore unthrottled. Analytics
  endpoints share the general 60/min/IP limit. The database caps each browser at
  200 events/day.
- The visible app is English with a Bulgarian notice. Translate the banner and
  form texts if the site gains a Bulgarian UI.
- Marketing sends: no bulk-email tool exists in the repo. Any future one must
  select recipients by `latest_consent(..., 'marketing_email', null) = 'granted'`.
- `bun run test` also picks up `.worktrees/`. CI has none, but locally run
  `bunx vitest run --exclude '.worktrees/**'`.

## 3. Organisational facts and legal decisions required before activation

| Blocker | Blocks |
|---|---|
| Controller identity (legal name, ЕИК, address) | Publishing the notice; everything |
| Finalise the notice and change `PRIVACY_NOTICE_VERSION` (drop `-draft`) **before opening registration**. Every registration records the version; the admin panel warns when opening against a draft | Opening registration |
| Working, monitored privacy contact (the old notice showed privacy@ but linked contact@; only contact@ is used elsewhere — confirm which exists) | Publishing the notice |
| Documented legal basis for **mandatory** sponsor sharing (see above) | Sponsor exports |
| Named sponsor recipients (legal names, purposes, privacy contacts) and the agreements with them | Sponsor exports |
| Decision on consent-time landing and on under-14 visitors | Turning on analytics |
| Processor details: Supabase region, Cloudflare/Resend transfer safeguards, DPAs, subprocessors, caterer | Notice completeness; analytics |
| Retention periods for per-edition data, catering notes, consent evidence, export log, backups | Notice completeness |
| What to do with `legacy` dietary notes (ask people to re-confirm, or delete) | Catering export of legacy notes |
| Whether 14–17-year-old participants need parental permission under the Регламент | Registration wording |
| DPIA screening (minors + sponsor sharing + analytics), record of processing activities | Activation |

Until these are resolved: keep `analytics_enabled` off and leave
`NUXT_SPONSOR_EXPORTS_ENABLED` unset. Per-person sponsor exports return
`409 sponsor_exports_disabled` until an operator sets it to `true` for the
environment.
