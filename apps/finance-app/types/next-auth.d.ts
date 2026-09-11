import type { DefaultSession } from "next-auth";

// keycloakId is what middleware.ts sends to the portal's /api/authz/check on
// every request — it has to survive from the initial sign-in profile into
// the session, the same way the portal's own next-auth.d.ts carries its
// authorization-relevant claims.
declare module "next-auth" {
  interface Session {
    user: {
      keycloakId?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    keycloakId?: string;
  }
}
