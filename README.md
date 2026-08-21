# Identity & Access Management Portal

Enterprise IAM demo (MCA Semester 3 project): single-sign-on across two apps via Keycloak, role-based access control via a Role × Application Access Matrix. Single organization — no multi-tenancy.

**Stack**: Next.js 16 (App Router) + TypeScript, Tailwind CSS + shadcn/ui, PostgreSQL + Prisma, Keycloak + Auth.js (NextAuth).

## Structure

- `apps/portal` — main app: SuperAdmin/Admin/Employee dashboards, all RBAC management (Applications, Roles, Users, Access Matrix, Audit Log).
- `apps/finance-app` — stub app that exists solely to prove SSO (one page: "Logged in as [name] via SSO").
- `keycloak/realm-export.json` — realm config (`iam-portal`), auto-imported by Docker Compose.
- `docs/planning-notes.md` — locked design decisions, data model, and the full build history (every real bug hit and how it was fixed).
- `docs/plan.md` — forward-looking task list: what's left for Sem3, optional Sem3 polish, Sem4 backlog.

## Setup

Prereqs: Docker + Docker Compose, Node 20+, npm.

**1. Copy env files** and fill in real values (don't commit them):

```bash
cp .env.example .env
cp apps/portal/.env.example apps/portal/.env
cp apps/finance-app/.env.example apps/finance-app/.env
```

In `apps/portal/.env`, set `SUPERADMIN_NAME` / `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` to real values, and generate a real `AUTH_SECRET` for each app (`openssl rand -base64 32`) — the checked-in `.env.example` values are placeholders only.

**2. Start Postgres + Keycloak:**

```bash
docker compose up -d
```

Postgres (`127.0.0.1:5432`) and Keycloak (`127.0.0.1:8080`) are both bound to loopback only — not reachable from the network. Default credentials in `.env.example` are dev-only; change them before running this anywhere beyond your own machine.

**3. Set up the portal:**

```bash
cd apps/portal
npm install
npx prisma generate       # produces lib/generated/prisma — no postinstall hook wires this up automatically
npx prisma migrate deploy
node scripts/bootstrap-superadmin.ts
```

The bootstrap script creates the first SuperAdmin (Keycloak login + matching Postgres row) — nobody exists yet to create one through the app UI. It's idempotent; safe to re-run.

**4. Set up finance-app** (no database, no Prisma — it only proves SSO):

```bash
cd apps/finance-app
npm install
```

**5. Run both apps** (separate terminals):

```bash
cd apps/portal && npm run dev        # http://localhost:3000
cd apps/finance-app && npm run dev   # http://localhost:3001
```

**6. Log in** at `http://localhost:3000` with the SuperAdmin account. Keycloak forces a password change on first login (the bootstrap script sets a temporary one). Once logged in, open `http://localhost:3001` — that's the actual SSO proof: no second login prompt, because both apps share one Keycloak session.

## Commands

Run from `apps/portal` or `apps/finance-app`:

```bash
npm run dev      # start dev server
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
npm test         # vitest run (apps/portal only — see docs/plan.md)
```

## Docs

- `docs/planning-notes.md` — read before making any architectural change.
- `docs/plan.md` — what to build next.
