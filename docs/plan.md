# Plan

Forward-looking task list: what's left in Sem3, what's optional Sem3 polish, what's deferred to Sem4. `docs/planning-notes.md` stays the record of *locked decisions and what was already built/fixed and why* — this file is just the task list, checked off as things land.

## Process notes

- All of this — test suite, doc fixes, plan.md, everything in section A below — lands on one branch (`feat/sem3-wrapup`), one PR at the end. Matches the repo's existing PR-per-feature history without over-fragmenting into a PR per plan item.
- `npm audit` on `apps/portal` flags 13 (2 moderate, 11 high) — checked all of them: every one is either dev-only tooling (ESLint/TypeScript internals, the Prisma *CLI's* bundled deps — not `@prisma/client`) or a build-time transitive dep inside `next` (`postcss`, `sharp`) that only ever processes this project's own source/CSS, never attacker-controlled runtime input. Nothing in the actual request-handling path (no `next-auth`, `@prisma/client`, or `pg` advisory). `npm audit fix` (non-breaking) would clear a few; the rest need `--force` and would downgrade `prisma` or bump `next` outside its stated range — deferred as its own separate pass, not bundled into this branch.

## Status snapshot (2026-08-21)

- **Done + verified** (`npm run lint`, `tsc --noEmit`, `npm run build`, `npm test`, and a live Chrome pass all clean): SSO (Keycloak, portal + finance-app), RBAC (UserType/Role split), Application/Role/User Management, Access Matrix, Employee dashboard, Profile page, Audit Log viewer, Application delete guard, Vitest suite (53 tests over `lib/**` + every `app/api/**/route.ts`). Committed on `feat/sem3-wrapup`. Full history in `docs/planning-notes.md`.
- Live-verified against the real, weeks-old dev containers as the existing SuperAdmin (`ayush`) and an existing Admin (`tester`): login, redirect-by-usertype, `/profile` (both tiers), `/admin` (Roles/Employees/Access Matrix/Audit Log, real historical data). `.env` files created (all three apps).
- `feat/sem3-wrapup` merged into `main` via PR #8 (GitHub UI), branch deleted. Section A below is fully closed.

## A. Sem3 — must finish (closes the existing roadmap)

- [x] Verify + commit the Profile page.
- [x] Verify + commit the Audit Log viewer.
- [x] Application delete guard — brought `DELETE /api/applications/[id]` in line with Role delete's blocked-if-referenced pattern.
- [x] Update `docs/planning-notes.md` roadmap to match.
- [x] Root README.md — setup walkthrough written and verified against the actual scripts/config (docker-compose.yml, .env.example files, package.json, scripts/bootstrap-superadmin.ts).
- [x] Live browser click-through of Profile + Audit Log viewer — done, see `docs/planning-notes.md` step 6.
- [x] Push `feat/sem3-wrapup` + merge PR #8 into `main`.

## A2. Demo readiness (added after realizing the app under-sells itself in a cold demo)

- [x] `docs/demo-script.md` — presenter walkthrough for showing professors: the click-through narrative, what to say at the SSO/audit-log payoff moments, anticipated Q&A, what to do if something breaks mid-demo.
- [x] Dark/light theme toggle (was B.1) — `components/theme-provider.tsx` + `components/theme-toggle.tsx`, wired into `/admin`, `/superadmin`, `/dashboard`, `/profile`. `next-themes` was already installed but had no provider — `components/ui/sonner.tsx` was already calling `useTheme()` into a void.
- [x] Dashboard stat rows (was B.6) — `components/stat-row.tsx`, `/superadmin` shows Applications/Admins counts, `/admin` shows Roles/Employees/Applications counts.

## B. Sem3 — stretch (optional, only if time remains, cheapest first)

1. ~~Dark/light theme toggle~~ — done, see A2.
2. **(XS)** Keycloak brute-force lockout — realm config only (`keycloak/realm-export.json`), no app code.
3. **(XS)** Keycloak password policy (length/complexity) — realm config only.
4. **(S)** CI pipeline — GitHub Actions running lint + test + `tsc --noEmit` + build on every push. No new runtime deps.
5. **(S)** Test coverage reporting — `@vitest/coverage-v8` dev dep.
6. ~~Dashboard counts~~ — done, see A2.
7. **(M)** Keycloak MFA/OTP — mostly realm config; login is already 100% Keycloak-hosted so the apps barely change.
8. **(M)** Session visibility + force-logout-other-sessions — extends the existing `lib/keycloak-admin.ts` wrapper.
9. **(M)** Natural-language search or a simple anomaly callout over the Audit Log — a legitimate enterprise IAM trend if you want something AI-flavored, not a bolt-on for optics. Not urgent.

## C. Sem4 — deferred (real scope, bigger architecture)

- **(L)** Fine-grained per-application permissions — today the Access Matrix is binary Role×Application. Read/write-level permissions means revisiting the locked data model in `docs/planning-notes.md`.
- **(M)** Access-request / approval workflow — Employee requests an app, Admin approves/denies. New entity.
- **(M)** Time-bound / auto-expiring access grants.
- **(L)** WebAuthn / passkey login.
- **(L)** E2E tests (Playwright) driving the real browser SSO flow against live Keycloak — needs Postgres + Keycloak up in CI.
- **(M)** Notifications (email instead of one-time on-screen temp password).
- **(M)** Rate limiting / API abuse protection.

## Explicitly never

- **Multi-tenancy** — locked out of scope in `CLAUDE.md`. Don't revisit without changing that file first.

## How to use this doc

Check items off as they land. Move an item from B or C up into A only when you actually decide to build it this semester — don't let the list silently grow into an implicit commitment. Effort tags are rough: XS = under an hour, S = a session, M = a few sessions, L = its own mini-project.
