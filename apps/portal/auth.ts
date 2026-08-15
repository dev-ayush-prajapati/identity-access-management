import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";

// Full config: Node runtime only (route handlers, Server Components).
// Adds the Prisma-dependent callbacks on top of the edge-safe authConfig.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Keycloak proves identity; Postgres decides authorization. A Keycloak
    // login with no matching User row is not allowed into the app.
    async signIn({ profile }) {
      if (!profile?.sub) return false;
      const user = await prisma.user.findUnique({
        where: { keycloakId: profile.sub },
      });
      return !!user;
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
      }
      // Keycloak's id_token is required as id_token_hint on federated
      // logout (see app/api/auth/federated-signout) — without it, signing
      // out only clears our own session cookie and Keycloak's SSO session
      // stays alive, so the next sign-in silently re-authenticates.
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      return token;
    },
  },
});
