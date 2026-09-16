# Session Log

Running record of what happened across working sessions on this project, in plain
language. Purpose: a new Claude Code session (or the user, returning after a gap)
should be able to read this file top to bottom and know exactly where things stand
without re-reading the whole codebase or being re-briefed.

**This file is a log, not a spec.** Locked design decisions live in
`docs/planning-notes.md`; the forward task list lives in `docs/plan.md`. This file
only records *what happened, when, and why* — session by session.

## How this file gets updated

- Add a new entry under **Session History** at the end of a working session, or
  right after completing a meaningful chunk of work within one.
- Newest entry goes at the **top** of Session History (reverse chronological).
- Update **Current Status** every time it changes — it should always reflect the
  present, not the entry that introduced it. Stale status is worse than no status.
- Keep entries short and factual: what changed, what was decided, what's left
  hanging. No narrative, no restating things already in `planning-notes.md` or
  `plan.md` — link to those instead of duplicating them.
- If a session ends with something unresolved (a bug not yet fixed, a decision not
  yet made, a command that failed), record it under **Open Items** so it isn't lost.
  Remove it from there once resolved.

## Current Status

Mid rebuild of the authorization core. Sem3 feature set (all 7 roadmap steps in
`planning-notes.md`) is complete and demoed; `feat/sem3-ui-pass` (the UI/UX pass
plus Phase 0 and Phase 1 of this rebuild) was reviewed and merged to `main` via
PR #13 on 2026-09-11. Working through an 8-phase plan (Phase 0-7, see the
2026-09-11 and 2026-09-12 entries below) to close the gap between what the
Access Matrix/audit log/RBAC *claim* to do and what they actually enforce.

- **Phase 0 (doc honesty + CI) — done, merged to `main`.**
- **Phase 1 (revocation) — done, merged to `main`.** `requireUserType` and
  `/dashboard` now read live status/userType/roleId from Postgres on every
  request instead of trusting the session JWT. Verified live in browser by
  the user: role change, disable, and delete all took effect immediately, no
  re-login.
- **Phase 2 (real enforcement) — done, on branch `feat/authz-enforcement`**
  (cut from the updated `main` after the PR #13 merge). `finance-app` now
  actually checks the Access Matrix instead of accepting any Keycloak session.
- Phases 3-7 not started.

## Open Items

- No manual browser click-through yet of Phase 2 (finance-app enforcement) —
  the PDP endpoint itself was smoke-tested directly against the live dev
  server and real seeded data (HR employee correctly denied `no_grant`,
  Engineering employee correctly `allow`, wrong secret 401s, unknown
  keycloakId `no_account` — all confirmed), but nobody has clicked through a
  real Keycloak sign-in to `localhost:3001` and watched a live revoke lock
  them out yet. `docs/demo-script.md` still needs a rewrite once that's
  confirmed (Phase 7 was always going to do this, but it's worth doing now
  that the claim is finally true rather than waiting).
- Admins/SuperAdmins are now denied access to `finance-app` (or any future
  gated app) entirely, same as `/dashboard` — they carry no Role, and the PDP
  reuses that exact rule. Deliberate, not a bug, but worth surfacing since
  nothing in `planning-notes.md`'s locked screens ever said an Admin
  shouldn't be able to open Finance App; it's a new implication of enforcing
  the existing model outside the portal, not something previously decided.
- `apps/finance-app` still has no test suite (by design, per `CLAUDE.md`), so
  `signIn`/`middleware.ts`'s wiring only has the shared `lib/authz-check.ts`
  logic proven indirectly via the portal-side route tests plus the live
  smoke test above — nothing exercises finance-app's own callback/middleware
  code directly.
- There is still no UI to actually disable a user (Phase 3 adds it) — Phase 1's
  disable check was exercised live by editing `status` directly in Postgres.
- `npx prisma` intermittently resolved a newer major version (8.0.0-rc.13, no
  `migrate` command under that name) instead of the pinned `^7.9.0` — hit this
  mid-session running the Phase 1 migration. Worked around by calling
  `./node_modules/.bin/prisma` directly instead of `npx prisma`; CI (`ci.yml`)
  does the same. Worth remembering if a `prisma` command behaves unexpectedly
  again — check which binary actually ran before assuming the schema/CLI is
  the problem.

## Session History

### 2026-09-12 — PR #13 merged; Phase 2 (real enforcement) built

`feat/sem3-ui-pass` (PR #13 — the whole UI/UX pass plus this rebuild's Phase 0
and Phase 1) was reviewed and merged to `main` by the user. Before starting
Phase 2, checked out `main`, pulled, and cut a fresh branch,
`feat/authz-enforcement`, rather than continuing on the now-merged branch.

User manually verified Phase 1 live in browser first, in three parts, each
confirmed working:
- **Role/access change** — Admin toggled a grant in the Access Matrix while
  the affected Employee's `/dashboard` was already open in another browser;
  refreshing (no re-login) showed the updated tiles immediately.
- **Delete** — deleted a signed-in user from another account; their open
  `/profile` tab then showed "Unable to load your profile" on refresh —
  confirmed this is the existing, correct fallback for a missing user row
  (`app/profile/page.tsx`), not a crash.
- **Disable** — flipped a signed-in user's `status` to `DISABLED` directly in
  Postgres (`docker exec ... psql`, hit real PowerShell quoting friction
  getting a `"User"` identifier through as a single-shot `-c` argument;
  landed on `docker exec -it ... psql` and pasting the SQL at the interactive
  prompt instead, which sidesteps the quoting problem entirely); their open
  `/dashboard` tab then correctly flipped to "No role assigned yet" on
  refresh.

Then built Phase 2 in full:

- **Portal** — new `app/api/authz/check/route.ts`, the policy decision point.
  Takes `{keycloakId, origin, trigger}`, authenticates the caller via a
  shared secret (`AUTHZ_SERVICE_SECRET`, `crypto.timingSafeEqual`, fails
  closed with 500 if unset rather than defaulting to allow), looks up the
  `Application` registered at `origin` (matched by URL, not the
  admin-editable display name), then the caller's live `status`/`userType`/
  `roleId`/`RoleAccess` — same rule `/dashboard` already uses, so
  Admins/SuperAdmins (no Role) are denied same as Employees with no grant.
  Widened `lib/audit.ts`'s `logAudit` to accept a `null` userId, for a denial
  where there's no matching portal account at all to attribute it to.
  16 new tests (99 total).
- **finance-app** — `auth.ts` gained `signIn`/`jwt`/`session` callbacks:
  `signIn` asks the portal once at login (`trigger: "signIn"`, so a denial
  there gets audit-logged on the portal side); `jwt`/`session` carry the
  Keycloak `keycloakId` into the session so later checks don't need the
  original OAuth profile. New `middleware.ts` re-asks on *every* request to
  `/` (`trigger: "revalidate"`, deliberately not audit-logged — every page
  view would flood the log for a state that hasn't changed) and redirects a
  now-denied session to a new `/access-denied` page. Shared fetch logic in
  new `lib/authz-check.ts`, fails closed on any network error. New
  `types/next-auth.d.ts` for the `keycloakId` session field, mirroring the
  portal's own module-augmentation pattern.
  - Hit the exact same Auth.js v5 typing gap the portal's `auth.config.ts`
    hit originally (`token` in the `session` callback doesn't pick up the
    `next-auth/jwt` augmentation, types as `{}`) — same fix, an explicit cast.
- Added `AUTHZ_SERVICE_SECRET` to both apps' `.env`/`.env.example`.
- Full gate green on both apps: portal (lint, `tsc --noEmit`, 99 tests,
  build), finance-app (lint, `tsc --noEmit`, build — no test suite, by
  design).
- Live smoke test of the PDP directly against the running dev server and
  real seeded data (curl, real `keycloakId`s pulled from Postgres): HR
  employee (no Finance grant) → `{allow:false, reason:"no_grant"}`;
  Engineering employee (has the grant) → `{allow:true, reason:"allow"}`;
  wrong secret → 401; unknown `keycloakId` → `no_account`. All correct.
  Also confirmed a stray second `npm run dev` accidentally started during
  this exited cleanly on its own (Next.js's own dev-server singleton lock)
  rather than actually binding port 3001 alongside finance-app.

Not yet done: an actual browser click-through of finance-app itself — sign in
as an Employee with the grant (expect straight through), one without (expect
`/access-denied` at first request), then revoke a live grant mid-session and
confirm the next page load locks them out without re-login. `demo-script.md`
also hasn't been rewritten yet to reflect that the Access Matrix claim is now
actually true — worth doing once the browser click-through above confirms it.

### 2026-09-11 — Full audit + 8-phase rebuild plan

Ran a full audit of the codebase against its own documentation (three parallel
explore passes: route/lib/auth inventory, docs/Keycloak/docker-compose inventory,
frontend/data-flow inventory). Verified findings directly against source rather
than trusting `planning-notes.md`'s claims.

**Core finding:** the system is well-built but doesn't enforce what it claims to.
The Access Matrix (`RoleAccess`) only decides which tiles render on
`/dashboard` — `apps/finance-app` has no authorization check at all, so any
Keycloak session in the realm can open it directly regardless of role. Session
tokens are never re-checked against Postgres after login, so deleting, demoting,
or reassigning a user's role has no effect until they re-login (up to Auth.js's
default 30-day session). `docs/demo-script.md` claimed server-side enforcement
that doesn't exist — corrected this session (see below).

Full findings (19 numbered issues, five structural) live in the plan file used to
scope this: `right-now-i-am-adaptive-riddle` (path is session-local, not part of
this repo — the actionable version is the phase list below and in `docs/plan.md`
once transcribed there).

**Decided, with the user:** a month+ of runway remains; the "locked" data model in
`planning-notes.md` §2 may be reopened where needed (e.g. adding a `Permission`
entity); priority is making existing claims true before adding features — MFA and
other Keycloak-config wins are explicitly deprioritized until enforcement exists.

**Build sequence agreed (Phase 0-7):**
0. Doc honesty + CI (this session, in progress)
1. Revocation — short session lifetime, DB-backed authorization checks instead of
   trusting the JWT, `User.status`/`tokenVersion`
2. Real enforcement — a policy-decision endpoint in the portal, `finance-app`
   calls it instead of trusting any Keycloak session
3. Joiner/mover/leaver — disable instead of delete, promote/demote, password
   reset trigger
4. Audit log that deserves the name — structured fields, real LOGIN/LOGOUT/
   ACCESS_DENIED events, pagination
5. Keycloak done properly — service-account client instead of master-admin
   password grant, realm hardening (password policy, brute-force, token
   lifespans)
6. Integrity + UI correctness — FKs matching the documented 409 behavior, fix the
   no-`catch` silent-failure bug in every manager's optimistic update
7. Presentation honesty — landing page's fabricated activity feed/stats, the
   `/sign-in` interstitial that added a click contradicting the locked
   single-login spec

**This session's actual edits (Phase 0, partial):**
- `docs/demo-script.md` — removed the false "enforced server-side" claim at the
  Access Matrix demo step and the "enforced on every API route" overclaim in the
  FAQ; added an honest "known gap" line; updated the "what's missing" answer to
  lead with the real gaps (cross-app enforcement, revocation) instead of jumping
  straight to SCIM.
- `docs/planning-notes.md` — corrected the stale `vite-tsconfig-paths` claim (the
  suite uses Vite 7's native `resolve.tsconfigPaths`, no such plugin is
  installed); flagged the test-count line as historical, not current — verified
  `npm test` reports **78 passing** as of this session, not the 67 quoted at the
  time of the original addendum.
- This file — populated from its empty template; adopted as the session-to-
  session continuity log for the rebuild (distinct from `planning-notes.md`'s
  per-feature build log and `plan.md`'s checklist).

Not yet done this session (at the point the entry above was written): the CI
workflow, and folding the three previously-unlogged UI-pass commits (`ba56ef9`,
`1c5c384`, `a50104a`) into `planning-notes.md`'s build log. Both were finished
before Phase 1 started (see below).

### 2026-09-11 (continued) — Phase 0 finished, Phase 1 (revocation) built

Closed out the rest of Phase 0: added `.github/workflows/ci.yml` (lint,
`tsc --noEmit`, test, build for both apps — `apps/portal`'s job runs
`prisma generate` first, since the generated client is gitignored with no
postinstall hook), and logged the three previously-unlogged UI-pass commits
into `planning-notes.md`'s "Post-roadmap: UI/UX pass, part 2" section,
including their honest caveats (fabricated landing-page data, the `/sign-in`
page vs. middleware inconsistency).

Then built Phase 1 (revocation) in full:

- `prisma/schema.prisma` — added `UserStatus` enum (`ACTIVE`/`DISABLED`) and
  `User.status`, plus the four missing indexes findings had flagged
  (`AuditLog.createdAt`, `AuditLog.userId`, `User.roleId`, `User.userType`) —
  bundled in since it was the same category of safe, additive schema change.
  Migration `20260911181800_add_user_status_and_indexes`, applied against the
  running dev Postgres container.
- `auth.ts` — `signIn` now also rejects a `DISABLED` user at login, not just a
  missing one.
- `lib/api-auth.ts` — `requireUserType` now re-reads the caller's
  userType/roleId/status from Postgres on every call (previously trusted the
  JWT's claims, which are only set at sign-in) and returns the session with
  those fields refreshed. A deleted user 401s (row gone = same as no session);
  a disabled or demoted-below-`allowed` user 403s, using the live value even
  if the token still claims otherwise.
- `app/dashboard/page.tsx` — reads `roleId` (and `status`) live from Postgres
  instead of `session.user.roleId`, closing the specific staleness bug the
  audit found: reassigning an Employee's role previously didn't show up on
  their dashboard until they re-logged in.
- Test suite: rewrote `lib/api-auth.test.ts` for the new behavior (401 on
  deleted caller, 403 on disabled caller even with a stale ADMIN token, live
  userType/roleId override demonstrated against a deliberately-stale token).
  This changed `requireUserType`'s internals, which broke every existing
  route test's Prisma mocking (they didn't expect `requireUserType` to touch
  `prisma.user` at all) — fixed by adding a shared `mockLiveCallerFromSession`
  helper (`test/helpers.ts`) that the 6 routes with no `user.findUnique` of
  their own now use in one line, and hand-wiring a `where`-shape dispatcher in
  the 2 routes (`users`, `users/[id]`) where the route's own logic *also*
  calls `prisma.user.findUnique` (duplicate-email check / target-user lookup)
  — those needed to tell "is this the live-status check or the route's own
  lookup" apart. Net: 78 → 83 tests, all passing.
- Hit a real tooling bug mid-session: `npx prisma migrate dev` silently
  resolved and installed `prisma@8.0.0-rc.13` (whose CLI has no `migrate`
  command — renamed) instead of the project's pinned `^7.9.0`, failing with a
  confusing "no command registered for `migrate`" error reported at **exit
  code 0** — easy to misread as success. `npx prisma generate` run moments
  earlier from the same shell had correctly used the local 7.10.0, so this
  wasn't a consistent/reproducible-on-demand failure. Fixed by calling
  `./node_modules/.bin/prisma` directly for both `generate` and
  `migrate dev`, and changed `ci.yml` to do the same rather than `npx prisma`.
- Full gate verified clean after every step: `npm run lint`, `npx tsc
  --noEmit`, `npm test` (83 passing), `npm run build` (all routes still
  render `ƒ Dynamic`).

Not verified this session: an actual browser click-through of disabling or
demoting a live, already-signed-in session and watching its next request get
rejected. The four scenarios (delete/disable/demote/role-change) are covered
by automated tests against `requireUserType` and `/dashboard` directly, which
is the real enforcement point, but nobody has watched it happen in Chrome yet.
There is also no admin-facing UI to actually flip a user's `status` yet —
that arrives with Phase 3 (joiner/mover/leaver).

Also noticed, not yet acted on: `next build` prints `⚠ The "middleware" file
convention is deprecated. Please use "proxy" instead.` — Next.js 16 renamed
`middleware.ts` to a `proxy.ts` convention. Everything in this project's
architecture section of `CLAUDE.md` centers on `middleware.ts` by name,
so this is worth a deliberate look (and doc update) at some point, not a
silent rename — filed here rather than done reflexively mid-Phase-1.

Next: Phase 2 (real enforcement — the policy-decision endpoint + finance-app's
`signIn` gate).
