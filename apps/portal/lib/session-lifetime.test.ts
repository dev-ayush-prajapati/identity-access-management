import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPastMaxLifespan, SESSION_MAX_AGE_SECONDS } from "./session-lifetime";

const NOW_MS = 1_800_000_000_000;
const now = NOW_MS / 1000;

describe("isPastMaxLifespan", () => {
  it("keeps a session inside the cap", () => {
    expect(isPastMaxLifespan(now - SESSION_MAX_AGE_SECONDS + 60, NOW_MS)).toBe(false);
  });

  it("ends a session past the cap, however active it's been", () => {
    expect(isPastMaxLifespan(now - SESSION_MAX_AGE_SECONDS - 1, NOW_MS)).toBe(true);
  });

  it("fails closed on a session with no auth time", () => {
    expect(isPastMaxLifespan(undefined, NOW_MS)).toBe(true);
  });
});

it("matches the realm's SSO session max lifespan", () => {
  const realm = JSON.parse(
    readFileSync(new URL("../../../keycloak/realm-export.json", import.meta.url), "utf8")
  ) as { ssoSessionMaxLifespan: number };

  expect(SESSION_MAX_AGE_SECONDS).toBe(realm.ssoSessionMaxLifespan);
});
