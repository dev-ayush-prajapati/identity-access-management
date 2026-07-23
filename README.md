# Identity & Access Management Portal

MCA Semester 3 project demonstrating **Single Sign-On (SSO)** and **Role-Based Access Control (RBAC)** for a single organization.

## What this is

One centralized login (via Keycloak). After login, users land on a dashboard based on their role, and only see/access the applications their role is permitted to use (via an Access Matrix). A second stub app is included to prove SSO actually works across apps, not just within one.

See [`docs/planning-notes.md`](docs/planning-notes.md) for the full design decisions (roles, data model, screens).

## Structure

```
identity-access-management/
  apps/
    portal/         # Main IAM app: auth, dashboards, user/role/app management, access matrix, audit logs
    finance-app/     # Minimal stub app — proves SSO session is shared across apps
  docs/
    planning-notes.md  # Locked design decisions from planning phase
  docker-compose.yml    # Postgres + Keycloak (added in setup phase)
```

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- PostgreSQL + Prisma ORM
- Keycloak (authentication, identity)
- Auth.js (NextAuth) with Keycloak provider

## Status

Project setup in progress. See `docs/planning-notes.md` for what's locked vs. what's still pending.
