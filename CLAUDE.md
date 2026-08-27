# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Enterprise Identity & Access Management portal (MCA Semester 3 project). Demonstrates SSO (Keycloak, shared across two apps) and RBAC (an Access Matrix mapping Roles to Applications) for a single organization — no multi-tenancy.

Stack: Next.js 16 (App Router) + TypeScript, Tailwind CSS v4 + shadcn/ui, PostgreSQL + Prisma 7, Keycloak 26 + Auth.js v5 (NextAuth beta).

Docs, in the order you'll need them:

- `docs/planning-notes.md` — locked design decisions (roles, data model, screens) **and** the authoritative build log: every real bug hit and how it was fixed. Read before any architectural change; update when a decision changes. Its roadmap section is the real status tracker — trust it over any summary, and verify against actual code.
- `docs/plan.md` — forward-looking task list (Sem3 remaining, Sem3 stretch, Sem4 backlog). Check when asked what to build next.
- `docs/demo-script.md` — presenter walkthrough for non-technical evaluators.
- `README.md` — first-time setup walkthrough (env files → containers → migrate → bootstrap).

## Commands

Monorepo with **no root `package.json`** and no workspace tooling (no npm workspaces/Turborepo) — always `cd apps/portal` (or `apps/finance-app`) before running anything.

**npm only.** Don't introduce a second lockfile.

Containers must be up for anything touching the DB or auth (Postgres `127.0.0.1:5432`, Keycloak `127.0.0.1:8080`):

```bash
docker compose up -d          # from repo root
```

```bash
cd apps/portal
npm run dev                   # dev server → http://localhost:3000
npm run build                 # production build
npm run start
npm run lint                  # eslint
npm test                      # vitest run
npm run test:watch
npx tsc --noEmit              # not an npm script, but the type gate used throughout the docs
```

`apps/finance-app` has the same four Next.js scripts (dev → **port 3001**), no test suite, no Prisma.

Verification gate used by every entry in `docs/planning-notes.md` — run all four before calling work done:

```bash
npm run lint && npx tsc --noEmit && npm run build && npm test
```

### Single test

```bash
npx vitest run app/api/roles/route.test.ts        # one file
npx vitest run -t "403s for an Employee"          # one case by name
```

### Prisma

`lib/generated/prisma` is **gitignored and has no postinstall hook** — a fresh clone won't typecheck until it's generated.

```bash
npx prisma generate                     # required after clone and after any schema.prisma edit
npx prisma migrate dev --name <desc>    # create + apply a migration in dev
npx prisma migrate deploy               # apply existing migrations (setup path)
node scripts/bootstrap-superadmin.ts    # idempotent; creates the first SuperAdmin (Keycloak login + Postgres row)
```

Config lives in `prisma.config.ts` (Prisma 7 style — loads `dotenv`, points at `prisma/schema.prisma`); the schema's datasource has no inline `url`.

## Architecture

Two independent Next.js apps share one Keycloak realm (`iam-portal`, defined in `keycloak/realm-export.json`, auto-imported by Docker Compose):

```
Browser → Next.js API routes (app/api/*) → Prisma → Postgres   [authorization data: users, roles, access matrix, audit log]
Browser → Keycloak (via Auth.js / NextAuth)                     [identity + credentials only]
```

**Keycloak owns identity; Postgres owns authorization.** The `signIn` callback rejects any Keycloak login with no matching `User` row (matched on `keycloakId`) — there is no auto-provisioning. Creating a user therefore means Keycloak account **first** (`lib/keycloak-admin.ts`, random temp password + forced reset), Postgres row second; deleting reverses it. A Keycloak failure must surface as 502 and leave Postgres untouched rather than orphaning a login.

Two orthogonal permission dimensions — don't conflate them:

- **UserType** (fixed enum: `SUPERADMIN` / `ADMIN` / `EMPLOYEE`) — decides which dashboard and which management powers a user gets. Hardcoded, never an editable DB-driven list.
- **Role** (dynamic, admin-managed — HR, Finance, IT…) — decides which Applications appear on an Employee's dashboard. This is the dimension the Access Matrix (`RoleAccess` = Role × Application) governs and what Role Management edits. Admins/SuperAdmins carry no Role.

Tier rule: the tier a caller manages is **derived from the caller's own `userType`** (`managedUserType()` in the users routes), never read from the request body — SuperAdmin manages Admins, Admin manages Employees. Cross-tier access answers **404, not 403**, so it doesn't confirm the row exists.

`apps/finance-app` exists solely to prove SSO: same realm/session, one page, no DB, no business logic — hence no tests.

### Auth: the edge/node split (most common trap)

- `auth.config.ts` — **edge-safe**. Providers + the DB-free `session` callback. Imported directly by `middleware.ts`. **Must never import Prisma**: Prisma's client needs `node:crypto`/`process.stdout`, which the Edge runtime lacks, so pulling it in 500s every protected route.
- `auth.ts` — Node runtime only. Spreads `authConfig` and adds the Prisma-dependent `signIn`/`jwt` callbacks. Used by route handlers and Server Components.

Each app sets a **distinct `cookies.sessionToken.name`** (`portal-session-token` / `financeapp-session-token`). Both apps are `localhost` on different ports and browsers share cookies across ports — without this, one app receives the other's cookie and fails to decrypt it.

Sign-out goes through `app/api/auth/federated-signout/route.ts` (**POST-only**, for CSRF reasons), not Auth.js's default signout — the default only clears the local cookie and leaves Keycloak's SSO session alive, so the next login silently re-authenticates.

### Authorization is enforced in two independent places

1. **Pages** — `middleware.ts`, via the `ZONE_PREFIXES` table (`/superadmin`→SUPERADMIN, `/admin`→ADMIN, `/dashboard`→EMPLOYEE, plus `/profile` for any logged-in user). Adding a protected page means updating both that table (if zoned) and `config.matcher`.
2. **API routes** — `requireUserType([...])` from `@/lib/api-auth` at the top of every handler. The middleware matcher does **not** cover `/api/*`; routes gate themselves.

Hiding a nav link is never authorization. Direct URL navigation and direct API calls must both be blocked.

Every mutation writes an audit row via `logAudit(userId, ACTION, details)` from `@/lib/audit`.

### Server Components that read Prisma

Any page that reads Prisma but makes no direct `cookies()`/`headers()` call needs:

```ts
export const dynamic = "force-dynamic";
```

Without it Next.js prerenders the page as static at build time and `next start` serves frozen DB data forever — invisible in `next dev`. This bit `/admin` and `/superadmin` for real. Confirm the build output marks the route `ƒ (Dynamic)`, not `○`.

## Conventions

- **Import paths**: always the `@/*` alias (maps to each app's own root). Never relative `../../`. The alias is per-app — apps can't import from each other.
- **Prisma types** come from `@/lib/generated/prisma` (the generator's output dir), *not* `@prisma/client`. The shared client singleton is `@/lib/prisma`, which wires the `PrismaPg` driver adapter Prisma 7 requires.
- **shadcn/ui here is `base-nova` style, backed by Base UI — not Radix.** There is no `asChild` prop; use `render={<Button …/>}`. Kokonut UI is registered as `@kokonutui` in `components.json` and installs through the same shadcn CLI.
- **Delete semantics**: a delete that would orphan references returns **409 and blocks** (Role with users, Application with granted access) — never a silent DB cascade.
- **Admin-entered URLs** must pass `isHttpUrl()` from `@/lib/validate-url` before storage; they render as clickable `<a href>` on the Employee dashboard, so a `javascript:`/`data:` URL would be stored XSS.

## Tests

Vitest, `environment: "node"` — pure functions and API route handlers only. No DOM: Server Component/page rendering and `middleware.ts` are manual-verification only, by design.

Pattern (see `app/api/roles/route.test.ts`): `vi.hoisted()` for mock fns, `vi.mock` for **only** the true boundaries — `@/auth`, `@/lib/prisma`, `@/lib/audit`, `@/lib/keycloak-admin`, `next-auth/jwt` — then import the route under test. Real authorization and business logic run unmocked. Session/request fixtures come from `@/test/helpers` (`fakeSession`, `jsonRequest`, `paramsOf`).

Every `app/api/**/route.ts` with logic of its own has a sibling `route.test.ts` (the only exception is `app/api/auth/[...nextauth]/route.ts`, which just re-exports Auth.js's `handlers`). Adding a route means adding one. Run the suite after touching any route or `lib/` function.

## Never do these

- Never call Prisma/Postgres from a client component — server-side only (route handler or Server Component).
- Never import Prisma, directly or transitively, into `auth.config.ts` or `middleware.ts`.
- Never skip a server-side RBAC check on a route because the UI already hides the link to it.
- Never add tenant/multi-tenancy logic — explicitly out of scope. Benchmarking against WorkOS or similar B2B auth vendors makes this look like a missing feature; it isn't (see the landscape note in `docs/plan.md`).
- Never modify shadcn/ui components under `components/ui/` — treat them as vendored.
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
