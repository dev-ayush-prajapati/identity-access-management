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
    // `profile` is only present on the initial sign-in request; on later
    // requests (token refresh) we just pass the token through unchanged.
    async jwt({ token, profile }) {
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
      return token;
    },
  },
});
