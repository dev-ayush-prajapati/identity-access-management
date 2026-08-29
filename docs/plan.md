# Plan

Forward-looking task list: what's left in Sem3, what's optional Sem3 polish, what's deferred to Sem4. `docs/planning-notes.md` stays the record of *locked decisions and what was already built/fixed and why* — this file is just the task list, checked off as things land.

## Process notes

- Work lands on a named branch, one PR per chunk of related work — matches the repo's existing PR-per-feature history without over-fragmenting into a PR per plan item. (Section A landed as `feat/sem3-wrapup` → PR #8; A2 as `feat/dashboard-polish`.)
- `npm audit` on `apps/portal` flags 13 (2 moderate, 11 high) — checked all of them: every one is either dev-only tooling (ESLint/TypeScript internals, the Prisma *CLI's* bundled deps — not `@prisma/client`) or a build-time transitive dep inside `next` (`postcss`, `sharp`) that only ever processes this project's own source/CSS, never attacker-controlled runtime input. Nothing in the actual request-handling path (no `next-auth`, `@prisma/client`, or `pg` advisory). `npm audit fix` (non-breaking) would clear a few; the rest need `--force` and would downgrade `prisma` or bump `next` outside its stated range — deferred as its own separate pass, not bundled into this branch.

## Status snapshot (2026-08-21)

- **Done + verified** (`npm run lint`, `tsc --noEmit`, `npm run build`, `npm test`, and a live Chrome pass all clean): SSO (Keycloak, portal + finance-app), RBAC (UserType/Role split), Application/Role/User Management, Access Matrix, Employee dashboard, Profile page, Audit Log viewer, Application delete guard, Vitest suite (67 tests over `lib/**` + every `app/api/**/route.ts`). Committed on `feat/sem3-wrapup`. Full history in `docs/planning-notes.md`.
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

## A3. UI/UX pass + demo data (2026-08-28)

Added after opening the app on a fresh database and finding every screen empty — the app under-sold itself not because features were missing, but because nothing was on screen and nothing said what to do next.

- [x] Landing page — replaced the `create-next-app` leftover (a title and a button) with a real one: what the platform is, an animated Access Matrix preview, how it works, feature cards.
- [x] Zone layouts + shared `AppShell` — sidebar nav, zone badge, account controls; admin/superadmin split into dedicated sub-pages.
- [x] Motion system in `app/globals.css` (`.animate-fade-up/-fade-in/-scale-in/-pop`, `.stagger`, `.skeleton-shimmer`) plus shared primitives in `components/common/` (`EmptyState`, `AnimatedNumber`, `Skeleton`, `RelativeTime`, `ConfirmDialog`). All motion is gated behind `prefers-reduced-motion` and the un-animated state is always the final state. No new dependencies — CSS only.
- [x] Command palette (Cmd/Ctrl+K) — navigation, theme, sign out. Sign out routes through the existing POST-only federated endpoint.
- [x] Overview dashboards — linkable stat cards that count up, a **setup checklist** that surfaces exactly one next action on an empty database, and a 14-day audit activity chart built from plain divs.
- [x] Audit log — action badges coloured by verb, relative timestamps, client-side search + category filters, and **CSV export** (`GET /api/audit-log/export`, closes B.10). The export writes its own audit row.
- [x] Access matrix — `aria-pressed` toggle buttons instead of checkboxes, per-row/column grant counts, live total, sticky role column. Same PATCH contract and optimistic revert as before.
- [x] Employee dashboard + profile — app tiles with monograms, distinct empty states for no-role vs no-grants, and a per-tier "what your account can do" section.
- [x] Manager screens — `window.confirm` replaced with a styled pending-aware dialog; empty states that link to the create action; route-level loading skeletons on all 10 data routes.
- [x] `scripts/seed-demo.ts` — idempotent seeder: 4 roles, 5 applications, a deliberately lopsided matrix (11 of 20 pairs), 1 admin, 6 employees, and audit entries backdated across 14 days. Keycloak account before Postgres row, so a failure never orphans a login. Prints one-use temp passwords. Verified: 27 created on first run, 27 skipped on the second.
- [x] `apps/finance-app` — the SSO payoff used to land on a bare heading. Now states the session facts (identity provider, its distinct cookie, no password entered here) with a Portal → Keycloak → Finance App diagram. Still no DB and no business logic, by design.
- [x] Fixed `scripts/bootstrap-superadmin.ts` using the display name as the Keycloak username — a name with a space is rejected (`error-username-invalid-character`), so the SuperAdmin was silently never created and login always failed. Now uses email, matching `lib/keycloak-admin.ts`. Merged as PR #11.

Gate: `npm run lint` clean, `npx tsc --noEmit` clean, `npm run build` clean (every data route still `ƒ (Dynamic)`), `npm test` 78 passing (was 67 — the export route added 11).

Not verified: the authenticated screens have not been clicked through in a browser this session (no browser tooling available), only type-checked, built, and unit-tested. Worth one manual pass before demoing.

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
10. ~~Audit log CSV export~~ — done, see A3.

## C. Sem4 — deferred (real scope, bigger architecture)

- **(L)** SCIM / directory sync — auto-provision and (more importantly) auto-*deprovision* users from an external directory instead of creating every account by hand. This is the single biggest capability gap between this project and real enterprise IAM: today an employee leaving means an Admin remembering to delete them, which is exactly the failure mode IGA tools exist to prevent. Scope-control idea: sync from a mock HRIS or a CSV rather than integrating a real BambooHR/Rippling, so the sync *logic* (joiner/mover/leaver, reconciliation, conflict handling) is the deliverable, not vendor API plumbing. See the landscape note below — this is the highest-value Sem4 item.
- **(L)** Fine-grained per-application permissions — today the Access Matrix is binary Role×Application. Read/write-level permissions means revisiting the locked data model in `docs/planning-notes.md`.
- **(M)** Access-request / approval workflow — Employee requests an app, Admin approves/denies. New entity.
- **(M)** Time-bound / auto-expiring access grants.
- **(L)** WebAuthn / passkey login.
- **(L)** E2E tests (Playwright) driving the real browser SSO flow against live Keycloak — needs Postgres + Keycloak up in CI.
- **(M)** Notifications (email instead of one-time on-screen temp password).
- **(M)** Rate limiting / API abuse protection.

## Competitive landscape (where this project sits, and deliberately doesn't)

Checked WorkOS (workos.com) as the nearest well-known commercial player. Useful conclusion: **it is not the same product, and should not be used as a feature checklist.**

- **WorkOS** sells identity *infrastructure to SaaS vendors* — APIs/SDKs so their product can accept an enterprise customer's existing IdP. Customers are companies like OpenAI, Cursor, Perplexity. Its pricing unit is a "connection" (~$125/mo each) = one customer org's IdP. Multi-tenancy is not a feature there, it's the entire premise.
- **This project** is the opposite direction: one organization, running its own IdP (Keycloak), governing which of *its* employees reach which internal apps. The real category is **IGA** (Identity Governance & Administration — SailPoint/Saviynt territory), not CIAM/B2B auth infra.
- WorkOS federates *inward* from many external directories on a vendor's behalf. This provisions *outward* from one directory to internal apps. Adjacent domain, inverted architecture.

**Worth borrowing** (all now reflected above): SCIM/directory sync (C, new), MFA (B.7), audit log export (B.10), fine-grained authz (C). **Not applicable**: their Admin Portal self-service (assumes multi-tenant), Radar (bot/fraud), Vault (key management).

## Explicitly never

- **Multi-tenancy** — locked out of scope in `CLAUDE.md`. Don't revisit without changing that file first. Specific trap to watch for: benchmarking against WorkOS (or any B2B auth vendor) makes multi-tenancy look like a missing feature. It isn't — it's a different product category. See the landscape note above before anyone "fixes" this.

## How to use this doc

Check items off as they land. Move an item from B or C up into A only when you actually decide to build it this semester — don't let the list silently grow into an implicit commitment. Effort tags are rough: XS = under an hour, S = a session, M = a few sessions, L = its own mini-project.
