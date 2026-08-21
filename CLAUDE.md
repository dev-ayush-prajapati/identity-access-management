# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Enterprise Identity & Access Management portal (MCA Semester 3 project). Demonstrates SSO (Keycloak, shared across two apps) and RBAC (an Access Matrix mapping Roles to Applications) for a single organization — no multi-tenancy.

All locked design decisions (roles, data model, screens, roadmap) live in `docs/planning-notes.md` — read it before making architectural changes, and update it when a decision changes. `docs/plan.md` is the separate forward-looking task list (Sem3 remaining work, Sem3 stretch, Sem4 backlog) — check it too when asked what to build next.

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS + shadcn/ui, PostgreSQL + Prisma, Keycloak + Auth.js (NextAuth).

## Current status

Mid-build, past scaffold stage. Both apps wired to one Keycloak realm (SSO working), Postgres + Prisma in `apps/portal`, Auth.js v5 with edge/node config split. RBAC modules built: Application Management, Role Management, User Management, Access Matrix, Employee dashboard — each with server-side `requireUserType` checks and audit logging. Still open: Profile page, Audit Log viewer, and step 7 (tests + docs) hasn't started. `docs/planning-notes.md`'s roadmap section is the authoritative, up-to-date step tracker — check it, and verify against actual code, rather than trusting this summary as it ages.

## Commands

Repo is a monorepo with no root `package.json` and no workspace tooling (no npm workspaces/Turborepo) — always `cd apps/portal` (or the relevant app) before running anything.

```bash
cd apps/portal
npm run dev      # start dev server
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
npm test         # vitest run (apps/portal only — see below)
```

`apps/portal` has a Vitest suite (`lib/**`, `app/api/**/route.ts`, mocking only `@/auth` / `@/lib/prisma` / `@/lib/audit` / `@/lib/keycloak-admin`) — run it after touching any API route or `lib/` function. No test suite in `apps/finance-app` (it has no business logic to test — see Architecture).

**npm only** — this project uses npm (not yarn/pnpm). Don't introduce a second lockfile.

## Architecture (target)

Two independent Next.js apps share one Keycloak realm:

```
Browser → Next.js API routes (app/api/*) → Prisma → Postgres   [app data: users, roles, access matrix, audit log]
Browser → Keycloak (via Auth.js / NextAuth)                     [identity + login only]
```

- **UserType** (fixed: SuperAdmin / Admin / Employee) — decides which dashboard and management permissions a user gets. Hardcoded, not an editable DB-driven list.
- **Role** (dynamic, admin-managed — e.g. HR, Finance, IT) — decides which Applications appear on a user's dashboard. This is the dimension the Access Matrix (Role × Application) governs, and what the Role Management module edits.
- Never add tenant/multi-tenancy logic — explicitly out of scope for this project.
- Authorization must be enforced server-side (middleware / API route checks) on every protected route — hiding a nav link is not enough; direct URL navigation to an unauthorized page must also be blocked.
- `apps/finance-app` exists solely to prove SSO: it shares the same Keycloak realm/session as `apps/portal`, so a user already logged into Portal is not asked to log in again there.

## Import paths

Always use the `@/*` alias (configured in each app's `tsconfig.json`). Never use relative `../../` imports.

## Never do these

- Never call Prisma/Postgres from a client component — server-side only (API route handler or Server Component).
- Never skip a server-side RBAC check on a route because the UI already hides the link to it.
- Never modify shadcn/ui components directly once added under `components/ui/` — treat them as vendored.
- Don't install new packages without asking first.
- Don't touch files unrelated to the current task — no silent refactors.
- Before fixing a build/type error in one file, search for all other usages of what you're changing — don't fix it in isolation.

## Git commit messages

Body uses bullet points, not paragraph prose. Skip the body entirely for commits simple enough not to need one. Subject line stays a single line, no bullet.

```
❌ Wrong
feat: add access matrix toggle

This change adds the ability to toggle role/application access
from the admin dashboard by adding a checkbox grid component and
wiring it to a new API route that updates the matrix table.

✅ Correct
feat: add access matrix toggle

- Add checkbox grid component for Role x Application matrix
- Wire toggle to new PATCH /api/access-matrix route
```
