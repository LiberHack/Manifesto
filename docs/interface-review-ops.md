# Interface review — /ops participant flow

Reviewed 2026-09-17 with the `interfaces` plugin's `better-interface` skill, framed as a UX
pass (companion to `docs/interface-review-frontend.md`, which covered the public site).

## Scope & recon

**Scope:** the core participant journey — `login.vue`, `register.vue`, `forgot-password.vue`,
`reset-password.vue`, `verify-email.vue`, `confirm.vue`, `register-edition.vue`, `dashboard.vue`,
`team/create.vue`, `teams/index.vue`, `teams/[id].vue`, `invite/[code].vue` — plus the shared
`SkillPicker` and `ManageRequests` components and the `auth` middleware. **Excluded:**
`ops/admin/*` (1,225 lines, low-traffic, staff-only surface) — worth its own pass if the admin
panel itself becomes a priority.

**Stack:** same Nuxt 4 / DaisyUI v5 base as the public site. Forms mix plain `reactive()` +
manual validation (login, register, dashboard) with `vee-validate` + Zod (`team/create.vue`,
`schemas/team.schema.ts`) — no established convention document for which to use where.

| Domain | Evidence inspected | Result |
|---|---|---|
| Accessibility | All 12 pages, `SkillPicker`, `ManageRequests`, action-feedback patterns, disclosure/reveal patterns, form error wiring | 6 findings |
| UI polish / usability flow | Clipboard-copy fallback, cross-tab email verification, unsaved-state handling, destructive-action consistency, full-team gating, async button states | 7 findings |
| Colors | Same theme tokens as the public-site review | Not re-flagged — see note below |
| Layout | Page/card/form structure across all 12 pages | Clear |
| Typography | Not reviewed in depth | Not reviewed |
| Writing | Copy tone, error message sourcing | 1 finding (LOW) |

## Findings

| Severity | Domain | Location | Before | After | Why |
|---|---|---|---|---|---|
| HIGH | Accessibility | `components/SkillPicker.vue:196-246` (used in `register.vue`, `register-edition.vue`, `team/create.vue`, `dashboard.vue`) | A fully custom autocomplete/combobox — text input + arrow-key nav + filtered `<ul>`/`<li>` — with zero ARIA: no `role="combobox"`, no `aria-expanded`/`aria-controls`/`aria-activedescendant` on the input, no `role="listbox"`/`role="option"`/`aria-selected` on the list. The keyboard-highlighted option is shown only via `bg-primary text-primary-content` (line 222-226). Each selected-skill removal button is labeled only `✕` (line 186-192) | Add the standard ARIA combobox wiring (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant` pointing at the highlighted `<li id>`; list gets `role="listbox"`, items `role="option" :aria-selected`); give each remove button `:aria-label="\`Remove ${skill}\`"` | This widget is the primary input on every registration and team-management form. A screen reader user gets a plain text box with no indication a list exists, no announcement of the highlighted item, and — with several skills selected — a set of identical "✕ button"s with no way to tell which skill each removes |
| HIGH | Accessibility | `pages/ops/reset-password.vue:14`, `pages/ops/confirm.vue` (whole file) | `error.value = "Invalid or expired reset link."` renders with no link elsewhere on the page; `confirm.vue` shows a static "Verifying…" with no timeout, error state, or retry if the Supabase code exchange never resolves | Add a "Request a new link" `NuxtLink` to `/ops/forgot-password` next to the reset-password error; give `confirm.vue` a timeout (e.g. 10s) that surfaces "This link didn't work — try signing in again" with a link to `/ops/login` | Both are dead ends: the only way out is the browser back button or manually typing a URL |
| HIGH | Accessibility | `pages/ops/dashboard.vue` (profile save, team save, repo save, invite copy/rotate, leave-team — 5 spots), `pages/ops/teams/[id].vue:94-100` | Action feedback ("Saved!", "Copied!", "Link rotated.", "Request sent!") is a plain conditionally-rendered `<div>`/`<p>`, not a live region; `role="alert"` is present on some (`teams/[id].vue` error alerts) but absent on others (all of dashboard's success/status text) | Give every one of these feedback elements `aria-live="polite"` (or `role="status"` for success, `role="alert"` for errors) consistently | This is the app's core interaction loop — save a field, copy a link, send a join request — and a screen reader user is told nothing happened, success or failure, unless they go hunting for the text afterward |

| MEDIUM | Accessibility | `pages/ops/team/create.vue:75-77,84-86,99-103` | Field errors (`errors.name`, `skillsError`, `errors.description`) render as a sibling `<span>` with no `id`, and the input has no `aria-invalid`/`aria-describedby` pointing at it | Give each error span an `id`, wire `:aria-describedby="errors.name ? 'name-error' : undefined"` and `:aria-invalid="!!errors.name"` on the input | The error is visible to sighted users next to the field but never announced or associated for screen reader users tabbing through the form |
| MEDIUM | Accessibility | `pages/ops/dashboard.vue:259-292` (`showLeaveConfirm`) | Clicking "Leave Team" reveals a confirmation block below; the trigger button has no `aria-expanded`, and focus stays on the button instead of moving into the new content | Add `:aria-expanded="showLeaveConfirm"` to the trigger; move focus to the confirmation panel (or its heading) when it appears | Keyboard/screen-reader users aren't told new content appeared or where to find it |
| MEDIUM | Accessibility | `pages/ops/teams/index.vue:58-63` | `<input placeholder="Search by team name…">` with no associated `<label>` | Wrap in a `<label>` with visually-hidden text ("Search teams") or add `aria-label` | Placeholder-as-label is a known anti-pattern — it disappears the moment the user types, and isn't a reliable accessible name across all assistive tech |
| MEDIUM | UI | `pages/ops/dashboard.vue:150-155` (`copyInviteLink`) | On `navigator.clipboard` failure, `inviteCopyMessage` silently becomes the raw invite URL, styled identically to the "Copied!" success message | On failure, prefix it clearly: `"Couldn't copy — here's the link:"` before the URL, and consider a manual `<input readonly>` the user can select | A user who doesn't read closely will think the link copied when it didn't — the fallback looks exactly like success |

| LOW | Writing | `pages/ops/login.vue:27`, `pages/ops/reset-password.vue:24`, `SkillPicker.vue:119` | Raw Supabase/GoTrue `error.message` / API error text passed straight to the UI | Map known error strings to the site's own voice (the way `register.vue:65-76` already does for `registration_closed`/`too_many_skills`) | Inconsistent tone against the rest of the punk-styled copy, and occasionally surfaces backend-internal wording |

## Usability / interaction-flow findings

The first pass above leaned almost entirely on accessibility mechanics. This section is a
second, dedicated pass over the same 12 files for general usability friction — unclear states,
silent failure modes, inconsistent interaction patterns — independent of assistive tech.

| Severity | Domain | Location | Before | After | Why |
|---|---|---|---|---|---|
| HIGH | UI | `pages/ops/verify-email.vue` (whole file) | Copy tells the user to click the emailed link "then proceed in the new window." Most mail clients open links in a new tab, so the original `verify-email.vue` tab is left running its `onAuthStateChange`/`watch(user)` listener — which only fires for auth events in *that same* browser context and never sees a different-tab confirmation | Either redirect the original tab via `localStorage`/`BroadcastChannel` when the other tab confirms, or change the copy to "you can close this tab and continue in the new one" so the stale tab's silence is expected rather than alarming | The code visibly tries to auto-detect confirmation and continue, but the one instruction it gives the user (open the link in a new window) is exactly the case where that detection can't work — the user is left staring at "Check your email" indefinitely with no sign anything happened |
| MEDIUM | UI | `pages/ops/dashboard.vue` — Profile, Edit Team, and Project Repo sections each have their own "Save" button and no dirty-state tracking | Editing a field in any of the three sections and then clicking `Teams`, `Logout`, or navigating away discards the change with zero warning | Add a shared `isDirty` flag per section (or one page-level one) and a `beforeunload`/route-leave guard prompting to save | Three independent, easy-to-miss save buttons on one page is already a recipe for lost edits; nothing tells the user they have unsaved changes before they navigate away |
| MEDIUM | UI | `pages/ops/dashboard.vue:160-172` (`rotateInviteLink`) vs. `:259-292` (`showLeaveConfirm`) | Rotating the invite link — which silently breaks every copy of the link already shared with teammates or applicants — fires on a single unconfirmed click; leaving a team, a lower-stakes and fully reversible action, gets an explicit "Are you sure?" panel | Give `rotateInviteLink` the same inline-confirm treatment as "Leave Team" | Inconsistent weighting: the action with the bigger blast radius (anyone holding the old link is now locked out) has the *lighter* safeguard |
| MEDIUM | UI | `pages/ops/teams/index.vue` (card grid) and `pages/ops/teams/[id].vue:102-109` | Team cards and the team detail page show "`n`/6 members" as plain text, but a full (6/6) team's "Request to Join" button stays enabled exactly like an open team's — the user only learns it's full from whatever error string the server happens to return after submitting | Disable/relabel "Request to Join" when `members.length >= 6`, and visually mark full cards in the list (e.g. a "Full" badge) | Preventable failed action — the fullness data is already being fetched and rendered, just not used to gate the CTA |
| LOW | UI | `components/ManageRequests.vue:11-14,32-33` | `Accept`/`Reject` buttons have no `:disabled`/loading state while the `PATCH` is in flight | Add a `pending` ref per request (or disable both buttons for the row) mirroring the `"Saving…"` pattern used everywhere else in the app | Every other async action in the app (register, dashboard saves, invite join) shows a busy label and disables itself; this is the one place a double-click can fire two overlapping accept/reject calls |
| LOW | UI | `pages/ops/team/create.vue:43` | On success, `router.push("/ops/dashboard")` with no acknowledgment on arrival | Carry a one-line "Team created" flash (query param + a small banner, or a toast) into the dashboard | The user has to notice the "Your Team" section now exists to infer the create succeeded — no explicit confirmation of the thing they just did |
| MEDIUM | Layout | `pages/ops/dashboard.vue` (whole template, ~7 sections) | Profile, Your Team, Edit Team, Pending Requests, Invite Link, Project Repo, No Team, and Admin all sit inside one flat `border-primary border-2` box, separated only by `gap-8` whitespace; every `<h2>` is identically `text-xl font-bold` regardless of section importance; primary actions ("Save Profile/Team/Repo") are styled `btn-outline`, the same weight as pure navigation (`> Teams`); the whole page is one `max-w-2xl` column | Split into distinct bordered panels matching the card idiom already used elsewhere (`teams/index.vue`'s `card` pattern, FAQ's bordered `<li>`s); differentiate heading weight for the primary section (Your Team) vs. utility sections (Project Repo, Invite Link); make each section's Save button visually primary; separate Logout from the Teams nav button; let related sections sit side-by-side on wider viewports instead of one long vertical stack | The dashboard is the most-visited page in the flow and the only one that doesn't reuse the app's established bordered-card language — nothing visually marks where one section ends and the next begins, so 7 distinct panels read as one long list |

## Note on Colors

The public-site review already flagged `--color-primary` / `--color-primary-content` in
`public/tailwind.css:24-25` at **3.64:1** contrast — below WCAG AA for normal text. Every
`btn-primary` submit button across this flow (login, register, register-edition, team/create,
invite accept) uses that same pair. Not re-listed as a separate finding since it's one shared
token — fixing it in `tailwind.css` fixes both surfaces at once.

## Verification

- Read all 12 in-scope page files plus `SkillPicker.vue`, `ManageRequests.vue`, and
  `middleware/auth.ts` in full.
- Diffed `role="alert"` usage across every alert/message element in the flow — confirmed
  inconsistent application (present on most form errors, absent on all dashboard success/status
  text and one `teams/[id].vue` success message).
- Confirmed via source that `SkillPicker.vue` has no `role`/`aria-*` attributes anywhere
  (`grep -n "role=\|aria-" components/SkillPicker.vue` → no matches).
- **Not verified:** actual screen reader behavior at runtime (NVDA/VoiceOver), and whether
  Supabase's own hosted error strings vary by locale (would affect the Writing finding's scope).

## Verdict

**Block** — 4 HIGH findings remain across both passes: the ARIA-free `SkillPicker` combobox (the
primary input across every registration/team form), two auth-flow dead ends with no recovery
path, unannounced action feedback across the dashboard's core save/copy/join interactions, and
the email-verification tab that goes silent forever when the confirmation happens in the "new
window" the app's own copy tells the user to open.
