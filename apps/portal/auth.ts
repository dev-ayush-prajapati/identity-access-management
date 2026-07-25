import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { prisma } from "@/lib/prisma";
import type { UserType } from "@/lib/generated/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    }),
  ],
  callbacks: {
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
    // requests (token refresh, middleware) we just pass the token through.
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
    async session({ session, token }) {
      // The jwt callback above is what actually populates these fields;
      // Auth.js v5's session-callback token type doesn't pick up the
      // next-auth/jwt module augmentation, so cast rather than re-declare.
      const userId = token.userId as string | undefined;
      const userType = token.userType as UserType | undefined;
      const roleId = token.roleId as string | null | undefined;
      if (userId && userType !== undefined) {
        session.user.id = userId;
        session.user.userType = userType;
        session.user.roleId = roleId ?? null;
      }
      return session;
    },
  },
});
