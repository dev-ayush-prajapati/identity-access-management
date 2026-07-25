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

## 4. Project setup (done)

- Layout: monorepo, `apps/portal` + `apps/finance-app`, no workspace tooling (kept simple — two independent Next.js apps, no Turborepo/npm workspaces).
- Tools confirmed available: Node 24.18, npm 10.9, Docker 29.6, Compose v5.3, git 2.55.
- Both apps scaffolded: Next.js 16, TypeScript, Tailwind, App Router, ESLint. Default starter pages only — no auth/RBAC features yet.
- `docker-compose.yml` at root: Postgres 16 (port 5432) + Keycloak 26 in dev mode (port 8080), both with persisted volumes. `.env.example` documents the vars.
- Prisma wired in `apps/portal`: schema matches the data model above (User, UserType, Role, Application, RoleAccess = Access Matrix, AuditLog). Initial migration applied and verified against the running Postgres container. Client generated to `lib/generated/prisma`.
- Not yet done: Keycloak realm/client configuration, Auth.js wiring — that's step 5.

## Roadmap (7 steps, working through in order)

1. ✅ Finalize requirements
2. ✅ Design data model
3. ✅ UI wireframes
4. ✅ Project setup (both apps scaffolded, Docker Compose up, Prisma wired + migrated)
5. 🔄 Auth/SSO implementation
   - ✅ 5a: Keycloak realm `iam-portal` defined in `keycloak/realm-export.json`, auto-imported by Docker Compose (`start-dev --import-realm`). Two confidential clients: `portal` (redirect `http://localhost:3000/*`) and `finance-app` (redirect `http://localhost:3001/*`). Client secrets are dev-only placeholders (`*-dev-secret-change-me`) — fine for local, must rotate for anything beyond localhost. No realm roles/users defined — Keycloak only handles identity; UserType/Role stay in Postgres per the architecture split.
   - ✅ 5b: bootstrap first SuperAdmin. `scripts/bootstrap-superadmin.ts` creates the Keycloak account (temp password, forced reset) + matching Postgres `User` row (userType SUPERADMIN), linked by keycloakId. Reads name/email/password from env, idempotent (skips if already exists). Along the way: Prisma 7 requires an explicit driver adapter to connect — switched generator from `prisma-client` to `prisma-client-js`, added `@prisma/adapter-pg`, and introduced `lib/prisma.ts` as the shared singleton client used by the app and scripts alike.
   - ✅ 5c: Auth.js v5 (beta — needed for App Router + middleware, v4 doesn't fit) + Keycloak provider wired in `apps/portal` (`auth.ts`, route handler at `app/api/auth/[...nextauth]/route.ts`). Fully verified end-to-end by hand: sign-in → Keycloak login → forced password reset → lands back on Portal logged in, `/api/auth/session` returns the session.
   - ✅ 5d: `auth.ts` callbacks — `signIn` rejects any Keycloak login with no matching Postgres User (keycloakId lookup); `jwt` attaches userId/userType/roleId to the token on initial sign-in; `session` exposes them on `session.user`. No auto-create — a User row must already exist (created by SuperAdmin/Admin, or the bootstrap script). Verified live: `/api/auth/session` returns `userType: "SUPERADMIN"`, `roleId: null` for the bootstrapped account. Hit a real Auth.js v5 typing gap (session-callback's `token` param doesn't pick up the `next-auth/jwt` module augmentation) — fixed with explicit casts, documented inline. Also excluded `lib/generated/prisma` from ESLint (generated code was failing lint).
   - ✅ 5e: `middleware.ts` protects `/superadmin/*` (SUPERADMIN), `/admin/*` (ADMIN), `/dashboard/*` (EMPLOYEE), `/profile/*` (any logged-in user) — matcher-scoped, everything else passes through untouched. Not logged in → redirect to sign-in with callbackUrl; wrong userType for a zone → redirect to `/`. Minimal placeholder pages created under each prefix just to prove the middleware (real content is step 6).
     - Hit a real Auth.js v5 + Prisma conflict: middleware runs in the Edge runtime, which can't load Prisma's client (uses `node:crypto`, `process.stdout`) — importing `auth.ts` from `middleware.ts` caused 500s on every protected route. Fixed with the standard split: `auth.config.ts` (edge-safe — providers + the DB-free `session` callback) used directly by `middleware.ts`; `auth.ts` (Node-only — adds the Prisma-dependent `signIn`/`jwt` callbacks) used by route handlers/Server Components. Verified: all 4 zones behave correctly, both unauthenticated (curl) and authenticated (manual browser test) cases.
   - ⏳ 5f: minimal Auth.js in `apps/finance-app` to prove SSO
   - ⏳ 5g: post-login redirect by UserType
6. ⏳ Build modules incrementally (users, roles, matrix, audit) — note: User Management will need a Keycloak Admin API wrapper, since creating a user in-app auto-creates their Keycloak login (temp password, forced reset on first login)
7. ⏳ Testing + documentation
