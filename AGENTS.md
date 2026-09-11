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
- Never commit `.env`, `supabase-docker/.env`, or any Supabase service-role key.
- Never commit `bun.lock` / `bun.lockb`. `package-lock.json` is the dependency source of truth.
- Never modify `.github/workflows/*` (CI/CD, deploy) without explicit human sign-off.
- Never merge your own PR or dismiss/override a review.

## Expected behavior

- Open small, focused PRs against `dev`. Follow [CONTRIBUTING.md](./CONTRIBUTING.md).
- Run `bun test` before proposing a change is done.
- If a task requires one of the "never" actions above, stop and ask the human instead of finding
  a workaround.
- If you're unsure whether a change is in-scope (schema change, auth logic, redaction/erasure
  code, deploy config), treat it as sensitive and ask first.

## Context

- `CLAUDE.md` has the technical/architecture reference (stack, structure, env vars, deployment).
- This file (`AGENTS.md`) has the behavioral guardrails. Read both before making changes.
