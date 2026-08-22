import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getTokenMock, signOutMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));
vi.mock("@/auth", () => ({ signOut: signOutMock }));

import * as routeModule from "./route";
const { POST } = routeModule;

const URL_ = "http://localhost:3000/api/auth/federated-signout";

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
  vi.stubEnv("AUTH_KEYCLOAK_ISSUER", "http://localhost:8080/realms/iam-portal");
  vi.stubEnv("AUTH_KEYCLOAK_ID", "portal");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("exposes no GET handler (CSRF regression: sign-out must not be reachable via a cross-site navigation)", () => {
  expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
});

it("ends the local session and redirects to Keycloak's end-session endpoint", async () => {
  getTokenMock.mockResolvedValue({ idToken: "kc-id-token" });

  const res = await POST(new NextRequest(URL_, { method: "POST" }));

  expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);

  const location = new URL(res.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(
    "http://localhost:8080/realms/iam-portal/protocol/openid-connect/logout"
  );
  expect(location.searchParams.get("id_token_hint")).toBe("kc-id-token");
  expect(location.searchParams.get("client_id")).toBe("portal");
  expect(location.searchParams.get("post_logout_redirect_uri")).toBe("http://localhost:3000/");
});

it("falls back to a plain redirect home when there's no Keycloak id_token", async () => {
  getTokenMock.mockResolvedValue(null);

  const res = await POST(new NextRequest(URL_, { method: "POST" }));

  expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
  expect(res.headers.get("location")).toBe("http://localhost:3000/");
});
