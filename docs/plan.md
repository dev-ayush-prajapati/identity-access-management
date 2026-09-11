# Plan

Forward-looking task list: what's left in Sem3, what's optional Sem3 polish, what's deferred to Sem4. `docs/planning-notes.md` stays the record of *locked decisions and what was already built/fixed and why* — this file is just the task list, checked off as things land.

## Process notes

- Work lands on a named branch, one PR per chunk of related work — matches the repo's existing PR-per-feature history without over-fragmenting into a PR per plan item. (Sem3 core landed as `feat/sem3-wrapup` → PR #8; demo readiness as `feat/dashboard-polish` → PR #9.)
- `npm audit` on `apps/portal` flags 13 (2 moderate, 11 high) — checked all of them: every one is either dev-only tooling (ESLint/TypeScript internals, the Prisma *CLI's* bundled deps — not `@prisma/client`) or a build-time transitive dep inside `next` (`postcss`, `sharp`) that only ever processes this project's own source/CSS, never attacker-controlled runtime input. Nothing in the actual request-handling path (no `next-auth`, `@prisma/client`, or `pg` advisory). `npm audit fix` (non-breaking) would clear a few; the rest need `--force` and would downgrade `prisma` or bump `next` outside its stated range — deferred as its own separate pass, not bundled into this branch.

## Done (Sem3 core, demo readiness, UI/UX pass)

Full bug-by-bug history for all three lives in `docs/planning-notes.md`.

- **Sem3 core** — Profile page, Audit Log viewer, Application delete guard, root README, live browser verification (SuperAdmin + Admin accounts). Merged `feat/sem3-wrapup` → PR #8 → `main`.
- **Demo readiness** — `docs/demo-script.md`, dark/light theme toggle, dashboard stat rows. Merged `feat/dashboard-polish` → PR #9 → `main`.
- **UI/UX pass + demo data** (2026-08-28 through 2026-09-09) — landing page, zone layouts + `AppShell`, motion system, command palette, dashboard rebuilds, audit log CSV export, access matrix redesign, employee dashboard/profile redesign, manager screen polish, idempotent `scripts/seed-demo.ts`, finance-app SSO payoff page, bootstrap-superadmin username fix (PR #11); plus landing page dark palette/activity feed, real-data admin analytics charts + employees preview, and the `/sign-in` interstitial page (all logged in `docs/planning-notes.md`'s "Post-roadmap: UI/UX pass, part 2" as of 2026-09-11). On `feat/sem3-ui-pass`, not yet merged to `main` — merge deferred until the rebuild below lands (see `docs/session-log.md`).

Gate: `npm run lint` / `tsc --noEmit` / `npm run build` clean, `npm test` 78 passing (verify against `npm test`'s own output, not this line — it has drifted before).

Not verified: authenticated screens haven't been clicked through in a browser this session — worth one manual pass before demoing.

## Correctness rebuild (in progress, supersedes "Next candidates" below)

A full audit on 2026-09-11 (see `docs/session-log.md`) found the RBAC/audit story doesn't hold up under a direct probe: the Access Matrix only decides what renders on `/dashboard` — `apps/finance-app` has no authorization check at all, so any valid Keycloak session opens it regardless of role — and sessions are never re-checked against Postgres after login, so deleting, demoting, or reassigning a user has no effect until they re-login. `docs/demo-script.md` claimed enforcement that didn't exist; corrected.

Decided: reopen the data model where needed (adding a `Permission` entity is in scope), prioritize making the system's existing claims true over adding new features. This demotes MFA/session-visibility/approval-workflow below — they're real, but they decorate a gate that doesn't exist yet.

Phases, in order (each is its own chunk of work, own tests, own gate run):

0. ✅ **Doc honesty + CI** — done. Fixed the false claims in `demo-script.md`, reconciled doc drift, added `.github/workflows/ci.yml` (lint/typecheck/test/build for both apps on push — uses `./node_modules/.bin/prisma generate`, not `npx prisma`, see the Phase 1 tooling note below).
1. ✅ **Revocation** — done. `requireUserType` (`lib/api-auth.ts`) now re-reads `userType`/`roleId`/`status` from Postgres on every call instead of trusting the session JWT (only refreshed at login); `/dashboard` reads `roleId` the same way. Added `User.status` (ACTIVE/DISABLED, migration `20260911181800_add_user_status_and_indexes`, which also added the 4 missing indexes from finding 12). `signIn` rejects a disabled user at login too. Skipped `tokenVersion` and shortening `session.maxAge` — the direct-DB-read approach makes both redundant, so adding them would be pure extra surface for no correctness gain. 83 tests passing (was 78). Full detail and a real tooling gotcha (`npx prisma` grabbing an incompatible 8.x instead of the pinned 7.x) in `docs/session-log.md`, 2026-09-11.
2. **Real enforcement** — a `POST /api/authz/check` policy-decision endpoint in the portal; `finance-app` gains a `signIn` callback that calls it instead of accepting any Keycloak session. This is what makes the Access Matrix actually gate something outside the portal.
3. **Joiner/mover/leaver** — disable/enable instead of hard delete, promote/demote with last-SuperAdmin and self-demote guards, forced password reset trigger. `AuditLog.userId` stops going `SET NULL` on delete.
4. **Audit log that deserves the name** — structured fields (`targetType`/`targetId`/`metadata`/`outcome`), real `LOGIN_SUCCESS`/`LOGIN_DENIED`/`LOGOUT`/`ACCESS_DENIED` events (today there are zero auth events logged despite the log claiming to cover logins), server-side pagination past the current 100-row cap.
5. **Keycloak done properly** — replace the master-realm admin password grant (`lib/keycloak-admin.ts`) with a realm-scoped service-account client; then the realm-hardening items in B.2/B.3 below, plus token/session lifespans.
6. **Integrity + UI correctness** — FKs changed to match the documented 409-block behavior (today `User.roleId`/`RoleAccess` silently `SET NULL`/`CASCADE`, contradicting `CLAUDE.md`); fix the missing `catch` in every manager's optimistic `fetch` (a network failure today shows a grant as succeeded when nothing was written).
7. **Presentation honesty** — resolve the `/sign-in` page vs middleware inconsistency (middleware bypasses it entirely), decide what to do with the landing page's hardcoded "activity feed"/stats now that Phase 4 makes some of it capable of being real.

## Next candidates (deprioritized until the rebuild above lands)

Ranked for a non-technical demo audience vs implementation effort — kept for after Phase 0-7, not before:

1. **Keycloak MFA/OTP** (B.7, M) — real 2FA login step; mostly realm config. Deliberately not first anymore: a second factor in front of an access matrix that doesn't gate anything yet is a lock on a doorframe with no wall.
2. **Access-request / approval workflow** (C, M) — new feature end-to-end: Employee requests an app, Admin approves/denies. Follows the exact CRUD pattern already used for Roles/Applications/Users; rounds out the RBAC story.
3. **Session visibility + force-logout-other-sessions** (B.8, M) — extends the existing `lib/keycloak-admin.ts` wrapper, genuinely useful security feature.
4. **Keycloak brute-force lockout + password policy** (B.2, B.3, XS each) — pure realm config, near-zero effort, good "we thought about security" checkbox — folded into Phase 5 above.

SCIM/directory sync (C) remains the highest real-world value item but is a full mini-project (L), not a quick add.

## B. Sem3 — stretch (optional, only if time remains, cheapest first)

1. ~~Dark/light theme toggle~~ — done, see Done section above.
2. **(XS)** Keycloak brute-force lockout — realm config only (`keycloak/realm-export.json`), no app code.
3. **(XS)** Keycloak password policy (length/complexity) — realm config only.
4. **(S)** CI pipeline — GitHub Actions running lint + test + `tsc --noEmit` + build on every push. No new runtime deps.
5. **(S)** Test coverage reporting — `@vitest/coverage-v8` dev dep.
6. ~~Dashboard counts~~ — done, see Done section above.
7. **(M)** Keycloak MFA/OTP — mostly realm config; login is already 100% Keycloak-hosted so the apps barely change.
8. **(M)** Session visibility + force-logout-other-sessions — extends the existing `lib/keycloak-admin.ts` wrapper.
9. **(M)** Natural-language search or a simple anomaly callout over the Audit Log — a legitimate enterprise IAM trend if you want something AI-flavored, not a bolt-on for optics. Not urgent.
10. ~~Audit log CSV export~~ — done, see Done section above.

## C. Sem4 — deferred (real scope, bigger architecture)

- **(L)** SCIM / directory sync — auto-provision and (more importantly) auto-*deprovision* users from an external directory instead of creating every account by hand. This is the single biggest capability gap between this project and real enterprise IAM: today an employee leaving means an Admin remembering to delete them, which is exactly the failure mode IGA tools exist to prevent. Scope-control idea: sync from a mock HRIS or a CSV rather than integrating a real BambooHR/Rippling, so the sync *logic* (joiner/mover/leaver, reconciliation, conflict handling) is the deliverable, not vendor API plumbing. See the landscape note below — this is the highest-value Sem4 item.
- **(L)** Fine-grained per-application permissions — today the Access Matrix is binary Role×Application. Read/write-level permissions means revisiting the locked data model in `docs/planning-notes.md`.
- **(M)** Access-request / approval workflow — Employee requests an app, Admin approves/denies. New entity.
- **(M)** Time-bound / auto-expiring access grants.
- **(L)** WebAuthn / passkey login.
- **(L)** E2E tests (Playwright) driving the real browser SSO flow against live Keycloak — needs Postgres + Keycloak up in CI.
- **(M)** Notifications (email instead of one-time on-screen temp password).
- **(M)** Rate limiting / API abuse protection.

## Deployment (only if a persistent public link is ever needed)

Right now: local-first only, shown live via screen-share (`docs/demo-script.md`) — no public URL needed for that path.

If evaluators ever need to verify the project themselves, independent of a live session:

- Checked **Phase Two** (phasetwo.io, hosted/managed Keycloak) — technically a drop-in swap, same vanilla Keycloak underneath, same OIDC. Rejected: free shared-realm tier was discontinued (2026-07-30), cheapest plan now $149/month. Not worth it for a semester demo.
- Plan instead, if needed (all free, zero changes to the app's own code): **Oracle Cloud Always Free** Ampere A1 VM (4 OCPU / 24GB RAM, free forever) running the existing `docker-compose.yml` unchanged, plus a free **DuckDNS** subdomain and **Caddy** for automatic Let's Encrypt TLS.
- Only needed at that point, not before: swap the current dev-placeholder Keycloak client secrets for real ones, update redirect URIs in `keycloak/realm-export.json` from `localhost` to the public domain, set `NEXTAUTH_URL`/`AUTH_URL` for production.
- Not started. Deployment target stays "not decided" per `docs/planning-notes.md` §1 until this is actually acted on.

## Competitive landscape (where this project sits, and deliberately doesn't)

Checked WorkOS (workos.com) as the nearest well-known commercial player. Useful conclusion: **it is not the same product, and should not be used as a feature checklist.**

- **WorkOS** sells identity *infrastructure to SaaS vendors* — APIs/SDKs so their product can accept an enterprise customer's existing IdP. Customers are companies like OpenAI, Cursor, Perplexity. Its pricing unit is a "connection" (~$125/mo each) = one customer org's IdP. Multi-tenancy is not a feature there, it's the entire premise.
- **This project** is the opposite direction: one organization, running its own IdP (Keycloak), governing which of *its* employees reach which internal apps. The real category is **IGA** (Identity Governance & Administration — SailPoint/Saviynt territory), not CIAM/B2B auth infra.
- WorkOS federates *inward* from many external directories on a vendor's behalf. This provisions *outward* from one directory to internal apps. Adjacent domain, inverted architecture.

**Worth borrowing** (all now reflected above): SCIM/directory sync (C, new), MFA (B.7), audit log export (B.10), fine-grained authz (C). **Not applicable**: their Admin Portal self-service (assumes multi-tenant), Radar (bot/fraud), Vault (key management).

## Explicitly never

- **Multi-tenancy** — locked out of scope in `CLAUDE.md`. Don't revisit without changing that file first. Specific trap to watch for: benchmarking against WorkOS (or any B2B auth vendor) makes multi-tenancy look like a missing feature. It isn't — it's a different product category. See the landscape note above before anyone "fixes" this.

## How to use this doc

Check items off as they land. When you decide to build something from B or C this semester, give it its own numbered section (the way A2/A3 were added) rather than letting the list silently grow into an implicit commitment — fold it into **Done** once it ships. Effort tags are rough: XS = under an hour, S = a session, M = a few sessions, L = its own mini-project.
