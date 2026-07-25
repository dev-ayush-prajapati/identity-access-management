import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

// No Prisma here — finance-app only exists to prove SSO. Keycloak alone
// is enough: if the browser already has a Keycloak session (from Portal),
// this silently signs the user in with no login form shown.
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
});
