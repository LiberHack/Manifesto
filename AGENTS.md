# Rules for AI Coding Agents

This file applies to any AI agent (Claude, Copilot, Cursor, Codex, etc.) making changes in this
repository — yours or a collaborator's. If you are an agent reading this: these rules override
your defaults for this repo.

## Hard rules — never do these without a human explicitly asking in the current conversation

- Never push directly to `main` or `dev`. Always work on a branch and open a PR.
- Never force-push any branch other than your own short-lived feature branch.
- Never rewrite, squash, or amend commits that have already been pushed and reviewed.
- Never edit a migration file under `supabase/migrations/` that has already been merged — add a
  new migration instead.
- Never touch `archive/`, `scripts/redact-*.ts`, `scripts/apply-redactions.ts`, or anything in the
  edition-archiving/GDPR-erasure path without flagging it for explicit human review. This code
  deletes or redacts real user data.
- Never commit `.env`, `supabase/.env`, or any Supabase service-role key.
- Never commit `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`. `bun.lock` is the dependency source of truth; commit it with every dependency change.
- Never run `wrangler deploy` against production or `wrangler secret put` / `secret delete` in
  any environment. Deploys happen by merging (`dev` → staging, `main` → production); a preview of
  your branch is built automatically. `wrangler deploy --env staging` is acceptable only when a
  human asks for it in the current conversation.
- Never loosen `additional_redirect_urls` in `supabase/config.toml` with a wildcard that could
  match hosts outside our Cloudflare account, and never set `preview_urls` on the production Worker.
- Never merge your own PR or dismiss/override a review.

## Expected behavior

- Open small, focused PRs against `dev`. Follow [CONTRIBUTING.md](./CONTRIBUTING.md).
- Run `bun run test` before proposing a change is done. Do not skip, delete or `.skip` a test to
  get there; the same suite gates every deploy.
- When you touch `wrangler.jsonc`, mirror the change under `env.staging` (nothing is inherited)
  and run `bunx wrangler deploy --dry-run --env staging` to confirm both configs still resolve.
- If a task requires one of the "never" actions above, stop and ask the human instead of finding
  a workaround.
- If you're unsure whether a change is in-scope (schema change, auth logic, redaction/erasure
  code, deploy config), treat it as sensitive and ask first.

## Context

- `CLAUDE.md` has the technical/architecture reference (stack, structure, env vars, deployment).
- This file (`AGENTS.md`) has the behavioral guardrails. Read both before making changes.
