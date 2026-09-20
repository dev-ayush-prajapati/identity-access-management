import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf } from "@/test/helpers";

const {
  authMock,
  prismaMock,
  userLookupMock,
  logAuditMock,
  resetKeycloakUserPasswordMock,
  generateTempPasswordMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn() },
  },
  userLookupMock: vi.fn(),
  logAuditMock: vi.fn(),
  resetKeycloakUserPasswordMock: vi.fn(),
  generateTempPasswordMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/keycloak-admin", () => ({
  resetKeycloakUserPassword: resetKeycloakUserPasswordMock,
  generateTempPassword: generateTempPasswordMock,
}));

import { POST } from "./route";

const URL_ = "http://localhost:3000/api/users/u1/reset-password";

const employee = {
  id: "u1",
  name: "Amy",
  email: "amy@x.com",
  userType: "EMPLOYEE",
  roleId: "r1",
  keycloakId: "kc-456",
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
  generateTempPasswordMock.mockReturnValue("temp-pw-999");
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const session = await authMock();
    if (session?.user && args.where.id === session.user.id) {
      return { userType: session.user.userType, roleId: session.user.roleId, status: "ACTIVE" };
    }
    return userLookupMock(args);
  });
});

describe("POST /api/users/[id]/reset-password", () => {
  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await POST(jsonRequest(URL_, "POST"), paramsOf("u1"));

    expect(res.status).toBe(403);
    expect(resetKeycloakUserPasswordMock).not.toHaveBeenCalled();
  });

  it("404s when the user doesn't exist", async () => {
    userLookupMock.mockResolvedValue(null);

    const res = await POST(jsonRequest(URL_, "POST"), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(resetKeycloakUserPasswordMock).not.toHaveBeenCalled();
  });

  it("404s when the target is archived", async () => {
    userLookupMock.mockResolvedValue({ ...employee, archivedAt: new Date() });

    const res = await POST(jsonRequest(URL_, "POST"), paramsOf("u1"));

    expect(res.status).toBe(404);
  });

  it("404s when an Admin targets outside their tier", async () => {
    userLookupMock.mockResolvedValue({ ...employee, userType: "ADMIN" });

    const res = await POST(jsonRequest(URL_, "POST"), paramsOf("u1"));

    expect(res.status).toBe(404);
  });

  it("502s when the Keycloak reset fails", async () => {
    userLookupMock.mockResolvedValue(employee);
    resetKeycloakUserPasswordMock.mockRejectedValue(new Error("Keycloak down"));

    const res = await POST(jsonRequest(URL_, "POST"), paramsOf("u1"));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Keycloak down");
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("resets the password and returns it once, audit-logged", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN", id: "admin-1" }));
    userLookupMock.mockResolvedValue(employee);
    resetKeycloakUserPasswordMock.mockResolvedValue(undefined);

    const res = await POST(jsonRequest(URL_, "POST"), paramsOf("u1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(resetKeycloakUserPasswordMock).toHaveBeenCalledWith("kc-456", "temp-pw-999");
    expect(data.tempPassword).toBe("temp-pw-999");
    expect(logAuditMock).toHaveBeenCalledWith(
      "admin-1",
      "EMPLOYEE_PASSWORD_RESET",
      expect.stringContaining("Amy")
    );
  });
});
