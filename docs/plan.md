# Plan

Forward-looking task list: what's left in Sem3, what's optional Sem3 polish, what's deferred to Sem4. `docs/planning-notes.md` stays the record of *locked decisions and what was already built/fixed and why* — this file is just the task list, checked off as things land.

## Process notes

- Work lands on a named branch, one PR per chunk of related work — matches the repo's existing PR-per-feature history without over-fragmenting into a PR per plan item. (Sem3 core landed as `feat/sem3-wrapup` → PR #8; demo readiness as `feat/dashboard-polish` → PR #9.)
- `npm audit` on `apps/portal` flags 13 (2 moderate, 11 high) — checked all of them: every one is either dev-only tooling (ESLint/TypeScript internals, the Prisma *CLI's* bundled deps — not `@prisma/client`) or a build-time transitive dep inside `next` (`postcss`, `sharp`) that only ever processes this project's own source/CSS, never attacker-controlled runtime input. Nothing in the actual request-handling path (no `next-auth`, `@prisma/client`, or `pg` advisory). `npm audit fix` (non-breaking) would clear a few; the rest need `--force` and would downgrade `prisma` or bump `next` outside its stated range — deferred as its own separate pass, not bundled into this branch.

## Done (Sem3 core, demo readiness, UI/UX pass)

Full bug-by-bug history for all three lives in `docs/planning-notes.md`.

- **Sem3 core** — Profile page, Audit Log viewer, Application delete guard, root README, live browser verification (SuperAdmin + Admin accounts). Merged `feat/sem3-wrapup` → PR #8 → `main`.
- **Demo readiness** — `docs/demo-script.md`, dark/light theme toggle, dashboard stat rows. Merged `feat/dashboard-polish` → PR #9 → `main`.
- **UI/UX pass + demo data** (2026-08-28) — landing page, zone layouts + `AppShell`, motion system, command palette, dashboard rebuilds, audit log CSV export, access matrix redesign, employee dashboard/profile redesign, manager screen polish, idempotent `scripts/seed-demo.ts`, finance-app SSO payoff page, bootstrap-superadmin username fix (PR #11). On `feat/sem3-ui-pass`, not yet merged to `main`.

Gate: `npm run lint` / `tsc --noEmit` / `npm run build` clean, `npm test` 78 passing.

Not verified: authenticated screens haven't been clicked through in a browser this session — worth one manual pass before demoing.

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
