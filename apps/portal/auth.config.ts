import type { NextAuthConfig } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import type { UserType } from "@/lib/generated/prisma";

// Edge-safe config, used directly by middleware. Must not import Prisma —
// Prisma's client uses Node APIs (node:crypto, process.stdout) that the
// Edge runtime middleware runs in does not support.
export const authConfig: NextAuthConfig = {
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    }),
  ],
  // In local dev, portal and finance-app are both "localhost" (just
  // different ports) — browsers share cookies across ports on the same
  // hostname. Without a distinct name here, finance-app would receive
  // Portal's session cookie and fail to decrypt it (different secret).
  cookies: {
    sessionToken: {
      name: "portal-session-token",
    },
  },
  callbacks: {
    session({ session, token }) {
      // Just copies what the Node-only jwt callback (in auth.ts) already
      // put in the token — no DB access here, safe for the Edge runtime.
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
};
