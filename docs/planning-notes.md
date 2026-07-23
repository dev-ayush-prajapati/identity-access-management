# Planning Notes

Design decisions locked during planning, before implementation. Kept here so nothing gets lost or re-decided later.

## 1. Requirements (locked)

- **SSO demo**: two apps share one Keycloak realm — `portal` (main app) and `finance-app` (stub). Login once on Portal, open Finance App, no re-login. This is what proves SSO rather than just "login."
- **Roles**: 3-tier hierarchy — SuperAdmin, Admin, Employee.
  - SuperAdmin: creates/manages Admin accounts, manages the Application catalog (which apps exist in the system).
  - Admin: creates/manages Employee accounts, manages Roles (HR/Finance/IT/etc.), manages the Access Matrix, views audit logs.
  - Employee: sees dashboard with only the apps their Role permits.
- **Auth integration**: Auth.js (NextAuth) with Keycloak provider — not raw OIDC/keycloak-js.
- **Deployment target**: not decided yet. Build with Docker Compose so it works local-first and stays portable to a VPS later either way.

## 2. Data model (locked)

Two separate concepts, deliberately split:

- **UserType** (fixed: SuperAdmin / Admin / Employee) — determines which dashboard and management permissions a user gets. Not editable via UI.
- **Role** (dynamic, admin-managed: e.g. HR, Finance, IT, General) — determines which applications show up on a user's dashboard. This is what the Role Management module manages and what the Access Matrix uses as its rows.

Entities:
1. **User** — name, email, UserType, Role, createdBy
2. **UserType** — fixed 3 values
3. **Role** — admin-managed list
4. **Application** — apps in the catalog (Portal, Finance App, ...)
5. **Access Matrix** (Role ↔ Application) — which roles can open which apps
6. **Audit Log** — who did what, when (logins, access changes)

## 3. Screens (locked)

- **Login** — single Keycloak-hosted login page, same for everyone. No role picker.
- **Post-login redirect** — automatic, based on UserType (SuperAdmin → SuperAdmin dashboard, Admin → Admin dashboard, Employee → Employee dashboard). User never picks this manually.
- **Profile** — every user type, view own info.
- **SuperAdmin dashboard** — manage Admins, manage Applications catalog.
- **Admin dashboard** — manage Employees, manage Roles, Access Matrix (grid: Roles × Applications, toggle access), Audit Logs.
- **Employee dashboard** — app tiles, only for apps their Role permits. Clicking a tile navigates to that app's URL; if it's Finance App, Keycloak's shared session logs them in automatically (no second login).
- **Finance App (stub)** — one page: "Logged in as [name] via SSO."

Bootstrap note: the very first SuperAdmin account can't be created through the app (nobody exists yet to create it) — it's created once directly in Keycloak's admin console during setup.

## 4. Project setup (in progress)

- Layout: monorepo, `apps/portal` + `apps/finance-app`, no workspace tooling (kept simple — two independent Next.js apps, no Turborepo/npm workspaces).
- Tools confirmed available: Node 24.18, npm 10.9, Docker 29.6, Compose v5.3, git 2.55.
- `apps/portal` scaffolded: Next.js 16, TypeScript, Tailwind, App Router, ESLint. Default starter page only — no auth/DB/features yet.
- Pending: scaffold `apps/finance-app`, add `docker-compose.yml` (Postgres + Keycloak), wire Prisma.

## Roadmap (7 steps, working through in order)

1. ✅ Finalize requirements
2. ✅ Design data model
3. ✅ UI wireframes
4. 🔄 Project setup (tools ✅, folder layout ✅, portal scaffolded ✅, finance-app + Docker Compose pending)
5. ⏳ Auth/SSO implementation
6. ⏳ Build modules incrementally (users, roles, matrix, audit)
7. ⏳ Testing + documentation
