# Edition Transition Runbook

## LIVE → DORMANT (closing an edition)

Pre-flight: ensure `archive/redactions.pending.json` is empty.

1. **Record results** — In `/ops/admin`, set `placement`, `awards`, and `presentation_order` on all teams.
2. **Close current** — Click "Close Edition" in `/ops/admin` (calls `close_edition('2026')`). Status becomes `archived`, `is_current = false`.
3. **Export** — On a machine with DB access and the repo checked out:
   ```bash
   bun scripts/archive-export.ts --slug 2026
   ```
   Review the diff: one new `archive/2026.json` + one updated `archive/index.json`. Confirm the data looks correct.
4. **Commit archive files**:
   ```bash
   git add archive/2026.json archive/index.json
   git commit -m "docs(archive): export 2026 edition"
   ```
   Do NOT commit `archive/redaction-keyring.json` (it is .gitignored; store it securely admin-side).
5. **Static build**:
   ```bash
   NUXT_PUBLIC_SITE_MODE=dormant bun generate
   ```
6. **Deploy static output** — Push `.output/public/` to Caddy. Shut down the Node app and Supabase stack:
   ```bash
   cd supabase-docker && docker compose down
   ```

## DORMANT → LIVE (opening the next edition)

1. **Bring DB up**:
   ```bash
   cd supabase-docker && docker compose up -d
   ```
2. **Apply any queued redactions** (drain pending before any new export):
   ```bash
   bun scripts/apply-redactions.ts
   git add archive/redactions.pending.json archive/redactions.applied.json
   git commit -m "ops: drain redaction queue before going live"
   ```
3. **Prepare next edition** — In `/ops/admin`, create a draft edition (set slug, name, dates). Or it was pre-created before going dormant.
4. **Go live** — Click "Go Live" in `/ops/admin` (calls `go_live_edition('<next-slug>')`).
5. **Redeploy SSR app**:
   ```bash
   NUXT_PUBLIC_SITE_MODE=live docker compose up -d --build
   ```

## Removal request during dormancy

1. Identify the request type:
   - Opt-out of one edition's showcase → `redact-hide`
   - Full account erasure (GDPR) → `redact-delete`
2. Find the token via `archive/redaction-keyring.json` (admin-side only).
3. Run the appropriate script:
   ```bash
   # Opt-out (hide from one edition):
   bun scripts/redact-hide.ts --slug <slug> --token <token> --who <email>

   # Full erasure:
   bun scripts/redact-delete.ts --who <email>
   ```
4. Commit the modified archive files and updated pending queue:
   ```bash
   git add archive/<slug>.json archive/index.json archive/redactions.pending.json
   git commit -m "ops: redact <email> from archive (dormant)"
   ```
5. **Rebuild and redeploy the static site** so the removal is live immediately:
   ```bash
   NUXT_PUBLIC_SITE_MODE=dormant bun generate
   # redeploy .output/public/ to Caddy
   ```
   The DB action stays queued in `redactions.pending.json` until the next DORMANT→LIVE boot.
