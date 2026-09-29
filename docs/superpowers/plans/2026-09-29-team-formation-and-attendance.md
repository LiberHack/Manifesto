# Team formation and attendance: three-phase delivery plan

Date: 2026-09-29

Status: planning only. This document defines three independently usable releases; it does not implement features or apply migrations. Detailed field names and notification transport choices remain implementation decisions. All future implementation follows AGENTS.md and CONTRIBUTING.md.

## Goal and evidence

Increase the number of registered participants who arrive and participate by helping them form real team connections and making organizer communication reliable.

The organizer-provided first-edition workbook, reconciled with its participant report, gives this baseline (organizers excluded):

| Cohort | Registered | Checked in | Attendance |
| --- | ---: | ---: | ---: |
| All participants | 64 | 41 | 64.1% |
| Assigned to a team in the final roster | 53 | 41 | 77.4% |
| No team in the final roster | 11 | 0 | 0% |

There were 17 teams. Three entire teams, totaling eight registrants, did not attend. The previously discussed 91.1% is 41/45: attendance among members of teams where at least one person attended, excluding those eight registrants. It is not the overall attendance rate for team-assigned participants.

All 11 solo registrants had recognized skills: five beginners, four intermediate, and two experienced. Matching must support all experience levels. The final roster cannot establish when a connection formed or prove that assigning a team causes attendance. Measure formation timing and source in the next edition.

Only aggregate findings belong in this repository. Do not commit the supplied participant files, names, emails, handles, or individual application/chat content.

## Existing foundation

- `participants` is the durable identity; `registrations` holds edition-specific skills, experience, membership, and preferences.
- `teams.leader_id` references a registration, not a participant/account ID. Scope all team operations to the edition.
- Teams already have `skills_wanted`, a description, invite links, and a six-member capacity limit.
- Join requests currently support pending/approved/rejected states and email notifications.
- Team browsing currently sorts newest first and offers skill filtering. It has no recommendation ranking or explicit recruiting status.
- `registrations.public` controls archive visibility; it must not become matchmaking consent.
- `server/api/me/profile.patch.ts` does not currently allow skill edits.
- `scripts/send-event-reminder.ts` targets leaders, uses the former leader/account relationship, and lacks edition filtering. Repair it before reuse; do not execute it as part of development.

## Phase 1: useful profiles and recruitment

Outcome: a solo participant can present themselves, a leader can make an informed decision, and organizers have a usable contact channel. Existing browsing and applications remain usable without recommendations or chat.

### Participant and team profiles

- Add edition-specific matching status: looking for a team, arranging a team with friends, or no help needed. Existing participants must explicitly opt in; do not infer discovery consent from archive visibility.
- Add a short reusable introduction, preferred contribution roles (including flexible/still learning), up to three challenge interests including undecided, and goals such as learning, meeting people, and competing.
- Make skills editable and normalize case and common aliases without discarding the original input. Keep free-text additions supported. Use the supplied normalized taxonomy as design input, not a reason to import historical personal records.
- Add optional GitHub, GitLab, Codeberg, and portfolio links, including self-hosted GitLab. Validate HTTP(S) URLs; do not fetch arbitrary URLs server-side or require public code. Do not rank people by stars, contributions, or account age.
- Teams declare recruitment open/closed, wanted roles, desired size (up to six), interests/goals, and willingness to welcome or mentor beginners. Derive vacancies from desired size and actual membership rather than keeping an independent count that can drift.
- Optional working languages can express a real compatibility requirement; do not add unnecessary mandatory signup fields.

### Direct contact

- Require one preferred direct-contact method and its number/handle during edition onboarding, with an explicit email-only exception. Existing users receive a completion prompt, not an unexplained lockout.
- Offer channels the organizers can monitor: phone/SMS, Viber, Instagram, Telegram, Signal, Session, and Other. Email remains the account and fallback channel.
- Record reachability confirmation separately from merely saving a value. Initially this can be an organizer-recorded welcome acknowledgment; it is not identity verification.
- Keep contact values organizer-only by default. Sharing with accepted teammates is a separate choice. Do not include these fields in sponsor exports by default.
- Use a separate access-controlled contact record linked to the registration so ordinary profile responses cannot accidentally expose it. Do not promise automated delivery to every messenger.

### Applications and invitations

- Require a short message on each new application and leader invitation, initially 20–500 characters after trimming. Prompt for what the person would like to contribute and why the team interests them; a beginner introduction is sufficient.
- Offer the profile introduction as editable prefill. Preserve the submitted message on that request rather than changing it when the profile changes. Existing requests remain readable without retroactive message requirements.
- Show leaders the applicant's name, introduction, skills, experience, preferred roles, interests/goals, optional profile links, and request message. Never include dietary or private contact details.
- Add targeted leader invitations with explicit participant acceptance. Both directions use the same atomic membership rules: same edition, still eligible, capacity available, and not already in another team. Generic invite links remain a distinct flow.
- Support withdrawal, decision timestamps, expiry, and distinct reasons for automatic closure. Joining another team should be distinguishable from a leader rejecting someone.
- Record membership events and formation source from this phase onward: direct invite, manual application, later recommendation, or organizer introduction. This avoids losing measurement history while later phases are built.

### Completion checks

- A beginner without a code-hosting profile can complete onboarding and apply.
- A leader can review a rich application and send a targeted invitation; the recipient can accept or decline.
- Private contacts are absent from discovery, team views, sponsor exports, logs, and unauthorized API responses.
- Existing requests and invite links still work; old users can complete new preferences progressively.
- Simultaneous approvals cannot overfill a team or place one registration in multiple teams.

## Phase 2: recommendations and on-platform conversations

Depends on phase 1. Outcome: suitable participants and teams discover each other, discuss fit, and communicate immediately after joining.

### Recommendations

- Show three suggested teams to a solo participant and three to five candidates to a recruiting leader, alongside ordinary browsing and a request for organizer help.
- Filter by edition, explicit discovery/recruiting choices, vacant places, membership, blocks, dismissals, and declared hard requirements. Recheck at acceptance; a recommendation never reserves a place.
- Begin with deterministic scoring: contribution/skills fit 45%, shared interests 25%, compatible goals 20%, and experience/mentoring compatibility 10%. These are starting hypotheses, not measured optimal weights.
- Normalize over available optional signals; missing information is unknown rather than a penalty. Explain the available evidence instead of presenting a compatibility percentage as certainty.
- Prefer explicit team needs over inferred gaps. Experience is a compatibility signal, not a ranking of people. Rotate similarly suitable candidates so the same profiles do not receive every invitation.
- Normalize skill aliases; do not infer personal traits or score private contact information. Show useful reasons such as a wanted role and a shared challenge interest.
- Refresh suggestions after membership or preference changes. Record recommendation exposure and subsequent request source without logging private message text.
- Provide an organizer queue for unmatched people and assisted formation of new teams when existing vacancies are insufficient. Every proposed member must accept; no silent assignment.

### Conversations

- Each application/invitation has a conversation between the applicant and the current authorized team leader; the required introduction is its first message. Transfer leader access when leadership changes and revoke the former leader's privileged access.
- Every team has a conversation. Accepted members gain access automatically and receive an introduction prompt. New members can read prior team history, with this behavior clearly disclosed. Departing members lose access.
- Resolve application conversations into read-only history for authorized parties; a person who joined elsewhere or lost leadership must not retain access merely because an old request exists. Define the exact history access policy before implementation.
- First release: text, safe links, pagination, unread counts/read position, report/block controls, and controlled organizer review of reported conversations. No arbitrary direct messages, attachments, voice, reactions, or end-to-end encryption claims.
- Store durable messages and membership authorization in Supabase. Select polling or authenticated realtime delivery during technical design; enforce authorization on every read, send, and subscription, including membership revocation. Never expose service-role credentials to clients.
- Add per-user send limits and bounded message lengths. Render messages as text; sanitize any supported formatting. Blocked users cannot create further application contact; provide organizer help for conflict inside an existing team.
- Use durable notification jobs with deduplication, retries, delivery status, and batched unread email reminders. Suppress reminders after messages are read. External messenger automation is deferred; organizer contact remains available.
- Define retention, reporting access, edition-closure behavior, and deletion integration before enabling chat. Any change to existing archival/erasure paths requires the repository's explicit human review. Do not make chats publicly visible through archives.

### Completion checks

- Both recommendation directions explain their suggestions and handle empty/sparse profiles.
- Full, closed, declined, blocked, or otherwise ineligible matches do not keep resurfacing.
- A user can ask a question before joining and enter team chat immediately after acceptance without another social account.
- Cross-edition access, nonmember reads, former-member subscriptions, and unauthorized report access are denied.
- New leaders receive the access they need; unread state and notification retries do not produce duplicate spam.
- An unmatched participant has a clear organizer-assisted alternative.

## Phase 3: attendance confirmation and organizer follow-up

Depends on phase 1; phase 2 enriches the follow-up context. Outcome: organizers know who plans to attend, can help uncertain participants, and can measure actual attendance. If the event is near, this phase can ship before phase 2 is complete.

### Attendance and capacity

- Add individual confirmation: coming, unsure, or cannot come, plus timestamp. No response remains distinct. Confirmation is not check-in, and a leader cannot confirm all teammates implicitly.
- Add optional private attendance barriers: transport, equipment, timing, team concerns, or another reason. Use these for assistance, never match penalties.
- Support cancellation and an explicit waitlist with expiring seat offers. Preserve registration history. Define accepted/offered/waitlisted/cancelled states separately from attendance intentions, and update the existing registration-row capacity trigger accordingly.
- Allocate/release seats transactionally and prevent concurrent overbooking. State clearly when a seat will expire; do not silently cancel someone for missing a reminder.
- Add authorized individual check-in with timestamp and an audited correction path. Keep reconfirmation and actual attendance separate.

### Communication and operations

- Repair the reminder workflow to contact each relevant participant in the selected edition using the registration-to-identity relationship. Include solo participants.
- Reuse phase 2's notification jobs if available; otherwise introduce that durable delivery foundation here. Manual preferred-channel follow-up must record outcome without assuming an external message was delivered.
- On registration: welcome and a clear next step. One to two weeks before: facilitated team mixer and help for unmatched people. Around one week before: individual reconfirmation. Shortly before: arrival directions, schedule, food, equipment expectations, and relevant permission requirements.
- Remind leaders about unanswered applications after roughly 48 hours; let applicants withdraw or pursue alternatives. Make timing configurable per edition.
- Give organizers queues for unmatched participants, unanswered requests, uncertain/unconfirmed attendees, contact failures, and entirely unconfirmed teams. Record outreach status and owner to avoid duplicate contact.
- Provide a named arrival host and a scheduled team-formation slot for people arriving alone. Arrange pre-event introductions, not advance project development.

### Measurement and completion checks

- Track registered, opted into matching, contacted, joined, reconfirmed, checked in, and cancelled as distinct events/states.
- Report actual attendee count and check-ins divided by valid registrations, with a documented denominator. Show cancellations separately; do not improve the rate by deleting no-shows from history.
- Compare pre-existing teams, platform-formed teams, organizer-formed teams, and solo participants. Snapshot membership at fixed pre-event cutoffs and retain formation timestamps; final rosters alone are insufficient.
- Report whole-team cancellations, time to response, unanswered requests, and solo-to-team conversion. Treat observational improvements as association unless an evaluation supports a causal claim.
- Test individual confirmation, edition-specific reminders, deduplication, cancellation/waitlist seat races, check-in permissions, and metric reconciliation against fixtures.

## Delivery order and verification

Ship phase 1 first, phase 2 second, phase 3 third; phase 3 can move ahead of phase 2 when attendance operations are more urgent. Each phase may contain several focused implementation PRs rather than one large change.

For every implementation release, add new migrations instead of editing merged ones; follow existing edition gates and server-side authorization. Review sensitive schema/RLS changes with a human. Run `bun run test`, and `bun run test:db` for migration behavior, plus the relevant acceptance checks above. Exercise mobile onboarding, application review, and chat unread behavior where applicable.

Deferred beyond these phases: machine-learning ranking, automatic forced team allocation, Git-host activity scoring, automated integrations with every messenger, rich media chat, voice/video, arbitrary direct messaging, and public chat archives.
