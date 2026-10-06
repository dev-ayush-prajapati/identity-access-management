import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { checkAccess } from "@/lib/authz-check";

// No Prisma here — finance-app only exists to prove SSO. Keycloak alone
// is enough: if the browser already has a Keycloak session (from Portal),
// this silently signs the user in with no login form shown.
//
// Being a valid Keycloak identity is not enough to actually use this app,
// though — the Access Matrix in the portal's Postgres decides that, so
// signIn asks the portal live instead of assuming yes. This callback only
// catches it at login time; middleware.ts re-asks on every request after,
// so a grant revoked later doesn't linger for the rest of this session.

// Hard cap: ssoSessionMaxLifespan in keycloak/realm-export.json, counted from
// the Keycloak login (auth_time). Same rule as the portal's
// lib/session-lifetime.ts (tested there) — session.maxAge alone only ends an
// idle session, since Auth.js re-signs the cookie on every read.
const SESSION_MAX_AGE_SECONDS = 10 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    }),
  ],
  // In local dev, finance-app and portal are both "localhost" (just
  // different ports) — browsers share cookies across ports on the same
  // hostname. Without a distinct name here, this app would receive
  // Portal's session cookie and fail to decrypt it (different secret).
  cookies: {
    sessionToken: {
      name: "financeapp-session-token",
    },
  },
  session: { maxAge: SESSION_MAX_AGE_SECONDS },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.sub) return false;
      const decision = await checkAccess(profile.sub, "signIn");
      return decision.allow;
    },
    async jwt({ token, profile }) {
      if (profile?.sub) {
        token.keycloakId = profile.sub;
        token.authTime =
          typeof profile.auth_time === "number" ? profile.auth_time : Math.floor(Date.now() / 1000);
      }
      // null clears the session; no authTime (a pre-cap cookie) fails closed.
      // Cast: same next-auth/jwt augmentation gap as the session callback below.
      const authTime = token.authTime as number | undefined;
      const expired = authTime === undefined || Date.now() / 1000 - authTime > SESSION_MAX_AGE_SECONDS;
      return expired ? null : token;
    },
    session({ session, token }) {
      // Same Auth.js v5 typing gap the portal's auth.config.ts hit: this
      // callback's `token` param doesn't pick up the next-auth/jwt module
      // augmentation, so it types as `{}` here despite jwt() above setting
      // it — explicit cast, not a real type gap in the augmentation itself.
      const keycloakId = token.keycloakId as string | undefined;
      if (keycloakId) {
        session.user.keycloakId = keycloakId;
      }
      return session;
    },
  },
});
