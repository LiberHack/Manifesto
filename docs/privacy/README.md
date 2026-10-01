# Privacy, consent and source attribution

This page describes what the code does and does not do, and which decisions
are still open. It is not a legal certification. It covers the safeguards built
into the software. Whether the processing is lawful also depends on the
organisational facts at the end of this page.

Related documents:

- [retention-and-deletion.md](retention-and-deletion.md): schedule,
  monitoring, cleanup, backups, rollout.
- [rights-requests.md](rights-requests.md): access, withdrawal, data
  sponsors already received.
- [operations-checklist.md](operations-checklist.md): processors, access,
  logs, DPIA.

## Purposes are separate

Registration goes through `/ops/register-edition`, then
`POST /api/me/registration`, then `register_with_consents()`, all in one
transaction. It writes one `consent_records` row per purpose. Each row holds
the participant, edition, decision, notice version and server timestamp; for
sponsors it also holds the recipient.

| Purpose | Required? | Recorded as |
|---|---|---|
| `terms`: Регламент and Code of Conduct | yes | `accepted` |
| `privacy_notice`: the notice was read | yes | `acknowledged`; this is not consent |
| `sponsor_sharing` | an explicit answer is required; **Yes is not** | one row **per named recipient**: `granted` / `denied`; later `withdrawn` |
| `marketing_email` | an explicit yes/no | `granted` / `denied`; later `withdrawn` |
| `dietary_note` | only if a note is given | `granted`; later `withdrawn` |

Browser analytics consent is not stored here. It belongs to the browser, not
the account (`analytics_browsers`).

The following never count as consent: legacy `accepted_terms_at`, missing
values, and the `acknowledged` sponsor rows written under the earlier,
mandatory draft of this feature (migration `20261002000100`). Those rows are
preserved unchanged and remain acknowledgments. Existing participants must
give a fresh Yes in `/ops/privacy` before they can be exported. This is tested
in `supabase/tests/06-verify-privacy.sql`.

## Sponsor sharing: voluntary, per recipient, fails closed

- **Form:** for each named organisation, the question is "Would you like us to
  share your name, email, skills and experience level with … so they can
  contact you about jobs and internships?" The answers are *Yes, share my
  profile* or *No, do not share my profile*. Nothing is preselected. The
  question appears in English and Bulgarian, as a `radiogroup` per
  organisation. The form states that the answer does not affect participation.
  An edition with one recipient shows a single question.
- **Age:** "Are you 18 or older?" is asked only after a Yes
  (`registrations.recruitment_adult`). Exports require `true`. No rule exists
  yet for sharing the profiles of 14–17-year-olds, so they are never exported.
- **Server-side enforcement:**
  - `parseRegistrationInput` rejects a missing or non-boolean answer; `false`
    passes.
  - `register_with_consents` rejects answer sets that don't match the
    edition's active recipients exactly, or a Yes without the age answer.
- **Changing an answer:** `/ops/privacy` lets a participant change each answer
  through `set_sponsor_choice`. Changing a Yes to No records `withdrawn`; the
  registration is untouched.
- **New recipients:** a recipient added later starts with nobody eligible.
  Earlier answers never extend to it.
- **Eligibility:** `sponsor_export_rows(recipient)` requires:
  - the recipient is active;
  - the latest decision for *that* recipient is `granted` (an edition-wide
    admin `objected` row overrides it);
  - `recruitment_adult = true`.

  Acknowledgments, denials, withdrawals, objections and missing answers all
  exclude.
- **The export path** `GET /api/admin/sponsors/:id/export` is the only one
  that serves sponsors. Checks run in this order on every request:
  1. Admin role.
  2. **MFA**: the JWT `aal` must be `aal2`, checked server-side through
     `requireAdminWithMfa`.
  3. The **activation gate**: `NUXT_SPONSOR_EXPORTS_ENABLED=true`, a
     server-side environment setting that is off by default and is not an
     admin checkbox.
  4. Recipient exists and is not retired.
  5. Eligibility in the database at generation time.
  6. The `export_audit` row is written before any data is returned.

  The response is `no-store` and its CSV cells are escaped against formula
  injection.
- **Fields:** only `name, email, skills, experience`. The function's return
  type and a check constraint on `sponsor_recipients.shared_fields` allow
  nothing else.
- **Other personal-data exports** (participants, teams, catering, the
  aggregate sponsor report) also require admin + MFA, audit, `no-store` and
  escaping. They are labelled organiser-internal.
- **No stale files:** nothing is queued or stored, and there are no reusable
  download links. Every download recomputes eligibility, so a withdrawal
  takes effect on the next export.
- **Files already handed over** cannot be recalled automatically. See
  [rights-requests.md](rights-requests.md).
- **Direct database access:** `anon`/`authenticated` cannot select the tables
  or execute the functions. This is tested, including a signed-in user calling
  `sponsor_export_rows`.

**Organisational follow-up, not done:** agreeing with each sponsor that the
database they receive is opt-in only. It is smaller than "all participants",
contains adults only, and changes as people say No. Do not tell sponsors
otherwise until this is agreed.

## Analytics: off by default, consent-gated

Two gates, both off by default:

1. **Server gate:** `NUXT_ANALYTICS_ACTIVATION_ALLOWED`, an environment
   setting. Until it is `true`:
   - the admin cannot switch analytics on (`409
     analytics_activation_not_allowed`);
   - the banner is never offered;
   - the consent and event endpoints and registration completion record
     nothing.

   It stays off until the age/parental-consent approach (below) is decided
   *and implemented*.
2. **Per edition:** `editions.analytics_enabled`, an admin toggle.

When both are on, analytics works as follows.

- **Choice:** "Allow analytics" and "Reject analytics" are equal buttons, with
  a persistent *Privacy settings* link on every page. Silence, scrolling or
  navigating is not an answer.
- **ID:** Allow → `analytics_grant()` creates a random UUID with a **fixed
  30-day life** (a check constraint enforces `expires_at = consented_at + 30
  days`). The server sets it as `lh_aid`: HttpOnly, Secure, SameSite=Lax,
  `Max-Age` 30 days, never refreshed.
- **Choice cookie:** `lh_analytics` holds only the answer and its expiry. A
  rejection is remembered for 180 days. When a grant expires, the banner asks
  again.
- **No consent, no data:** before consent, after rejection or after
  withdrawal, the browser sends nothing and stores nothing (`trackIfGranted`),
  and the server records nothing without `lh_aid`. No account ID, IP hash or
  fingerprint is used in its place, and nothing is queued for later.
- **Events:**
  - `landing_viewed`, `registration_cta_clicked` and `registration_started`
    come from the browser.
  - `registration_completed` comes **only** from the registration request that
    created the registration row, through
    `analytics_complete_registration(browser, edition, registration, …)`.
    `analytics_record()` refuses it.
- **Stored per event:** browser ID, event, edition, source-link ID **or**
  referrer category, time truncated to the hour, and attribution keys on
  completion rows only. Never stored: URLs, query strings, full referrers, form
  contents, names, emails, or account or registration IDs.

### Completion and conversion semantics

- **A registration is counted once per registration,** not once per browser.
  `analytics_completion_keys(registration_id)` deduplicates retries; it holds
  no browser ID, is removed with the registration, and is purged after 60 days.
  A retried request that hits `Already registered` records nothing.
- **Converted browsers** are counted in the funnel: each browser once per
  edition, from its first recorded landing in that edition. There is no global
  once-per-browser flag across editions.
- **Shared browser:** two people registering on one browser are two
  registrations but one converted browser. **Multiple devices:** one person on
  phone and laptop is two browsers, and only the device they registered on
  shows the completion. Neither is corrected for. Reports say so.
- **Funnel:** numerator and denominator come from the same population.
  Conversion = browsers with a completion within 7 days of their first landing
  ÷ browsers that landed, in the same cohorts. Cohorts whose 7 days aren't
  over are shown separately as open. Dates are Europe/Sofia.

### What happens at consent time (measurement boundary)

A visitor typically arrives through a poster link before seeing the banner. On
**Allow**:

- If they are **still on the page they landed on**, that page is recorded
  once as `landing_viewed`, with the tag it was opened with (held in memory
  only) and the referrer hostname. The server stamps it with **consent time**
  (to the hour). It is not backdated to the page load.
- If they have **navigated away**, nothing is recorded for the landing
  (`landingToRecordOnConsent`). Earlier pages and clicks are never replayed,
  and nothing is read from persistent storage, because none exists before
  consent.
- Time spent before consent is not measured. The funnel starts at the first
  recorded landing, which is at or after consent.

The Sources view states this boundary next to the figures.

### Data inventory: individual vs aggregate

| Kind | Where | Contains | Lifetime | On withdrawal |
|---|---|---|---|---|
| Temporary browser-level data | `analytics_browsers`, `analytics_events` (landings, CTA, form start, completion with its attribution keys) | random browser ID, events, source, hour | ID: 30 days. Events: ≤ 60 days. Expired IDs deleted 30 days after expiry | deleted at once (cascade) |
| Attribution state | computed from the browser's own landings at completion and stored **on the completion event** (`attr_first/last/assisted`) | source keys | as events | deleted with the events |
| Completion dedupe | `analytics_completion_keys` | registration ID, time; **no browser ID** | 60 days, or until the registration is deleted | not linked to a browser, so not removed. It reveals only that a registration was processed |
| Cohort/conversion state | computed live by `funnel_cohorts()` from events | — | as events | changes immediately |
| Aggregates | `attribution_daily`, `funnel_cohort_daily` (+ `analytics_rollup_days`) | counts per edition, Sofia day, source/channel | kept | see below |
| Consent evidence (browser) | `analytics_browsers.consented_at`/`notice_version` | — | as the ID | deleted. Withdrawal is logged in `deletion_ledger` (ID only) |
| Consent evidence (account) | `consent_records` | participant, purpose, edition, decision, version, recipient, time | while the account exists. Superseded rows only by a decided policy | — |

**Aggregates and withdrawal.** A day or cohort is folded into the aggregate
tables only once **no browser in it can still withdraw**:

- An ID lives 30 days from consent, and consent precedes the first landing.
- So the purge only finalises days and cohorts at least 31 Sofia days old.

Until then the reports compute those figures live from individual events, so a
withdrawal removes the browser from every total immediately. Finalised totals
therefore never include a withdrawn browser and are never adjusted afterwards.

These totals hold no identifiers. They are aggregate statistics, **not claimed
to be anonymised**: a day with one registration from a niche source is still
one person. Access is admin-only.

**Attribution model.** This is computed server-side from the browser's
recorded landings, never from client-supplied history (`computeAttribution`):

1. Apply the 30-day window up to completion.
2. Drop `direct` landings, so a direct return never overwrites the last
   source.
3. Keep the earliest landing plus the latest nine.

**First** is the earliest kept, **last** the latest, and **assisted** each
distinct earlier source except the last, once per registration.

Retries cannot double count (per-registration key). Withdrawal deletes the
completion row, and with it the attribution.

## Sources and short links

- `source_links` have:
  - a stable ID, and a tag that is **immutable and never reused**;
  - a label, note, edition and channel;
  - an active flag and `archived_at`.

  A trigger blocks tag changes, deletes and reactivation after archiving.
  System sources (`direct`, `unknown`, `ref-*`) cannot be tags.
- `/go/<tag>` redirects to `/?src=<tag>` for an active link of the current
  edition, and to `/` otherwise. That is a fixed local destination, so it can't
  be an open redirect. It records nothing (the landing page does, once, and
  only with consent), and it is `no-store`.
- The previously truncated note was this: `/go/*` sat outside the `/api/*`
  rate limiter while doing a database lookup per request. It now shares the
  per-IP API limit (`server/middleware/02.rateLimit.ts`).
- URLs carry only the public tag. No visitor ID or personal data ever goes into
  a URL. Tracking parameters are stripped from the address bar after reading.
- An unknown or disabled `?src=` creates no record. Referrers are reduced to a
  category by exact or real-subdomain hostname match (`instagram.com.evil.io`
  becomes `ref-other`). Only the hostname leaves the browser, and only the
  category is stored.
- QR codes are generated in the browser (`uqr`). Campaign links are never sent
  to a QR service.

## Sponsor-facing aggregate report and its limits

`/api/admin/sponsors/report`:

- **Experience levels** (a partition) are suppressed below
  `NUXT_SPONSOR_REPORT_MIN_GROUP` (default 5, floor 3), with **complementary
  suppression**: never exactly one hidden cell beside a visible total. The
  total is withheld when it is itself small.
- **Skills** overlap, so each is shown only when ≥ k people share it, and
  never as a complement.
- **Only for final editions** (archived or past `ends_at`). Repeated exports
  of a live edition could be differenced to reveal one new person, so they are
  refused (`409 edition_not_final`). The output is deterministic for the same
  data.
- **Limits:** tests cover every distribution of up to 14 people across the
  experience groups, overlapping skills, and repeated exports. Suppression
  does **not** protect against combining this report with outside knowledge
  (e.g. a sponsor who knows most participants), or with the per-person export
  for that sponsor's own opt-ins. It is a safeguard, not anonymisation.

## Catering, public archive, auth metadata

- **Signup metadata:** signup sends only name, skills and experience into auth
  metadata. No dietary data and no consents.
- **Catering:**
  - The food choice is structured and stored in `registration_catering`, a
    server-only table.
  - Free-text notes need explicit consent, and are **only offered once a
    catering retention period is decided** (`dietary_notes_enabled()`). Until
    then, the database refuses them.
  - Notes are never in a sponsor export. Legacy notes without consent are
    withheld from the catering export.
- **Public archive:** opt-in only (`public_opted_in_at`). The archive tooling,
  which isn't built yet, must publish only opted-in rows. Team pages in `/ops`
  are for registered participants forming teams, not public.

## Minors

- **Event participation:** 14–25, per the Регламент. Whether 14–17-year-olds
  need a parent's permission to take part is a question for the event rules.
  The code does not decide it.
- **Recruitment sharing:** only for people who answer "18 or older". No
  handling rule exists for 14–17, so they are never exported. If one is
  approved later, it must be implemented explicitly.
- **Analytics:** visitors' ages are unknown, and a banner note is not a
  parental-consent mechanism. Analytics therefore stays behind the server gate
  until an approach is decided and implemented.
  - The age of digital consent in Bulgaria is 14 (чл. 25в ЗЗЛД).
  - Learning someone's age at registration does not validate tracking that
    happened before.
  - Do not collect dates of birth or ID documents for analytics.
  - There are no known under-14 users: registration is 14+, and no age is
    recorded for analytics.

## 1. Implemented and verified safeguards

- **Consent and evidence:**
  - Separate purpose records, explicit Yes/No per recipient, explicit
    marketing answer.
  - Notice version, recipient scope and server timestamps on every record.
  - No backfill; legacy acknowledgments preserved and never eligible.
  - Append-only records that can still be erased, and survive an admin's
    account deletion.
- **Sponsor exports fail closed:**
  - Activation gate, admin role and MFA (`aal2`).
  - Recipient-specific eligibility; adults only; new recipients start empty;
    withdrawal, objection and retirement exclude.
  - Field limit, audit before data, `no-store`, formula escaping.
  - Direct DB/RPC access refused.
- **Analytics:**
  - Server gate plus edition toggle, both off by default.
  - No collection without consent; fixed 30-day ID; rejection remembered.
  - Consent-time landing only on the landing page, never backdated.
  - Withdrawal deletes immediately, and in-flight events cannot recreate
    (two-session test).
  - Per-registration completion dedupe; shared-browser semantics; consistent
    funnel populations; open vs closed cohorts.
  - Aggregates finalised only after withdrawal is impossible.
- **Retention:**
  - `run_retention()` is scheduled by pg_cron through the migration. Tested in
    a disposable container: job created once, idempotent on re-apply,
    executed successfully.
  - Missed runs email admins via the Worker cron monitor.
  - Undecided categories are skipped, never guessed.
  - A deletion ledger plus `reapply_deletion_ledger()` handles backup
    restores.
- **Dietary cleanup:** writes stopped. Reviewed scripts clean auth metadata
  and both legacy columns (stage 2), then drop the columns only after the
  cleanup is verified (stage 3). Both are tested.
- **Short links:** rate limited, `no-store`, fixed destination, no tracking.
- **Notices:** English and Bulgarian notices describe the behaviour actually
  implemented, with no placeholders.

## 2. Remaining technical work

- **Registration-data retention:** automatic deletion of per-edition
  registration data (skills, experience, teams) after an edition is not
  built. It touches the edition-archiving/redaction path, which AGENTS.md
  requires a human to review first. It's also blocked on the retention
  decision.
- **Consent-evidence retention:** consent records are deleted when the
  account is deleted. If evidence must outlive the account, move a minimal
  copy to a separate table without the cascade, once that period is decided.
- **Export-log retention:** `export_audit.participant_ids` keeps IDs of
  accounts deleted later. Decide whether erasure should remove them (this
  weakens disclosure evidence) or whether the log has its own period.
- **Notice rendering:** `PRIVACY_NOTICE_FINAL` is `false`, and the admin panel
  warns before opening registration. Set it to `true` when the facts below are
  resolved and published.
- **Bulgarian UI:** the banner and form labels outside the sponsor question
  are English, as the rest of the site is. Translate them if the site gains a
  Bulgarian UI.
- **Bulk email:** no marketing bulk-email tool exists in the repo. Any future
  one must select recipients by
  `latest_consent(..., 'marketing_email', null).decision = 'granted'`.

## 3. Organisational facts and legal decisions required

These are not technical defects. Each blocks the feature named.

| Missing fact or decision | Blocks |
|---|---|
| Controller identity: legal name, ЕИК, registered address | Final notice (`PRIVACY_NOTICE_FINAL`); opening registration under a final notice |
| Confirm `contact@liberhack.org` is a monitored mailbox with a named owner and response process (send a test, record who answers). The earlier notice displayed `privacy@`, which nothing else uses; it was dropped | Final notice |
| Sponsor recipients' legal names, purposes and privacy contacts, entered in Admin → Sponsor sharing | Sponsor exports |
| Agreement with each sponsor on the opt-in, adults-only database scope, purpose limitation and onward sharing | Sponsor exports (`NUXT_SPONSOR_EXPORTS_ENABLED`) |
| Rule for recruitment sharing of 14–17-year-olds (if ever wanted) | Exporting anyone under 18, which is currently impossible |
| Whether 14–17 participants need parental permission to take part | Registration wording (event rules) |
| Age/parental-consent approach for analytics (visitors may be under 14) | `NUXT_ANALYTICS_ACTIVATION_ALLOWED` |
| Processor details: Supabase project region, Cloudflare and Resend DPAs, transfer mechanisms, subprocessors; caterer agreement | Final notice; analytics activation |
| Retention periods: catering (also enables food notes), export log, superseded consent evidence, deletion ledger (must cover the backup window), per-edition registration data, maintenance log | Automatic deletion of each category; food notes |
| What to do with `legacy` food notes (ask people to re-confirm, or delete) | Catering export of those notes |
| DPIA screening (minors + third-party sharing + analytics); record of processing activities | Activation of analytics and sponsor exports |
