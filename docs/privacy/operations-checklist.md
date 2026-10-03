# Operational privacy checklist

Repository changes cannot verify production settings. Each item below is
checked by a person in the provider's dashboard or in a document, with the date
and who checked it.

## Processors and transfers

| Provider | Role | Check |
|---|---|---|
| Supabase | Database, auth | [ ] DPA accepted · [ ] project region recorded (setup guide recommends eu-central-1) · [ ] subprocessor list reviewed · [ ] backup / PITR window recorded |
| Cloudflare | Hosting (Workers), DNS, CDN, D1 | [ ] DPA accepted · [ ] transfer mechanism recorded · [ ] Web Analytics / Zaraz confirmed **off** (no second, unconsented tracker) |
| Resend | Auth SMTP + transactional email | [ ] DPA accepted · [ ] region and transfer mechanism recorded · [ ] open/click tracking **off** for these emails |
| Caterer | Receives catering list | [ ] agreement covers confidentiality and deletion after the event |
| Sponsors | Independent controllers | [ ] legal names and privacy contacts recorded in Admin → Sponsor sharing · [ ] agreement on purpose limitation and onward sharing |

## Logs

- [ ] Cloudflare Workers logs / `wrangler tail`: what is retained and for how long. Request logs contain IP addresses.
- [ ] Supabase API, auth and Postgres logs: retention per plan.
- [ ] App logs never print personal data: request bodies, emails and cookie values are never logged (the email helper no longer logs recipient addresses). Keep it that way in review.
- [ ] Cloudflare request logs contain `/go/<tag>` and `?src=<tag>` URLs: public tags only, no visitor IDs.

## Access

- [ ] Admins listed (`participants.role = 'admin'`); remove anyone who no longer needs it.
- [ ] `bunx supabase config push` applied `[auth.mfa.totp]`; every admin enrolled at `/ops/admin/mfa` (exports are refused without an `aal2` session).
- [ ] MFA enabled on the Supabase, Cloudflare, Resend and GitHub organisation accounts.
- [ ] Supabase service key only in Cloudflare secrets (`wrangler secret`), never in the repo.
- [ ] Review `export_audit` after each sponsor hand-over.

## Records and assessments

- [ ] Record of processing activities (Art. 30) covering: accounts, edition registration, catering, sponsor sharing, marketing, analytics, export audit.
- [ ] DPIA screening: minors (14–17) plus sharing with third parties plus analytics. Document the outcome either way.
- [ ] Sponsor agreements on the opt-in, adults-only scope (see README → organisational facts).
- [ ] Retention periods decided for the "not yet set" rows in retention-and-deletion.md.
- [ ] Rights-request log and owner (rights-requests.md).

## Incidents

- [ ] Named owner. Breach notification to КЗЛД within 72 hours where required (Art. 33). Inform participants where there is high risk (Art. 34).
- [ ] Rotation steps: Supabase service key, Resend key, admin sessions.
- [ ] If an export file leaked: use `export_audit` to identify the people affected.

## Before turning on sponsor exports

- [ ] Recipients entered with legal names; agreement with each on the opt-in, adults-only scope.
- [ ] Legal/organisational rows for sponsor sharing in README.md resolved.
- [x] `NUXT_SPONSOR_EXPORTS_ENABLED=true` set for that environment only: staging, 2026-10-02. Production not yet.

## Before turning on analytics

- [ ] Age/parental-consent approach decided and implemented; DPIA screening done.
- [ ] `select jobname from cron.job` shows `liberhack-retention`, and a `retention` row in `maintenance_runs` from the last day.
- [x] `NUXT_ANALYTICS_ACTIVATION_ALLOWED=true`: staging, 2026-10-02. Production not yet.
- [ ] Edition toggle switched on in Admin → Editions (per environment).
- [ ] On staging: Reject sets no `lh_aid` cookie, Allow sets an HttpOnly one, Withdraw removes it and the browser's events.

## Shared database

- [ ] Remember that staging and production use one Supabase project: staging tests write real rows. Use throwaway test accounts and delete them after.
