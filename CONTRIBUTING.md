# Contributing

## Branching

- `main` — production. Always deployable. Protected: no direct pushes, no force-pushes.
- `dev` — integration branch for the next release. Protected: no direct pushes, no force-pushes.
- Everything else is a short-lived branch off `dev`, named `feat/...`, `fix/...`, `docs/...`, or `chore/...`.

**Never commit directly to `main` or `dev`.** Open a PR from a feature branch, even for small changes.

## Workflow

1. Branch off `dev`: `git checkout dev && git pull && git checkout -b feat/my-thing`
2. Commit in small, reviewable chunks. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
3. Open a PR into `dev`. Fill in the PR template.
4. `dev` is merged into `main` for releases, not merged into ad-hoc.

## Rules for AI coding agents

If you're an AI agent (Claude, Copilot, Cursor, etc.) working in this repo, see [AGENTS.md](./AGENTS.md) — it is mandatory, not optional context.

## Database migrations

- Every schema change is a new file under `supabase/migrations/`, never an edit to an existing applied migration.
- Migrations that touch RLS policies, `participants`, `registrations`, or anything GDPR/erasure-related (`scripts/redact-*`, `archive/`) require explicit human review before merge — do not self-approve.

## Before opening a PR

- [ ] `bun run test` passes
- [ ] `bun.lock` is staged if dependencies changed (no `package-lock.json` / other lockfiles)
- [ ] No secrets, `.env` values, or Supabase service-role keys in the diff
- [ ] New migrations are additive/reversible where possible
