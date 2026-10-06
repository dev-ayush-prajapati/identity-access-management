# Codebase Review Findings — 2026-10-01

Full read of both apps, every API route, the schema, the realm export, and all
docs, done while `feat/structured-audit-log` (Phase 4) was in progress. Each
finding below was confirmed directly in source, not inferred from the docs.

**None of these are in `docs/rebuild-plan.md` or `docs/plan.md`** unless a
finding says so. Phase tracking stays in `docs/rebuild-plan.md` — when a
finding here is fixed, mark it ✅ here with the commit/PR, don't delete it.

Gate at time of review: lint clean, 134/134 tests passing. `tsc` failed
locally only because this checkout's generated Prisma client was stale and
`node_modules` was missing `recharts` (declared in `package.json`) — local
drift, fixed by `./node_modules/.bin/prisma generate` + `npm ci`, not a code
problem.

## Status

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Admin/SuperAdmin pages bypass revocation | High | ✅ Fixed, verified live 2026-10-04 (`fix/review-findings`) |
| 2 | Archived users reappear on page refresh | High | ✅ Fixed, verified live 2026-10-04 (`fix/review-findings`) |
| 3 | A role becomes undeletable once an archived user held it | Medium | ✅ Fixed, verified live 2026-10-04 (`fix/review-findings`) |
| 4 | finance-app fails open on a session with no `keycloakId` | Medium | ✅ Fixed (`fix/review-findings`) — code-verified only; needs a pre-Phase-2 cookie to reproduce by hand |
| 5 | Portal sign-out doesn't end the finance-app session (page claims it does) | Medium | 🟡 False claim removed (verified live 2026-10-04); real single logout still open |
| 6 | Audit writes aren't atomic with the mutation they record | Medium | ✅ Fixed, verified live 2026-10-04 + real-DB rollback proven (`feat/audit-atomic-export`) |
| 7 | CSV export allows formula injection; omits Phase 4 fields | Low–Med | ✅ Fixed, verified live in Excel 2026-10-04 (`feat/audit-atomic-export`) |
| 8 | Renaming to a duplicate name returns 404 "not found" | Low | ✅ Fixed, verified live 2026-10-04 (`fix/review-findings`) |
| 9 | PDP trusts a self-reported origin + one shared secret | Design | ⬜ Open (fits Phase 5) |
| 10 | Minor hardening: unguarded `req.json()`, no security headers, no Origin check | Low | ⬜ Open |
| 11 | New users are forced to invent a Keycloak last name; finance-app shows it | Low | ✅ Fixed, verified live 2026-10-07 (`feat/keycloak-realm-hardening`, Phase 5.2) — lastName optional, renames reach Keycloak, existing names reconciled |

### Fix log — `fix/review-findings` (2026-10-02)

Gate green: portal lint, `tsc --noEmit`, 187 tests (154 → 187), build;
finance-app lint, `tsc --noEmit`, build.

**Verified live in the browser 2026-10-04**, two browser profiles (normal +
incognito), seeded Northwind data: disabling a signed-in Admin bounced their
next page load to `/` and wrote `ACCESS_DENIED` rows (#1); promoting a
signed-in Admin landed them on `/superadmin` with no redirect loop (#1); an
Employee typing `/admin` or `/superadmin` went straight to `/dashboard`, and a
signed-out `/admin` went to sign-in (#1); a deleted employee stayed gone after
refresh and the overview count followed (#2); a role an archived user had held
deleted cleanly (#3); a duplicate role rename showed "already exists" after the
`instanceof` fix below (#8); finance-app showed the corrected text and still
locked out a revoked Employee live (#5). Same session also passed the Phase 4
pagination checklist.

Setup snags on the way, environment not code: the local DB was three
migrations behind (applied with `migrate deploy`); both `.env` files predated
Phase 2's `AUTHZ_SERVICE_SECRET` (the PDP correctly failed closed with 500
"Service not configured" until it was added); finance-app's dev cache went
stale and 404'd `/api/auth/*` until `.next` was cleared.

- **#1** — new `lib/page-auth.ts`: `requirePageUser(zone)` re-reads the user
  from Postgres each request (`getLiveUser`, cached per request with React
  `cache()`), redirects a disabled/archived account to `/` (audit-logged as
  `ACCESS_DENIED`) and a wrong-zone user to their own zone. Called first in
  all 10 zone pages, and in the 4 zone layouts so not even the shell renders
  for someone who can't enter (request-cached: one query, one log). **Design change:** `middleware.ts` now checks only that a
  session exists — a zone check on the stale JWT would have redirect-looped
  against the live check for anyone promoted/demoted since sign-in (page says
  "go to /superadmin", middleware's token says "you're ADMIN, go to /"). `/`,
  `/sign-in`, `AppShell`, and `/profile`'s layout route/label by the live row
  too. `lib/page-auth.test.ts` unit-tests the decision and statically fails if
  any zone page doesn't call the guard. `CLAUDE.md`'s authorization section
  updated to match. Behavior change: a disabled Employee is now redirected out
  of `/dashboard` (previously shown the "No role assigned yet" empty state).
- **#2** — new `lib/users.ts` `listManagedUsers()` is the one query behind
  `GET /api/users`, `/admin/employees`, and `/superadmin/admins`. Overview
  counts, the employees preview, and per-role headcount exclude archived
  users; the weekly growth chart still counts them (it plots joiners).
- **#3** — role delete counts only non-archived holders; the FK's default
  `SetNull` clears archived users' `roleId`. **Phase 6 must keep that** — if it
  changes `User.roleId` to `Restrict`, archive must clear `roleId` first or
  this bug comes back.
- **#4** — finance-app middleware sends a session with no `keycloakId` back
  through sign-in instead of letting it through unchecked.
- **#5** — finance-app's "signing out of the portal ends it in both places"
  replaced with what's true (access is re-checked on every visit). Real
  single logout (OIDC back-channel) is still open.
- **#8** — new `lib/prisma-errors.ts`: role/application rename maps P2002 →
  409, P2025 → 404, and rethrows anything else (a DB outage is a 500 again,
  not "not found"). Delete uses `.catch(nullIfNotFound)` the same way.
  **Bug caught in the browser pass:** the first version used
  `instanceof Prisma.PrismaClientKnownRequestError`, which is silently
  `false` inside Next.js (Prisma's runtime loads as two copies there), so a
  duplicate rename fell through to an empty 500 — while the unit tests and a
  plain-Node probe, each with one copy, passed. Now matched by error `name` +
  `code`; `lib/prisma-errors.test.ts` covers the two-copies case, and a
  throwaway route confirmed `P2002` in the live dev server. The client side
  of the same failure (`roles-manager` calling `res.json()` on an empty body
  and crashing instead of toasting) is Phase 6's manager error-handling item.

### Fix log — `feat/audit-atomic-export` (2026-10-04)

Gate green: portal lint, `tsc --noEmit`, 199 tests (187 → 199), build.

**Verified live in the browser 2026-10-04:** a role create, a matrix
grant/revoke, an employee disable/enable, and a role delete each produced
their audit row, attributed to the acting Admin (#6). For #7, an Admin renamed
to `=HYPERLINK("https://example.com","click me")` produced a CSV whose User
cells all carried the `'` prefix; Excel itself (checked via automation on a
read-only copy) reported 0 formulas and 0 hyperlinks. The one cell that did
open `example.com` had its `'` deleted by hand in Excel before saving — the
exact attack the prefix prevents — which also surfaced the leading-whitespace
hardening below. New 11-column layout confirmed in the downloaded file.

- **#6** — `logAudit(entry, tx?)`: an optional transaction client carries both
  the actor lookup and the insert. All 12 audit writes that record a change
  (roles, applications, access matrix, user create/edit/status/archive/
  user-type) now run inside `prisma.$transaction` with the change, so they
  commit together or not at all. Keycloak stays first where it was first:
  - user **create** — the existing Keycloak rollback now also covers an
    audit failure;
  - user **enable/disable** — new compensating action: a failed transaction
    restores Keycloak's previous enabled state, 500 with a clear message;
  - user **archive** — a deleted Keycloak login can't be restored, so a
    failed transaction returns a retryable 500 (the retry heals it:
    `deleteKeycloakUser` treats 404 as done).

  Route tests assert `logAudit` received the transaction and that an audit
  failure fails the request; mocks can't model rollback itself, so a
  throwaway script proved it against the real database through the PrismaPg
  adapter (role + audit row inside a transaction, forced failure → neither
  row left behind). Not wrapped, deliberately: sign-in/out, denials, export,
  and password reset — they change no rows to bind to.
- **#7** — `csvField` prefixes `'` to anything starting with `= + - @`, tab,
  or CR (OWASP CSV-injection mitigation), *then* RFC 4180-quotes. Hardened
  during the browser pass: a downloaded file edited by hand (`'` replaced
  with a space) still ran `" =HYPERLINK(...)"` in Excel, so leading whitespace
  before `= + - @` is caught too — names are trimmed on write, but the
  User-Agent column is whatever the client sent. The export
  gains Outcome, Target Type, Target ID, Metadata (JSON), IP, User Agent —
  appended after the original five columns so the old layout still reads.

---

## 1. Admin/SuperAdmin pages bypass revocation — High

**Where:** every `app/admin/**/page.tsx` and `app/superadmin/**/page.tsx`;
`middleware.ts:34`.

These pages query Prisma directly with no live check of the caller. The only
gate in front of them is `middleware.ts`, which compares the zone against the
**session JWT's** `userType` — frozen at sign-in, valid for Auth.js's default
30 days. Phase 1 made `requireUserType` (API routes) and `/dashboard` read
live state, but not these pages.

**Failure scenarios:**
- Admin is disabled or archived → their existing cookie still renders
  `/admin/employees`, `/admin/audit`, `/admin/access` with live data until it
  expires. Mutations 403 (API is gated); reads don't. This is the classic
  "leaver keeps access" IAM failure.
- SuperAdmin demoted to Admin → still reads `/superadmin/*`.
- Admin promoted to SuperAdmin → middleware keeps routing them to `/admin`
  (token still says ADMIN), `/superadmin` redirects them away, and every API
  call from `/admin` 403s (live type is SUPERADMIN). Stuck until re-login.
  `app/page.tsx` and `app/profile/layout.tsx` also pick zone/nav from the
  stale token.

**Fix:** a data-access-layer guard, e.g. `requirePageUser(allowed)` in `lib/`,
doing the same live lookup as `requireUserType` and `redirect()`ing instead
of returning a 403. Call it at the top of each page — **not** in the zone
`layout.tsx`, since App Router layouts don't re-render on soft navigation
between sibling pages. Middleware stays as the cheap first pass.

## 2. Archived users reappear on page refresh — High (visible in a demo)

**Where:** `app/admin/employees/page.tsx:14`, `app/superadmin/admins/page.tsx:11`;
counts/charts at `app/admin/page.tsx:45,60,74` and `app/superadmin/page.tsx:22-23`.

Phase 3 says archived users "disappear from every management list". Only
`GET /api/users` filters `archivedAt: null` — and no page uses that endpoint;
the pages query Prisma themselves without the filter. Deleting a user removes
them from client state, but a refresh brings them back with a "Disabled"
badge, and every action on the row then 404s. Overview counts, the employees
preview, role distribution, and growth chart all include archived users.

**Root cause:** the same read exists in two places (page query + API GET) and
the filter diverged. The guard/DAL from #1 is the natural home for one shared
query.

## 3. A role becomes undeletable once an archived user held it — Medium

**Where:** `app/api/roles/[id]/route.ts:48`.

`DELETE` blocks with 409 if `prisma.user.count({ where: { roleId: id } })` is
non-zero. Archiving a user (`users/[id]/route.ts`) keeps their `roleId`. So
any role an archived employee ever held can never be deleted: the Admin sees
"1 user(s) are assigned this role. Reassign them before deleting it.", but
the user isn't in any list and every per-user route answers 404 for them.

**Fix:** add `archivedAt: null` to the count.

## 4. finance-app fails open — Medium

**Where:** `apps/finance-app/middleware.ts:18`.

A session with no `keycloakId` claim (any cookie minted before Phase 2) is
passed straight through with `NextResponse.next()`, and `app/page.tsx` only
checks `session?.user` — so it renders the signed-in page without ever asking
the PDP. An authorization gate must fail closed.

**Fix:** if there's a session but no `keycloakId`, redirect to
`/access-denied` (or force a fresh sign-in).

## 5. Portal sign-out doesn't end the finance-app session — Medium

**Where:** `apps/finance-app/app/page.tsx:103`; `keycloak/realm-export.json`
(no back-channel logout URL on either client).

The portal's federated sign-out ends the Keycloak SSO session, but
finance-app's own `financeapp-session-token` cookie is independent and
survives. Its middleware only asks the PDP, which only checks Postgres
(still ACTIVE, still granted) → the user still sees "You're already signed
in." The page text says "Signing out from the portal ends it in both
places", which is false. finance-app also has no sign-out of its own.

**Fix options:**
- Cheap/honest: correct the copy, add a sign-out to finance-app.
- Real single logout: OIDC back-channel logout — register a
  `backchannel.logout.url` on the finance-app client, receive Keycloak's
  `logout_token`, record the revoked `sid`, reject it in middleware. Needs a
  small revoked-session store because Auth.js sessions here are stateless JWTs.

## 6. Audit writes aren't atomic with the mutation — Medium

**Where:** every mutating route — the change is written, then `logAudit()`
runs as a separate statement.

If the audit insert fails, the change is already committed, the caller gets
a 500, and no audit row exists. For a system whose audit log is the
governance record, that's the one write that shouldn't be lossy.

**Fix:** wrap DB-only mutations (roles, applications, access matrix, user
edits) in `prisma.$transaction`, with `logAudit` accepting the transaction
client. Keycloak-backed operations can't join a DB transaction — those keep
the existing ordering/compensation pattern.

## 7. CSV export: formula injection, missing fields — Low–Medium

**Where:** `app/api/audit-log/export/route.ts:12` (`csvField`).

RFC 4180 quoting is correct, but a field starting with `=`, `+`, `-`, or `@`
is not neutralized. An employee named `=HYPERLINK("http://…","x")` becomes a
live formula when an auditor opens the export in Excel/Sheets (OWASP "CSV
injection"). Attacker here is an Admin (names are admin-entered), so low
likelihood — but the export is exactly the file handed to someone outside
the system.

Also: the export predates Phase 4 and omits `outcome`, `targetType`,
`targetId`, `ip`, `userAgent`.

**Fix:** prefix a `'` to fields starting with `= + - @` (tab/CR too); add the
structured columns.

## 8. Renaming to a duplicate name returns 404 — Low

**Where:** `app/api/roles/[id]/route.ts:21`, `app/api/applications/[id]/route.ts:31`.

`.update(...).catch(() => null)` turns every error into "not found" —
including the unique-constraint violation (Prisma `P2002`) from renaming a
role/application to a name that already exists, and a database outage.

**Fix:** map `P2002` → 409 with the same message `POST` uses; only treat
`P2025` (record not found) as 404; let anything else surface as 500.

## 9. PDP trusts a self-reported origin + one shared secret — Design

**Where:** `app/api/authz/check/route.ts:56`; `apps/finance-app/lib/authz-check.ts`.

- The calling app says which app it is (`origin`), matched by exact string
  against `Application.url` — a registered URL with a trailing slash means
  every request is denied as `unknown_application`.
- `Application.url` isn't unique, so a second catalog entry with the same URL
  becomes a back door: granting a role that entry grants Finance App access.
- One static `AUTHZ_SERVICE_SECRET` for every caller — anyone holding it can
  ask on behalf of any app.
- `PORTAL_URL`/`THIS_APP_URL` are hardcoded, not env.

**Better:** finance-app authenticates with its own Keycloak client's service
account (client-credentials grant); the portal verifies that token and maps
its `azp`/client id to the Application (store `clientId` on `Application`).
Removes the shared secret, origin spoofing, and URL brittleness at once.
Fits naturally alongside Phase 5's service-account work.

## 10. Minor hardening — Low

- `await req.json()` is unguarded in every route — a non-JSON body is a 500,
  not a 400.
- `next.config.ts` sets no security headers (CSP, `frame-ancestors`,
  `X-Content-Type-Options`). `SameSite=Lax` already blocks most cross-site
  framing/CSRF; headers are defense in depth.
- Mutating routes don't check `Origin`. `SameSite=Lax` doesn't stop
  **same-site** callers, and `localhost:3001` (later `finance.corp.com` next
  to `portal.corp.com`) is same-site — an XSS in any sibling app could drive
  the portal's admin API with the Admin's cookie.
- Last-SuperAdmin guard (`users/[id]/user-type/route.ts`) is a read-then-write
  count with no lock — two concurrent demotions could both pass. Negligible
  at this scale.

## 11. New users are forced to invent a Keycloak last name — Low

**Where:** `lib/keycloak-admin.ts` `createKeycloakUser` (sets `firstName: name`,
no `lastName`); `keycloak/realm-export.json` (default Keycloak 26 user
profile, where last name is required).

Found in the 2026-10-04 browser pass: finance-app showed a seeded Employee as
"Rohan Mehta Admin". Keycloak held `firstName: "Rohan Mehta"`,
`lastName: "Admin"` — on first sign-in Keycloak's "update account information"
step demanded the missing last name and whatever was typed was kept. The
portal shows `User.name` from Postgres; finance-app shows Keycloak's profile
name — so the two apps disagree about who someone is, and every new user hits
an unexplained extra form at first login.

**Fix options:** split the name into first/last when creating the Keycloak
user, or make `lastName` optional in the realm's user profile
(`realm-export.json`) so Keycloak stops asking. Existing users' bogus last
names need clearing either way.

---

## Doc drift (found during the same review)

- `docs/demo-script.md:52,66` and the FAQ still say the matrix isn't enforced
  by Finance App, there's no revocation, and there are 78 tests — all now
  untrue in the *under*-claiming direction. The live-revoke moment (Phase 2's
  best demo) isn't in the script. Phase 7 covers the rewrite.
- `CLAUDE.md:105` documents `logAudit(userId, ACTION, details)`; it now takes
  one structured `AuditEntry` object. Its "deleting reverses it" line is also
  stale — user delete archives now.
- `docs/plan.md:16` says `feat/sem3-ui-pass` is unmerged; it merged in PR #13.
- `docs/session-log.md` Current Status / Open Items stopped at 2026-09-12
  (still says Phase 2 is on a branch, no disable UI exists, etc.).
- Underlying cause: five docs carry overlapping status. `docs/rebuild-plan.md`
  already declares itself the single source of truth — the others should
  point to it rather than restate it.
- Branches: local `feat/audit-integrity` points at the old PR #12 merge commit
  with no unique work — safe to delete. Merged remote feature branches too.

## Architecture notes

**Holding up well:** Keycloak-owns-identity / Postgres-owns-authorization
split; tier derived from the caller, never the body; 404 (not 403) across
tiers; PDP fails closed when its secret is unset; Keycloak-first ordering
with compensating rollback on create; archive-not-delete with actor
snapshots; tests mock only true boundaries.

**Structural gaps:**
- **Authorization is enforced at the API layer, not the data layer** — the
  root of #1 and #2. Next.js's own guidance treats middleware/proxy as an
  optimistic check and a data-access layer as the authoritative one. Related:
  Next 16 deprecates `middleware.ts` for `proxy.ts`, which runs on the Node
  runtime — worth verifying, since that would dissolve the edge/Prisma split
  `CLAUDE.md` is built around.
- **Keycloak + Postgres dual-write has no reconciliation.** Only create has a
  rollback. Disable writes Keycloak then Postgres — if the Postgres update
  fails, Keycloak says disabled and the portal says active, and nothing
  notices. Same for archive.
- **Data model ceiling:** one Role per Employee, and Admins/SuperAdmins can't
  hold a Role at all — so the PDP denies them every business app
  (`wrong_user_type`). In a real org an admin is also an employee. A
  `UserRole` many-to-many with Roles allowed on any `userType` (UserType then
  means only "management powers") is a bigger RBAC gap than fine-grained
  permissions.

## Feature ideas (single-org IGA, no multi-tenancy)

Useful yardstick for evaluators: NIST RBAC levels — Core (where this is) →
Hierarchical → Constrained (separation of duties) → access review.

| Feature | Why | Effort |
|---|---|---|
| "Explain access" view — pick user + app, see decision + reason chain | Reuses the PDP's `decide()`, which already returns reasons. Strong demo. | S |
| Keycloak ↔ Postgres reconciliation report | Core IGA concept; covers the dual-write gap above | S–M |
| Access reviews / certification campaigns | The defining IGA feature — Admin periodically certifies each role's members and grants, revokes inline | M |
| Multi-role users + separation-of-duties rules | Real RBAC, e.g. "Payroll-Submit and Payroll-Approve can't coexist" | M |
| Tamper-evident audit log (hash chain + verify) | Completes Phase 4's thesis | S–M |
| Time-bound grants | Already in `docs/plan.md`; cheap now that the PDP exists | S |
| OIDC back-channel logout | True single logout; fixes #5 | M |
