import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { evaluateSignIn } from "@/lib/evaluate-sign-in";
import { isPastMaxLifespan } from "@/lib/session-lifetime";

// Full config: Node runtime only (route handlers, Server Components).
// Adds the Prisma-dependent callbacks on top of the edge-safe authConfig.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Keycloak proves identity; Postgres decides authorization. A Keycloak
    // login with no matching, active User row is not allowed into the app —
    // this is also where a disabled account is turned away, not just at the
    // API layer. The actual decision (and its audit logging) lives in
    // lib/evaluate-sign-in.ts, unit-tested there — this callback is just the
    // NextAuth wiring around it.
    async signIn({ profile }) {
      return evaluateSignIn(profile?.sub);
    },
    // `profile`/`account` are only present on the initial sign-in request;
    // on later requests (token refresh) we just pass the token through
    // unchanged.
    async jwt({ token, profile, account }) {
      if (profile?.sub) {
        const user = await prisma.user.findUnique({
          where: { keycloakId: profile.sub },
        });
        if (user) {
          token.userId = user.id;
          token.userType = user.userType;
          token.roleId = user.roleId;
        }
        // When the user actually authenticated at Keycloak — the start of
        // the SSO session this one hangs off (see lib/session-lifetime.ts).
        token.authTime =
          typeof profile.auth_time === "number" ? profile.auth_time : Math.floor(Date.now() / 1000);
      }
      // Keycloak's id_token is required as id_token_hint on federated
      // logout (see app/api/auth/federated-signout) — without it, signing
      // out only clears our own session cookie and Keycloak's SSO session
      // stays alive, so the next sign-in silently re-authenticates.
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      return isPastMaxLifespan(token.authTime) ? null : token;
    },
  },
});
