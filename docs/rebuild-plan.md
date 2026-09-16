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
| 2 | Real enforcement | 🔧 Built, gate-verified; all four decision paths proven end-to-end with real sessions. The 404 was dev-server port drift, now fixed — **still needs one browser click-through** |
| 3 | Joiner / mover / leaver | ⬜ Not started |
| 4 | Audit log that deserves the name | ⬜ Not started |
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

## Phase 2 — Real enforcement 🔧 (built, not yet confirmed)

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

**Still outstanding:** nobody has re-run the actual browser click-through since
the port fix. The four cases above cover the same code path the browser takes,
but per this file's ground rule that is "proven by test", not "proven live" —
so Phase 2 stays 🔧 until someone clicks it. That retest should start from a
fresh sign-in, not a refresh: a finance-app cookie minted before Phase 2 lacks
the `keycloakId` claim `middleware.ts` reads, and middleware deliberately lets
such a session through to the page rather than denying it.

Two false leads, recorded so they aren't chased again: a hand-minted session
cookie that failed to decrypt (a mistake in the mint, not in the app), and a
debug route that 404'd because its folder was named `__debug` — Next treats
`_`-prefixed folders as private and excludes them from routing.

## Phase 3 — Joiner / mover / leaver ⬜

Not started. Disable/enable a user (maps onto Keycloak's `enabled` flag, which
`lib/keycloak-admin.ts` can already reach — Phase 1 added the schema field and
the checks that respect it, but there's still no UI/API action to flip it).
Promote/demote `userType`, with guards against demoting yourself and against
removing the last SuperAdmin. Forced password-reset trigger. Delete becomes
archive: `AuditLog.userId` stops going `SET NULL` on delete (denormalize actor
name/email onto the audit row instead, so attribution survives regardless).
Compensating action when a Keycloak-then-Postgres create fails partway.

## Phase 4 — Audit log that deserves the name ⬜

Not started. `AuditLog` gains `targetType`, `targetId`, `metadata Json`, `ip`,
`userAgent`, `outcome`; `logAudit` takes a structured argument instead of a free
`details` string. Log `LOGIN_SUCCESS`, `LOGIN_DENIED`, `LOGOUT`, and
`ACCESS_DENIED` (the `requireUserType` 403 path) — today there are zero
authentication events logged despite the log claiming to cover logins. Real
server-side pagination, replacing the client-side filter over a hard 100-row cap.

## Phase 5 — Keycloak done properly ⬜

Not started. Replace the master-realm admin password grant
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

## Phase 7 — Presentation honesty ⬜

Not started. Resolve the `/sign-in` page vs. `middleware.ts` inconsistency
(middleware's own redirect-when-unauthenticated path bypasses `/sign-in`
entirely, going straight to `/api/auth/signin` — the two entry points behave
differently today). Decide what to do with the landing page's hardcoded
"activity feed" and stats (`app/page.tsx`) now that Phase 4 makes some of that
data capable of being real. Rewrite `docs/demo-script.md` around the strongest
moment this rebuild produces: revoke access in the matrix in one window, watch
the other app lock the user out in the other, live.
