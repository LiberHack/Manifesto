# Interface review — public frontend

Reviewed 2026-09-17 with the `interfaces` plugin's `better-interface` skill. Goal: keep the
edgy/unpolished punk vibe, fix UX and accessibility gaps.

## Scope & recon

**Scope:** `app/layouts/default.vue`, `app/pages/index.vue`, `programme.vue`, `order.vue`,
`reglament.vue`, and shared components (`AppBanners`, `FAQ`, `Footer`, `RegisterNow`,
`ViewProgramme`, `ScanlineShader`, `PendingRequestsBanner`), plus the theme tokens in
`public/tailwind.css`. Excluded: the authenticated `/ops/*` flow — reviewed separately (see
`docs/interface-review-ops.md`).

**Stack:** Nuxt 4 / Vue 3 `<script setup>`, Tailwind CSS v4 + DaisyUI v5 (custom `liberhacklight`
dark theme, all radii zeroed for the brutalist look — that's a deliberate, correct choice, not a
finding). No Storybook/design-system doc found. `CLAUDE.md` documents the intended aesthetic
("raw, rebellious... deliberately rough around the edges") — read as license to keep the glitch
effects, leetspeak, and misaligned grids, but not license to skip accessible names, focus
semantics, or contrast.

| Domain | Evidence inspected | Result |
|---|---|---|
| Accessibility | Nav/social links, FAQ accordion, images, headings across 5 pages, motion sources, hover-glitch buttons | 8 findings |
| Layout | Nav structure, button/link nesting | 1 finding (shared with Accessibility) |
| Colors | `tailwind.css` OKLCH theme tokens, computed WCAG contrast for all pairs | 1 finding |
| Typography | Font stacks, scale, text-shadow utilities | Clear — no issues found |
| Writing | Bulgarian copy in FAQ/reglament, English nav labels | Clear — tone matches intended voice |
| UI polish | Zero-radius theme, borders, DaisyUI defaults | Not reviewed in depth beyond what surfaced under Accessibility/Colors |

## Findings

| Severity | Domain | Location | Before | After | Why |
|---|---|---|---|---|---|
| HIGH | Accessibility | `app/layouts/default.vue:81-100` | Instagram/Discord nav links: `<p class="hidden md:block">Instagram</p><Icon .../>` — label is `display:none` below `md` | Add `aria-label="Instagram"` / `aria-label="Discord"` on the `<a>` itself (or `sr-only` instead of `hidden`) | `hidden` removes the label from the accessibility tree too, not just visually — below 768px these links have no accessible name at all |
| HIGH | Accessibility | `ScanlineShader.vue` (whole file), `pages/index.vue:188-220` `.animate-wiggle`, `PendingRequestsBanner.vue:15` `.animate-snap-color` | Three infinite/continuous animations, no `prefers-reduced-motion` check anywhere in the repo | Wrap the `requestAnimationFrame` loop and the two keyframe animations in `@media (prefers-reduced-motion: reduce)` | Continuous full-viewport shader + glitch jerks + color-snap loop can trigger vestibular symptoms; nothing respects the OS-level opt-out |
| HIGH | Accessibility | `app/layouts/default.vue:29-75` | Active nav item marked only by `:class="{'btn-active btn-primary': route.path === ...}"` | Add `:aria-current="route.path === '/' ? 'page' : undefined"` (etc.) | Current-page state is carried by color alone |
| HIGH | Colors | `public/tailwind.css:24-25` (`--color-primary` / `--color-primary-content`) | `primary-content` (white) on `primary` (magenta) computes to **3.64:1** contrast (verified via OKLCH→sRGB→WCAG luminance) | Darken `--color-primary-content` toward black, or adjust `--color-primary` until the pair clears 4.5:1 | Fails WCAG AA for normal text; mobile nav pills render at `text-xs` |
| MEDIUM | Accessibility | `app/pages/index.vue` (entire template) | Every heading-sized string is a `<p>`/`<span>` — zero `<h1>`–`<h6>` elements | Promote hero line to `<h1>`, section titles to `<h2>` | Screen reader users navigate by heading; the main landing page has none |
| MEDIUM | Accessibility | `app/components/Footer.vue:33` (rendered via `index.vue` and `reglament.vue`) | `<h1 class="text-3xl w-full">Social</h1>` inside footer | Change to `<h2>` | On `reglament.vue` this produces two `<h1>`s on one page; on `index.vue` it mislabels the page's only `<h1>` as "Social" |
| MEDIUM | Accessibility | `pages/index.vue:8,47,57,173`, `components/Footer.vue:12` | 5× `<NuxtImg>` with no `alt` | Add descriptive `alt` (or `alt=""` for purely decorative art) | Content images carry zero information for screen reader/no-image users |
| MEDIUM | Accessibility | `RegisterNow.vue:6`, `ViewProgramme.vue:8` | `<p v-for="i in 5">{{ displayText }}</p>` renders the button label 5× stacked | `aria-hidden="true"` on the 4 decorative repeats, keep one real/visually-hidden label | Screen readers announce "register now" five times for one button |
| MEDIUM | Layout | `RegisterNow.vue:2-9`, `ViewProgramme.vue:2-11` | `<NuxtLink>` (no `to` in RegisterNow) wrapping a `<button>` that does the actual navigation | Drop the wrapping `NuxtLink`; make the `<button>` the interactive element | Nested interactive elements are invalid HTML; RegisterNow's outer link has no destination |
| MEDIUM | Accessibility | `FAQ.vue` — all 15 `<li tabindex="0">` accordion items | DaisyUI's focus-based `collapse-arrow` with no `role`/`aria-expanded` | Add `role="button" :aria-expanded="..."`, or switch to the checkbox/details-based collapse variant | Screen reader users get plain list text with no indication these are expandable disclosures |

## Verification

- Computed WCAG contrast ratios for every theme color pair by converting the OKLCH tokens to
  linear sRGB and applying the WCAG relative-luminance formula — confirmed `primary-content`/
  `primary` = 3.64:1, all other pairs pass (`base-content`/`base-100` = 18.26:1, `warning`/
  `base-100` = 10.23:1, etc.).
- `grep -rn "prefers-reduced-motion"` across `app/` — zero matches.
- `grep -n "aria-current|role=\"button\"|aria-expanded"` across `app/` — zero matches.
- `grep -n "NuxtImg\|alt="` — confirmed no `alt` attributes on any of the 5 image usages.
- **Not verified:** actual rendered focus-ring visibility, and whether `FAQ.vue`'s
  `collapse-content` is reachable by AT when unfocused (depends on DaisyUI's generated CSS).

## Verdict

**Block** — 4 HIGH findings remain (two are literal escalation triggers: no-accessible-name
links, current-page state by color alone; one is the reduced-motion trigger; one is a failing
contrast ratio).
