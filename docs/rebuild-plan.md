# Authorization Rebuild — Phase Tracker

Single source of truth for the 8-phase rebuild's status. `docs/plan.md` links here
instead of duplicating this list — update it here, not there. Background and the
original findings that triggered this: `docs/session-log.md`, 2026-09-11 entry.

**Why this exists:** an audit found the system's RBAC/audit story doesn't hold up
under a direct probe — the Access Matrix only decided what *rendered* on
`/dashboard`, `apps/finance-app` had no authorization check at all, and sessions
were never re-checked against Postgres after login, so deleting, demoting, or
reassigning a user had no effect until they re-logged in. The goal of this rebuild
is making the system's existing claims true, not adding features — MFA, session
visibility, and the approval-workflow idea are all real but deliberately
deprioritized until the gate they'd sit behind actually gates something (see
`docs/plan.md`'s "Next candidates" section).

**Ground rule for this file:** a phase is only ✅ once it's been proven — automated
tests passing plus a real, working browser click-through of the thing it claims to
fix. "Built and gate-verified" (lint/typecheck/build/tests green) is not the same
as "done" — say so explicitly when a phase is in that state, the way Phase 2 is
below.

## Status

| Phase | What | Status |
|---|---|---|
| 0 | Doc honesty + CI | ✅ Done, merged to `main` (PR #13) |
| 1 | Revocation | ✅ Done, merged to `main` (PR #13), verified live in browser |
| 2 | Real enforcement | ✅ Done, verified live in browser. The 404 was dev-server port drift, now fixed |
| 3 | Joiner / mover / leaver | ✅ Done, verified live in browser |
| 4 | Audit log that deserves the name | ✅ Done, verified live in browser (structured fields, new events, pagination, atomic audit writes, hardened CSV export) |
| 5 | Keycloak done properly | ⬜ Not started |
| 6 | Integrity + UI correctness | ⬜ Not started |
| 7 | Presentation honesty | ⬜ Not started |

---

## Phase 0 — Doc honesty + CI ✅

**Branch:** `feat/sem3-ui-pass` → merged to `main` (PR #13).

- Removed the false "Access Matrix enforced server-side, not just hidden in the
  UI" claim from `docs/demo-script.md`'s Access Matrix demo step and FAQ.
- Reconciled doc drift: stale test count, a `vite-tsconfig-paths` plugin
  `planning-notes.md` claimed was in use but isn't (Vite 7's native
  `resolve.tsconfigPaths` is), three previously-unlogged UI-pass commits folded
  into `planning-notes.md`'s build log.
- Added `.github/workflows/ci.yml` — lint, `tsc --noEmit`, test, build for both
  apps on every push. Uses `./node_modules/.bin/prisma generate`, not
  `npx prisma` (see Phase 1's tooling note below for why).

## Phase 1 — Revocation ✅

**Branch:** `feat/sem3-ui-pass` → merged to `main` (PR #13).

The core bug: `lib/api-auth.ts`'s `requireUserType` trusted the session JWT's
`userType`/`roleId`, which is only refreshed at sign-in (default session lifetime
30 days) — so deleting, disabling, or demoting a user, or reassigning an
Employee's role, had no effect until their next login.

- Added `User.status` (`ACTIVE`/`DISABLED`) to `prisma/schema.prisma`, plus the
  4 missing indexes an earlier audit finding had flagged (`AuditLog.createdAt`,
  `AuditLog.userId`, `User.roleId`, `User.userType`). Migration
  `20260911181800_add_user_status_and_indexes`.
- `requireUserType` now re-reads `userType`/`roleId`/`status` from Postgres on
  every call (one indexed lookup, negligible at this scale) instead of trusting
  the token. Deleted user → 401. Disabled or demoted-below-`allowed` → 403, even
  if the token still claims otherwise.
- `auth.ts`'s `signIn` also rejects a disabled user at login.
- `app/dashboard/page.tsx` reads `roleId`/`status` live from Postgres instead of
  `session.user.roleId` — this was the specific bug: reassigning an Employee's
  role previously didn't show up on their dashboard until they re-logged in.
- Deliberately skipped `tokenVersion` and shortening `session.maxAge` — the
  direct-DB-read approach makes both redundant.
- Test suite: rewrote `lib/api-auth.test.ts`; had to fix every other route
  test's Prisma mocking too, since `requireUserType` now touches
  `prisma.user.findUnique` (added a shared `mockLiveCallerFromSession` helper in
  `test/helpers.ts`, plus a `where`-shape dispatcher in the two routes whose own
  logic also calls `prisma.user.findUnique`). 78 → 83 tests.
- **Verified live in browser by the user, three ways, all confirmed:**
  role/access change reflected on dashboard refresh with no re-login; deleting a
  signed-in user made their `/profile` show the existing "Unable to load your
  profile" fallback (not a crash — confirmed this is correct pre-existing
  handling for a missing user row); disabling a signed-in user's `status`
  directly in Postgres flipped their dashboard to "No role assigned yet" on
  refresh.
- **Tooling gotcha:** `npx prisma migrate dev` silently resolved and installed
  `prisma@8.0.0-rc.13` (whose CLI renamed `migrate`) instead of the pinned
  `^7.9.0`, failing with a confusing error at **exit code 0** — easy to misread
  as success. Fixed by calling `./node_modules/.bin/prisma` directly; CI does
  the same.

## Phase 2 — Real enforcement ✅

**Branch:** `feat/authz-enforcement` (cut from `main` after the Phase 0/1 PR
merged).

The core bug: `apps/finance-app` had no authorization check of any kind — any
valid Keycloak session in the `iam-portal` realm could open it, regardless of
Role or grant.

**What shipped:**

- **Portal** — new `POST /api/authz/check` (`app/api/authz/check/route.ts`), the
  policy decision point. Takes `{keycloakId, origin, trigger}`. Authenticates the
  caller with a shared secret (`AUTHZ_SERVICE_SECRET`, `crypto.timingSafeEqual`,
  fails closed with 500 if the secret isn't configured rather than defaulting to
  allow). Looks up the `Application` registered at `origin` (matched by URL, not
  the admin-editable display name), then the caller's live
  `status`/`userType`/`roleId`/`RoleAccess`. Only an `ACTIVE` `EMPLOYEE` with a
  granted Role passes — Admins/SuperAdmins are denied by the same rule that
  already governs `/dashboard` (they carry no Role). Returns
  `{allow, reason}`, reason one of `no_account` / `disabled` /
  `wrong_user_type` / `no_role` / `no_grant` / `unknown_application` / `allow`.
  Widened `lib/audit.ts`'s `logAudit` to accept a `null` userId, for a denial
  where there's no matching portal account to attribute it to.
- **finance-app** — `auth.ts` gained `signIn`/`jwt`/`session` callbacks:
  `signIn` asks the portal once at login (`trigger: "signIn"` — a denial there
  is audit-logged on the portal side, since finance-app has no DB of its own to
  log to); `jwt`/`session` carry the Keycloak `keycloakId` into the session.
  New `middleware.ts` re-asks on *every* request to `/` (`trigger: "revalidate"`
  — deliberately not audit-logged, since every page view would flood the log
  for a state that hasn't changed) and redirects a now-denied session to a new
  `/access-denied` page. Shared fetch logic in new `lib/authz-check.ts`, fails
  closed on any network error. New `types/next-auth.d.ts` for the `keycloakId`
  session field.
  - Hit the same Auth.js v5 typing gap the portal's `auth.config.ts` hit
    originally (`token` in the `session` callback doesn't pick up the
    `next-auth/jwt` module augmentation) — same fix, an explicit cast.
- `AUTHZ_SERVICE_SECRET` added to both apps' `.env`/`.env.example`.
- 16 new route tests in the portal (99 total). finance-app still has no test
  suite, by design (see `CLAUDE.md`).
- Full gate green on both apps: portal (lint, `tsc --noEmit`, 99 tests, build),
  finance-app (lint, `tsc --noEmit`, build).
- **Live-smoke-tested the PDP endpoint directly** against the running dev
  server and real seeded data (curl, real `keycloakId`s from Postgres): HR
  employee (no Finance grant) → `{allow:false, reason:"no_grant"}`; Engineering
  employee (has the grant) → `{allow:true, reason:"allow"}`; wrong secret →
  401; unknown `keycloakId` → `no_account`. All correct.

**The 404, chased (2026-09-16) — enforcement verified, cause was environmental:**

The enforcement path was exercised end-to-end against both running dev servers
with real minted finance-app session cookies (a throwaway route using the app's
own runtime config, since the forged-by-hand attempt failed to decrypt; route
deleted afterwards). All four outcomes correct, no browser needed:

| Session | Result |
|---|---|
| HR Employee, granted | **200**, renders the signed-in page — the allow path |
| Finance Employee, no grant | 307 → `/access-denied` |
| Admin (carries no Role) | 307 → `/access-denied` |
| Unknown `keycloakId` | 307 → `/access-denied` |

PDP re-checked live against seeded data at the same time: HR → `allow`,
Finance → `no_grant`.

So the allow path the 404 was blocking does work, and the code is not at fault.

**Root cause: dev-server port drift.** Both apps' `dev` script was a bare
`next dev`, so neither pinned a port — finance-app tries **3000 first** and only
lands on 3001 because the portal happens to already hold 3000. Reproduced live:
with 3000 and 3001 both busy, finance-app silently came up on **3002**. Every
piece of this app's wiring hardcodes the pair — `Application.url` in Postgres
(the tile's `href`), `PORTAL_URL`/`THIS_APP_URL` in `lib/authz-check.ts`, and
Keycloak's redirect URIs — so any start order but "portal first" points the
Finance App tile at the wrong server or none, which renders as exactly the
reported 404.

Fixed: `dev` is now `next dev -p 3000` / `next dev -p 3001`.

**Verified live in the browser after the port fix (2026-09-16),** from a fresh
incognito sign-in (not a refresh — a finance-app cookie minted before Phase 2
lacks the `keycloakId` claim `middleware.ts` reads, and middleware deliberately
lets such a session through to the page rather than denying it):

- **Allow path** — signed in at the portal as an HR Employee, clicked the
  Finance App tile: landed on finance-app's "You're already signed in" page with
  no password prompt. This is the exact navigation that produced the 404.
- **Revoke, live** — with that session still open, an Admin in a separate
  browser profile unticked HR × Finance App in the Access Matrix. The employee's
  next refresh of `localhost:3001` rendered `/access-denied` ("Your role no
  longer grants access to this application"). No re-login, no waiting for token
  expiry. That refresh was also a direct URL hit, so it doubles as proof the
  gate is the middleware and not a hidden tile.

Two browser profiles are needed for that second test — the two apps share one
Keycloak SSO session, so signing in as Admin in the same window would replace
the Employee's session. Incognito for one, a normal window for the other.

Two false leads, recorded so they aren't chased again: a hand-minted session
cookie that failed to decrypt (a mistake in the mint, not in the app), and a
debug route that 404'd because its folder was named `__debug` — Next treats
`_`-prefixed folders as private and excludes them from routing.

## Phase 3 — Joiner / mover / leaver ✅

**Branch:** `feat/joiner-mover-leaver` (cut from `main` after the Phase 2 PR
merged). Gate green (lint, `tsc --noEmit`, 124 tests, build).

**Verified live in the browser (2026-09-20), against the seeded demo data,
each check confirmed at the Postgres/Keycloak level too, not just the UI:**

- **Disable/enable** — disabled a seeded Employee (Neha Joshi) from the
  Admin's dropdown; Keycloak's own login screen then rejected her outright
  ("Account is disabled, contact your administrator") — not just the app
  turning her away, the login step itself. Re-enabled → same login succeeded,
  dashboard restored.
- **Promote** — created a disposable Admin ("QA Temp"), promoted it to
  SuperAdmin; it disappeared from the Admins list immediately and Postgres
  confirmed `userType: SUPERADMIN`.
- **Forced password reset** — reset a seeded Employee's password, confirmed
  the new one-time dialog copy ("Password reset", not "created"), logged in
  with the new password and hit Keycloak's forced-update-password screen.
- **Delete → archive** — deleted a test Employee (`ayush@demo.com`); Keycloak
  admin console confirmed the account fully gone, while Postgres still had
  the row with `archivedAt` set and `status: DISABLED`. The `AuditLog`'s
  `EMPLOYEE_ARCHIVED` entry correctly showed `actorName`/`actorEmail` for the
  Admin who did it. Re-adding the same email correctly 409'd — confirmed the
  known email-reuse limitation is exactly that, not a crash.
- **Compensating rollback** — not manually triggerable (needs the Postgres
  write to fail in the instant after the Keycloak account succeeds); proven
  by the automated test instead (`users/route.test.ts`, "rolls back the
  Keycloak account when the Postgres create fails").
- Along the way, found the Access Matrix had zero grants for any Role
  (leftover from earlier manual Phase 2 testing, unrelated to this phase) —
  every Employee dashboard was showing empty regardless of anything here.
  Fixed by re-running `scripts/seed-demo.ts` (idempotent — skipped everything
  that already existed, only restored the 11 missing grants and one missing
  seeded Admin).

**What shipped:**

- **Disable/enable a user** — `PATCH /api/users/[id]` gained a `status`
  branch (`{ status: "ACTIVE" | "DISABLED" }`), handled separately from the
  name/role edit since the UI fires it from its own dropdown action. Calls
  the new `setKeycloakUserEnabled()` (`lib/keycloak-admin.ts`, `PUT
  /admin/realms/{realm}/users/{id}` with `{enabled}`) before touching
  Postgres, fails closed (502, Postgres untouched) if Keycloak rejects it —
  same ordering/fail-closed pattern as create and delete. Disabling in
  Postgres alone was already enough to block every request (Phase 1's
  `requireUserType` and Phase 2's `/api/authz/check` both read `status` live)
  — this closes the matching gap on the Keycloak side, so a disabled
  account's login screen itself is dead too, not just the app behind it.
  `components/users/users-manager.tsx` adds a Status column and an
  Enable/Disable dropdown action; disabling goes through `ConfirmDialog`
  (kicks a live user out immediately), enabling doesn't (purely restorative).
- **Promote/demote `userType`** — new `PATCH /api/users/[id]/user-type`
  route, SuperAdmin-only, moves a target between `ADMIN` and `SUPERADMIN`.
  Deliberately its own route rather than folded into the PATCH above: that
  route's target lookup is scoped to "one tier below the caller"
  (`managedUserType`), which by design can never match a SuperAdmin target.
  Guards: 400 on self-targeting (`target.id === session.user.id`), 400 on
  demoting the last remaining SuperAdmin (`count({userType: "SUPERADMIN",
  archivedAt: null}) <= 1`), 404 if the target is an Employee (a different
  kind of tier entirely — carries a Role, not part of this ladder).
  **UI gap, tracked not hidden:** the Admins table gained a "Promote to
  SuperAdmin" dropdown action (with a confirm dialog — not easily reversible
  from that screen), but there's no screen listing existing SuperAdmins to
  demote from, since `/superadmin` only ever lists Admins. The route and its
  guards are fully built and tested either way; wiring a demote entry point
  is deferred rather than building a new "manage SuperAdmins" screen just for
  it this pass.
- **Forced password-reset trigger** — new `POST
  /api/users/[id]/reset-password`, same tier scoping as the other per-user
  routes. Calls the new `resetKeycloakUserPassword()`
  (`lib/keycloak-admin.ts`, `PUT .../reset-password` with
  `{type:"password", value, temporary:true}`), returns the new temp password
  once. UI reuses the existing "here's a password" dialog from user creation
  (`components/users/users-manager.tsx`'s `tempCredentials` state gained a
  `reason: "created" | "reset"` to pick the right opening line) rather than
  building a second dialog for the same shape.
- **Delete becomes archive** — `User` gained `archivedAt DateTime?`.
  `DELETE /api/users/[id]` still deletes the Keycloak account outright (that
  login is gone for good), but no longer calls `prisma.user.delete` — it sets
  `archivedAt: now()` and `status: DISABLED` instead, so the row survives.
  `GET /api/users` filters `archivedAt: null` so archived rows disappear from
  every management list, and the PATCH/DELETE/reset-password/user-type
  routes' own target lookups all treat an archived row as 404, same bucket as
  "doesn't exist." `AuditLog.user`'s relation changed from the implicit
  `SetNull`-on-delete an optional relation defaults to an explicit
  `onDelete: Restrict` — since a User row is archived, never hard-deleted, in
  normal operation this should never actually fire; it exists so a
  hypothetical direct hard-delete fails loudly instead of silently orphaning
  audit history. Separately, `AuditLog` also gained `actorName`/`actorEmail`,
  snapshotted by `logAudit()` (`lib/audit.ts`) at write time from a fresh
  Postgres lookup — belt-and-suspenders so a row stays attributable even if
  an actor's name changes later or the relation itself is ever missing.
  Migration `20260920064626_user_archive_and_audit_actor`.
  **Known limitation, not fixed this pass:** email stays unique across
  archived rows, so an archived user's email can't be reused for a new
  account. No restore/reactivate flow exists either. Both are real gaps
  worth a follow-up if they bite, not silently designed around here.
- **Compensating action for a partial create** — `POST /api/users` now wraps
  `prisma.user.create` in a try/catch: if it fails after the Keycloak account
  already exists, it rolls that account back via `deleteKeycloakUser()`
  rather than leaving an orphaned login with no matching portal row (if the
  rollback itself fails, the orphaned `keycloakId` is logged for manual
  cleanup, not silently swallowed) and returns 500.
- Test suite: 9 new tests on the existing users routes (status toggle,
  archived-target 404s, the create-rollback path), plus two new route test
  files (`reset-password`, `user-type`) and a new `lib/audit.test.ts` for the
  actor-snapshot behavior. 99 → 124 tests.

## Phase 4 — Audit log that deserves the name ✅

**Branch:** `feat/structured-audit-log` (cut from `main` after the Phase 3 PR
merged). Gate green (lint, `tsc --noEmit`, 134 tests, build); not yet clicked
through live in a browser.

**What shipped:**

- **Structured fields** — `AuditLog` gained `targetType`, `targetId`,
  `metadata Json?`, `outcome` (new `AuditOutcome` enum: `SUCCESS`/`DENIED`/
  `FAILURE`, default `SUCCESS`), `ip`, `userAgent`. Migration
  `20260920131906_audit_log_structured_fields`. `logAudit()`
  (`lib/audit.ts`) changed from three positional args
  `(userId, action, details?)` to one structured `AuditEntry` object —
  `details` stays (still the human-readable line the UI/CSV show), the new
  fields ride alongside it rather than replacing it. New `requestMeta(req)`
  helper reads `x-forwarded-for`/`user-agent` off a request, best-effort only
  (this app runs plain `next start` in dev, no real reverse proxy in front of
  it, so `x-forwarded-for` is usually empty locally — would populate for real
  behind an actual proxy in production). All 16 existing `logAudit` call
  sites across every route updated to the new shape, each given a sensible
  `targetType`/`targetId`/`metadata` for its own entity.
- **New events, logged for the first time:**
  - `LOGIN_SUCCESS` / `LOGIN_DENIED` — the branching logic that used to be
    three lines inline in `auth.ts`'s `signIn` callback moved to a new
    `lib/evaluate-sign-in.ts` (unit-tested on its own; NextAuth's callback
    wiring itself stays manual-verification-only, same reasoning as
    `middleware.ts`). Denied logins distinguish `no_account` (no actorId —
    same pattern as `AUTHZ_DENIED`) from `disabled` in `metadata.reason`.
  - `LOGOUT` — logged in `app/api/auth/federated-signout/route.ts` when the
    session token carries a `userId`. This route had no test file at all
    before now (a pre-existing gap predating this phase) — added one
    alongside the new logging, including the Phase 0 GET-handler regression
    check.
  - `ACCESS_DENIED` — added inside `requireUserType()` itself
    (`lib/api-auth.ts`), covering both 403 branches (disabled account, wrong
    tier). Deliberately *not* the two 401 branches (no session / row
    deleted) — no reliable actor to attribute, and logging every
    unauthenticated hit would be noise, not signal. `ip`/`userAgent` aren't
    attached to this one specifically — threading the request object through
    every one of `requireUserType`'s ~20 call sites for one event type
    wasn't worth the ripple.
- **Badge/filter correctness fix, found while building this:**
  `components/audit-log/action-badge.tsx`'s `categorizeAction`/`toneOf` only
  recognized the verbs `CREATED`/`UPDATED`/`DELETED`/`GRANTED`/`REVOKED` — so
  Phase 3's `EMPLOYEE_ARCHIVED` was falling into the neutral "other" bucket
  instead of "deleted", and the new `_DENIED` actions (plus the
  already-existing `AUTHZ_DENIED`) would have too. Fixed: `ARCHIVED` now
  categorizes as "deleted", `DENIED` gets its own new "denied" category and a
  destructive (red) tone, with a matching filter chip in
  `audit-log-explorer.tsx`.
- Test suite: new `lib/evaluate-sign-in.test.ts`, new
  `app/api/auth/federated-signout/route.test.ts`, rewritten
  `lib/audit.test.ts` for the structured shape, `lib/api-auth.test.ts`
  extended to assert the two `ACCESS_DENIED` paths, plus mechanical updates
  to every route test file's `logAudit` assertions. 124 → 134 tests.

**Server-side pagination (2026-10-01)** — replaces the client-side filter
over the hard 100-row cap, so search and filters now cover the whole log.
Gate green (lint, `tsc --noEmit`, 154 tests, build — `/admin/audit` still
`ƒ Dynamic`). **Verified live in the browser 2026-10-04** against 83 real
audit rows: Older/Newer across 2 pages, chip counts matching what each chip
shows, a case-insensitive search finding entries from page 2, URL state
surviving refresh and Back, `?page=999` → last page, junk `page`/`category`
→ defaults, "No entries match" → Clear filters.

- The URL is the whole state: `/admin/audit?q=&category=&page=`. Filtered
  views are linkable and survive a refresh; the back button works.
- New `lib/audit-query.ts` (pure, unit-tested in `lib/audit-query.test.ts`):
  parses/validates `searchParams` (unknown category → all, non-integer page →
  1, search capped at 200 chars), builds the Prisma `where`, tallies chip
  counts, clamps an out-of-range page to the last one, builds hrefs.
  `categorizeAction` moved here from `action-badge.tsx` (only the explorer
  used it); the badge imports `actionVerb` from it for its tone.
- One `groupBy(action)` over the search-matching rows yields the chip counts,
  the total for the current filter, *and* the exact action strings a
  category filters on (`action IN (...)`) — so a chip's count and what
  clicking it shows can't disagree, and there's no LIKE pattern
  re-implementing `categorizeAction`'s verb rules. Then one `findMany`,
  50 rows per page, ordered `createdAt desc, id desc` (id breaks ties so a
  row can't flip between pages).
- Search is case-insensitive over actor name/email, action, details, and the
  live `user` relation (fallback for rows older than the actor snapshot).
- `components/audit-log/audit-log-explorer.tsx` is now a Server Component:
  search is a `next/form` GET form (submits on Enter, keeps the category,
  resets to page 1), chips and Newer/Older are plain links.
- Behavior changes worth knowing: search runs on Enter, not per keystroke;
  chip counts now reflect the current search (faceted), not the whole log.
- Known ceiling, marked `ponytail:` in `app/admin/audit/page.tsx`: offset
  paging, so a new row written mid-browse shifts later pages by one. Switch
  to a `(createdAt, id)` cursor if that ever matters.
- The CSV export stays the whole, unfiltered log (it's the archival copy,
  not the on-screen view).

**Atomic audit writes + hardened CSV export (2026-10-04)** — the last two
gaps, `docs/review-findings.md` #6 and #7, closed on
`feat/audit-atomic-export` and verified live (details in that file's fix
log). Every audit row that records a change now commits in the same
transaction as the change (`logAudit(entry, tx)`), with Keycloak
compensation where Keycloak moved first; the export neutralizes
spreadsheet formulas and carries the structured columns. 199 tests.

**Phase 4 ✅ done.**

Separate from this phase: a full codebase review on 2026-10-01 logged ten
findings outside the existing phases (page-level revocation gap, archived
users reappearing, and more) in `docs/review-findings.md`.

## Phase 5 — Keycloak done properly 🟡

**Plan (agreed 2026-10-04)** — five sub-steps, each its own branch, PR, and
browser pass:

| # | Sub-step | Status |
|---|---|---|
| 5.1 | Least-privilege admin: realm-scoped `portal-admin` service account replaces the master-admin login in the app and scripts; `scripts/sync-keycloak-realm.ts` applies `realm-export.json` to a running Keycloak (`--import-realm` skips an existing realm) | ✅ Done, verified live |
| 5.2 | Realm hardening: password policy, brute-force lockout, session/token lifespans; `review-findings.md` #11 (optional last name) | ⬜ |
| 5.3 | MFA: TOTP **required for SuperAdmin and Admin**, opt-in for Employees | ⬜ |
| 5.4 | `review-findings.md` #9: finance-app authenticates to the PDP with its own Keycloak service-account token; `Application.clientId` replaces the self-reported origin and the shared secret | ⬜ |
| 5.5 | Keycloak storage moves from embedded H2 to a `keycloak` database in the existing Postgres — **last, behind a volume backup**, full realm+user export/import | ⬜ |

**5.1 — least-privilege admin (2026-10-04, `feat/keycloak-service-account`).**
Gate green (lint, `tsc --noEmit`, 203 tests, build).

- `keycloak/realm-export.json`: new confidential client `portal-admin` —
  client-credentials only (no login flows) — whose service account holds
  `realm-management` → `manage-users`, `view-users`, `query-users`, nothing
  else.
- `lib/keycloak-admin.ts` signs in as that service account
  (`KEYCLOAK_ADMIN_CLIENT_ID`/`_SECRET`) against this realm's token endpoint;
  `lib/keycloak-admin.test.ts` asserts it never touches `/realms/master`.
  `scripts/bootstrap-superadmin.ts` dropped its own copy of the token/create
  code and uses the library; `seed-demo.ts` checks the new vars.
- The master admin login left `apps/portal/.env` entirely — root `.env` only,
  for the container and the new operator script.
- `scripts/sync-keycloak-realm.ts`: applies `realm-export.json` to a running
  Keycloak (realm settings, clients, service-account role grants),
  idempotent. Needed because `--import-realm` skips an existing realm; every
  later Phase 5 realm change goes through it.
- Found along the way: the bootstrap's "does this Keycloak login already
  exist?" check looked up by username, but the first SuperAdmin's username is
  `ayush` (predates usernames = email), so it was invisible to it. Now by email.

**Verified live 2026-10-04:** least-privilege probe with the service account —
this realm's users 200; master realm users 403; changing realm settings 403;
the client list came back empty (no secrets visible); the realm list showed
only this realm's name. Sync re-run changed nothing. Browser: an Admin created,
password-reset, disabled, enabled, and deleted an Employee — five audit rows,
Keycloak login gone afterwards.

Original scope note: Replace the master-realm admin password grant
(`lib/keycloak-admin.ts` authenticates as Keycloak's own `admin` user on every
user create/delete) with a realm-scoped service-account client holding
`realm-management` → `manage-users`/`view-users` — blast radius drops from "the
entire Keycloak installation" to "this realm's users." Then realm hardening:
password policy, brute-force lockout, token/session lifespans, point Keycloak at
Postgres instead of its embedded dev database. OTP/MFA policy last — it's a
Keycloak checkbox, and it only means something once Phase 2 actually lands.

## Phase 6 — Integrity + UI correctness ⬜

Not started. Change `User.roleId`/`RoleAccess`'s foreign keys from `SET
NULL`/`CASCADE` to match the 409-block behavior `CLAUDE.md` documents (today the
database silently does the opposite of what the app claims). Fix the missing
`catch` in every manager's optimistic `fetch` (`access-matrix.tsx`,
`users-manager.tsx`, `roles-manager.tsx`, `applications-manager.tsx`) — a
network failure today shows a grant/edit as succeeded when nothing was written,
and no toast fires. `router.refresh()` consistency across managers; add
`error.tsx`/`not-found.tsx`; `required` on the Employee role `Select`.

**Constraint from `fix/review-findings` (2026-10-02):** role delete now
ignores archived holders and relies on `User.roleId`'s current `SetNull` to
clear their `roleId` (`docs/review-findings.md` #3). If this phase changes that
FK to `Restrict`, archiving a user must clear `roleId` first — otherwise any
role an archived user once held becomes undeletable again.

## Phase 7 — Presentation honesty ⬜

Not started. Resolve the `/sign-in` page vs. `middleware.ts` inconsistency
(middleware's own redirect-when-unauthenticated path bypasses `/sign-in`
entirely, going straight to `/api/auth/signin` — the two entry points behave
differently today). Decide what to do with the landing page's hardcoded
"activity feed" and stats (`app/page.tsx`) now that Phase 4 makes some of that
data capable of being real. Rewrite `docs/demo-script.md` around the strongest
moment this rebuild produces: revoke access in the matrix in one window, watch
the other app lock the user out in the other, live.
