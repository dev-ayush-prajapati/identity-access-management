// Hard cap on a portal session: ssoSessionMaxLifespan in
// keycloak/realm-export.json (lib/session-lifetime.test.ts keeps them equal).
//
// Auth.js re-signs the session cookie on every read, so session.maxAge alone
// only ends a session left idle that long — an active one would slide forever.
// This ends it at the cap regardless, counted from the Keycloak login
// (auth_time), so a portal session never outlives the SSO session it came from.
//
// Edge-safe (no imports): middleware's auth.config.ts uses it too.
export const SESSION_MAX_AGE_SECONDS = 10 * 60 * 60;

// No authTime means a cookie minted before this check existed — treat it as
// expired (fail closed); signing in again replaces it.
export function isPastMaxLifespan(authTime: number | undefined, nowMs = Date.now()): boolean {
  return authTime === undefined || nowMs / 1000 - authTime > SESSION_MAX_AGE_SECONDS;
}
