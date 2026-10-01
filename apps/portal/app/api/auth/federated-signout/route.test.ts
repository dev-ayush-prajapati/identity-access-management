import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/helpers";

const { getTokenMock, signOutMock, logAuditMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  signOutMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({ getToken: getTokenMock }));
vi.mock("@/auth", () => ({ signOut: signOutMock }));
vi.mock("@/lib/audit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return { ...actual, logAudit: logAuditMock };
});

import * as route from "./route";
const { POST } = route;

const URL_ = "http://localhost:3000/api/auth/federated-signout";

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
  delete process.env.AUTH_KEYCLOAK_ISSUER;
  delete process.env.AUTH_KEYCLOAK_ID;
});

describe("POST /api/auth/federated-signout", () => {
  // Phase 0 regression: this route used to be a GET handler that mutated
  // session state, letting a cross-site <img>/<a> force a victim's logout.
  it("exports no GET handler at all", () => {
    expect((route as Record<string, unknown>).GET).toBeUndefined();
  });

  it("audit-logs the logout when the token carries a userId", async () => {
    getTokenMock.mockResolvedValue({ userId: "u1" });

    await POST(jsonRequest(URL_, "POST"));

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "u1", action: "LOGOUT" })
    );
  });

  it("skips logging when there is no valid token (already signed out / forged request)", async () => {
    getTokenMock.mockResolvedValue(null);

    await POST(jsonRequest(URL_, "POST"));

    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("always calls signOut regardless of token state", async () => {
    getTokenMock.mockResolvedValue(null);

    await POST(jsonRequest(URL_, "POST"));

    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
  });

  it("redirects to / when there's no idToken or issuer configured", async () => {
    getTokenMock.mockResolvedValue({ userId: "u1" });

    const res = await POST(jsonRequest(URL_, "POST"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects to Keycloak's end_session_endpoint when idToken and issuer are present", async () => {
    process.env.AUTH_KEYCLOAK_ISSUER = "http://localhost:8080/realms/iam-portal";
    process.env.AUTH_KEYCLOAK_ID = "portal";
    getTokenMock.mockResolvedValue({ userId: "u1", idToken: "the-id-token" });

    const res = await POST(jsonRequest(URL_, "POST"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith("http://localhost:8080/realms/iam-portal/protocol/openid-connect/logout?")).toBe(
      true
    );
    expect(location).toContain("id_token_hint=the-id-token");
    expect(location).toContain("client_id=portal");
  });
});
