# Demo Script

For showing this to professors/evaluators. The point: this isn't "a login screen" — it's SSO + RBAC + an audit trail, and the click-through below is what proves each of those, not just claims it. Say the bracketed lines out loud; they're the parts a screen alone doesn't communicate.

## Before you start

- `docker compose up -d` (Postgres + Keycloak) — confirm with `docker ps`.
- `cd apps/portal && npm run dev` (port 3000) and `cd apps/finance-app && npm run dev` (port 3001), both running.
- Two browser windows side by side if possible (or two tabs) — makes the SSO moment visible without switching back and forth.
- Know your SuperAdmin login. Toggle the theme (top-right icon) to whichever looks better on the projector before you start — don't fumble with it mid-demo.

## The walkthrough

**1. Sign in as SuperAdmin.**
Click Sign in → Keycloak's own hosted login page.
> "This isn't a login form we built — it's Keycloak, a real identity provider. The app never sees the password."

**2. Land on the SuperAdmin dashboard.**
Point at the stat row (Applications / Admins), then the Application Catalog.
> "SuperAdmin's job is narrow on purpose: manage the app catalog, and create Admin accounts. Doesn't touch Roles or Employees — that's the next tier down."

**3. Create an Application** (if one isn't already there worth showing) — e.g. "Finance App", `http://localhost:3001`.
> "This is what the Access Matrix, one screen over, will map Roles against."

**4. Sign out. Sign in as an Admin.**
Sign-out is two clicks, not one — click your app's "Sign out", then Keycloak shows its *own* "Do you want to log out?" page, click its blue **Logout** button too. *Then* you land back on the sign-in screen. Don't stop after the first click.
> "That popup is Keycloak itself confirming the logout — a real identity provider, not something we built. It's proof this app never touches your password; Keycloak owns the whole session."
Then sign in as an Admin.
> "Different account, different Keycloak login, different permissions — same portal."

**5. Admin dashboard: Roles → Employees → Access Matrix, in that order.**
- Create a Role (e.g. "Finance").
- Create an Employee, assign them that Role.
- In the Access Matrix, check the box granting "Finance" access to the app you created in step 3.
> "Two separate ideas: UserType decides what an account can *manage* — SuperAdmin, Admin, Employee. Role decides what an Employee *sees*. The Access Matrix is the only place those two connect."

**6. Scroll to the Audit Log. Don't skip this.**
> "Every single thing I just did is already sitting here — who, what, when. That's not a demo feature, it's writing to this table on every create/update/delete in the whole app."

**7. Sign out (same two clicks as step 4). Sign in as the Employee you just created.**
Land on their dashboard — only the one app tile shows.
> "This is the payoff of the Access Matrix — they see exactly what their Role grants, nothing else, and it's enforced server-side, not just hidden in the UI."

**8. Click the app tile — Finance App opens on port 3001. No login prompt.**
This is the moment. Let it land.
> "That's the actual SSO proof. Two independent Next.js apps, one shared Keycloak session. Logged in once."

**9. Back in the portal, hit `/profile`.**
> "Every account — any tier — gets a real profile screen, not just a dashboard."

## If they ask

- **"Isn't this just a login page?"** — No: it's an identity provider (Keycloak) shared across two apps, a three-tier permission model, a Role-based access matrix enforced on every API route (not just hidden UI), and a full audit trail. The login screen is the smallest part of it.
- **"What's actually hard about this?"** — Getting SSO to work across two apps (shared session, distinct cookies, federated logout closing both sessions), and making sure authorization can't be bypassed by hitting an API route directly instead of clicking through the UI — every route checks the caller's permissions itself.
- **"Is it tested?"** — 53 automated tests over every API route and the security-relevant logic (`npm test`), plus this was just walked through live.

## If something breaks mid-demo

- Blank/error page → check both dev servers are still running, `docker ps` shows both containers up.
- Stuck on a Keycloak "Do you want to log out?" page → click its blue **Logout** button. Normal, not a bug — it's a second click, not a redirect failure.
- Wrong dashboard after login → that's the post-login redirect working correctly, it's routing you by account tier, not a glitch.
