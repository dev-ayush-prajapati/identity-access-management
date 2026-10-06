import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findKeycloakUserIdByEmail,
  generateTempPassword,
  setKeycloakUserEnabled,
  setKeycloakUserName,
} from "./keycloak-admin";

// The one thing this wrapper must get right beyond the REST shapes: which
// identity it acts as. It used to be Keycloak's master `admin` (power over the
// whole installation); it must now be this realm's `portal-admin` service
// account, which can only manage this realm's users.

const fetchMock = vi.fn();

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("KEYCLOAK_BASE_URL", "http://kc:8080");
  vi.stubEnv("KEYCLOAK_REALM", "iam-portal");
  vi.stubEnv("KEYCLOAK_ADMIN_CLIENT_ID", "portal-admin");
  vi.stubEnv("KEYCLOAK_ADMIN_CLIENT_SECRET", "s3cret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("keycloak-admin authentication", () => {
  it("signs in as the realm's portal-admin service account, never the master admin", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await setKeycloakUserEnabled("kc-1", false);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("http://kc:8080/realms/iam-portal/protocol/openid-connect/token");
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body))).toEqual({
      grant_type: "client_credentials",
      client_id: "portal-admin",
      client_secret: "s3cret",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/realms/master"))).toBe(false);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer tok");
  });

  it("fails before calling Keycloak when the service-account secret is missing", async () => {
    vi.stubEnv("KEYCLOAK_ADMIN_CLIENT_SECRET", "");

    await expect(setKeycloakUserEnabled("kc-1", false)).rejects.toThrow("KEYCLOAK_ADMIN_CLIENT_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("findKeycloakUserIdByEmail", () => {
  // By email, not username — the first SuperAdmin's Keycloak username predates
  // usernames being set to the email, and a username lookup missed it.
  it("returns the id of an exact email match", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "kc-9" }]), { status: 200 }));

    await expect(findKeycloakUserIdByEmail("a@b.com")).resolves.toBe("kc-9");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://kc:8080/admin/realms/iam-portal/users?email=a%40b.com&exact=true"
    );
  });

  it("returns null when there's no such user", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));

    await expect(findKeycloakUserIdByEmail("x@y.com")).resolves.toBeNull();
  });
});

describe("setKeycloakUserName", () => {
  // finance-app shows Keycloak's firstName + lastName; the portal has one name.
  it("puts the whole name in firstName and clears lastName", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await setKeycloakUserName("kc-1", "Rohan Mehta");

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("http://kc:8080/admin/realms/iam-portal/users/kc-1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ firstName: "Rohan Mehta", lastName: "" });
  });

  it("throws when Keycloak rejects the rename", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response("bad name", { status: 400 }));

    await expect(setKeycloakUserName("kc-1", "x")).rejects.toThrow("Failed to rename the Keycloak account");
  });
});

describe("generateTempPassword", () => {
  // Keycloak rejects a password that breaks the realm's policy, so a temp
  // password shorter than its length(N) would fail every user create/reset.
  it("meets the realm password policy's minimum length", () => {
    const realm = JSON.parse(
      readFileSync(new URL("../../../keycloak/realm-export.json", import.meta.url), "utf8")
    ) as { passwordPolicy: string };
    const minLength = Number(/length\((\d+)\)/.exec(realm.passwordPolicy)?.[1]);

    expect(minLength).toBeGreaterThan(0);
    expect(generateTempPassword().length).toBeGreaterThanOrEqual(minLength);
  });
});
