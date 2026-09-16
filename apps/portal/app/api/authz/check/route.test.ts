import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest } from "@/test/helpers";

const { prismaMock, logAuditMock } = vi.hoisted(() => ({
  prismaMock: {
    application: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    roleAccess: { findFirst: vi.fn() },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { POST } from "./route";

const URL_ = "http://localhost:3000/api/authz/check";
const SECRET = "test-secret";
const AUTH_HEADER = { Authorization: `Bearer ${SECRET}` };

const FINANCE_APP = { id: "app-1", name: "Finance App", url: "http://localhost:3001" };

function body(overrides: Partial<{ keycloakId: string; origin: string; trigger: string }> = {}) {
  return { keycloakId: "kc-1", origin: "http://localhost:3001", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTHZ_SERVICE_SECRET = SECRET;
  prismaMock.application.findMany.mockResolvedValue([FINANCE_APP]);
});

afterEach(() => {
  delete process.env.AUTHZ_SERVICE_SECRET;
});

describe("service-secret gate", () => {
  it("500s when the server has no secret configured", async () => {
    delete process.env.AUTHZ_SERVICE_SECRET;

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));

    expect(res.status).toBe(500);
  });

  it("401s when no Authorization header is sent", async () => {
    const res = await POST(jsonRequest(URL_, "POST", body()));

    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("401s when the secret is wrong", async () => {
    const res = await POST(jsonRequest(URL_, "POST", body(), { Authorization: "Bearer nope" }));

    expect(res.status).toBe(401);
  });
});

describe("request validation", () => {
  it("400s when keycloakId is missing", async () => {
    const res = await POST(jsonRequest(URL_, "POST", body({ keycloakId: "" }), AUTH_HEADER));

    expect(res.status).toBe(400);
  });

  it("400s when origin is missing", async () => {
    const res = await POST(jsonRequest(URL_, "POST", body({ origin: "" }), AUTH_HEADER));

    expect(res.status).toBe(400);
  });
});

describe("decision", () => {
  it("denies with unknown_application when no Application is registered at that origin", async () => {
    prismaMock.application.findMany.mockResolvedValue([]);

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: false, reason: "unknown_application" });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("denies with no_account when the Keycloak identity has no matching User row", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: false, reason: "no_account" });
  });

  it("denies with disabled for a disabled user, regardless of role/grant", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "DISABLED",
      userType: "EMPLOYEE",
      roleId: "r1",
    });

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: false, reason: "disabled" });
    expect(prismaMock.roleAccess.findFirst).not.toHaveBeenCalled();
  });

  it("denies with wrong_user_type for an Admin — only Employees carry a Role", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "ACTIVE",
      userType: "ADMIN",
      roleId: null,
    });

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: false, reason: "wrong_user_type" });
  });

  it("denies with no_role for an Employee who has no Role assigned", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "ACTIVE",
      userType: "EMPLOYEE",
      roleId: null,
    });

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: false, reason: "no_role" });
  });

  it("denies with no_grant when the Employee's Role has no access to this application", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "ACTIVE",
      userType: "EMPLOYEE",
      roleId: "r1",
    });
    prismaMock.roleAccess.findFirst.mockResolvedValue(null);

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: false, reason: "no_grant" });
    expect(prismaMock.roleAccess.findFirst).toHaveBeenCalledWith({
      where: { roleId: "r1", applicationId: { in: ["app-1"] } },
    });
  });

  it("allows an Employee whose Role has a grant to the matched application", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "ACTIVE",
      userType: "EMPLOYEE",
      roleId: "r1",
    });
    prismaMock.roleAccess.findFirst.mockResolvedValue({ id: "ra1" });

    const res = await POST(jsonRequest(URL_, "POST", body(), AUTH_HEADER));
    const data = await res.json();

    expect(data).toEqual({ allow: true, reason: "allow" });
  });
});

describe("audit logging", () => {
  it("logs a denial when the trigger is signIn", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "ACTIVE",
      userType: "EMPLOYEE",
      roleId: "r1",
    });
    prismaMock.roleAccess.findFirst.mockResolvedValue(null);

    await POST(jsonRequest(URL_, "POST", body({ trigger: "signIn" }), AUTH_HEADER));

    expect(logAuditMock).toHaveBeenCalledWith(
      "u1",
      "AUTHZ_DENIED",
      expect.stringContaining("no_grant")
    );
  });

  it("logs the denial with a null userId when there's no account to attribute it to", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await POST(jsonRequest(URL_, "POST", body({ trigger: "signIn" }), AUTH_HEADER));

    expect(logAuditMock).toHaveBeenCalledWith(null, "AUTHZ_DENIED", expect.any(String));
  });

  it("does not log an allow, even on signIn", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      status: "ACTIVE",
      userType: "EMPLOYEE",
      roleId: "r1",
    });
    prismaMock.roleAccess.findFirst.mockResolvedValue({ id: "ra1" });

    await POST(jsonRequest(URL_, "POST", body({ trigger: "signIn" }), AUTH_HEADER));

    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("does not log a denial from a revalidate trigger — every page view would flood the log", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await POST(jsonRequest(URL_, "POST", body({ trigger: "revalidate" }), AUTH_HEADER));

    expect(logAuditMock).not.toHaveBeenCalled();
  });
});
