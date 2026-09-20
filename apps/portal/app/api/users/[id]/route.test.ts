import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf } from "@/test/helpers";

const { authMock, prismaMock, userLookupMock, logAuditMock, deleteKeycloakUserMock, setKeycloakUserEnabledMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    prismaMock: {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      role: {
        findUnique: vi.fn(),
      },
    },
    // `prisma.user.findUnique` now serves two different callers within a
    // single request: `requireUserType`'s own live-status check (keyed by the
    // caller's session id) and this route's target-user lookup (keyed by the
    // URL param). The mock below dispatches on which one a given call is;
    // route-under-test behavior is configured through this stand-in instead of
    // `prismaMock.user.findUnique` directly.
    userLookupMock: vi.fn(),
    logAuditMock: vi.fn(),
    deleteKeycloakUserMock: vi.fn(),
    setKeycloakUserEnabledMock: vi.fn(),
  }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/keycloak-admin", () => ({
  deleteKeycloakUser: deleteKeycloakUserMock,
  setKeycloakUserEnabled: setKeycloakUserEnabledMock,
}));

import { PATCH, DELETE } from "./route";

const URL_ = "http://localhost:3000/api/users/u1";

const employee = {
  id: "u1",
  name: "Amy",
  email: "amy@x.com",
  userType: "EMPLOYEE",
  roleId: "r1",
  keycloakId: "kc-456",
};

const admin = {
  id: "u2",
  name: "Bob",
  email: "bob@x.com",
  userType: "ADMIN",
  roleId: null,
  keycloakId: "kc-123",
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const session = await authMock();
    if (session?.user && args.where.id === session.user.id) {
      return { userType: session.user.userType, roleId: session.user.roleId, status: "ACTIVE" };
    }
    return userLookupMock(args);
  });
});

describe("PATCH /api/users/[id]", () => {
  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(403);
    expect(userLookupMock).not.toHaveBeenCalled();
  });

  it("404s when the user doesn't exist", async () => {
    userLookupMock.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s when an Admin targets another Admin (outside their tier)", async () => {
    userLookupMock.mockResolvedValue(admin);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Bob" }), paramsOf("u2"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s when a SuperAdmin targets an Employee (outside their tier)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
    userLookupMock.mockResolvedValue(employee);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s on an empty name", async () => {
    userLookupMock.mockResolvedValue(employee);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "   " }), paramsOf("u1"));

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s when an Employee's roleId is explicitly cleared", async () => {
    userLookupMock.mockResolvedValue(employee);

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { name: "Amy", roleId: "" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s when the given roleId doesn't exist", async () => {
    userLookupMock.mockResolvedValue(employee);
    prismaMock.role.findUnique.mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { name: "Amy", roleId: "missing" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updates an Employee's name and role, and audit-logs it", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN", id: "admin-1" }));
    userLookupMock.mockResolvedValue(employee);
    prismaMock.role.findUnique.mockResolvedValue({ id: "r2", name: "Finance" });
    prismaMock.user.update.mockResolvedValue({ ...employee, name: "Amy Smith", roleId: "r2" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { name: "  Amy Smith  ", roleId: "r2" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { name: "Amy Smith", roleId: "r2" },
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      "admin-1",
      "EMPLOYEE_UPDATED",
      expect.stringContaining("Amy Smith")
    );
  });

  it("ignores a roleId sent for an Admin — Admins never carry a Role", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN", id: "boss-1" }));
    userLookupMock.mockResolvedValue(admin);
    prismaMock.user.update.mockResolvedValue({ ...admin, name: "Bobby" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { name: "Bobby", roleId: "r1" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(200);
    expect(prismaMock.role.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Bobby", roleId: null } })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      "boss-1",
      "ADMIN_UPDATED",
      expect.stringContaining("Bobby")
    );
  });

  it("404s when the target is archived", async () => {
    userLookupMock.mockResolvedValue({ ...employee, archivedAt: new Date() });

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s on an invalid status value", async () => {
    userLookupMock.mockResolvedValue(employee);

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { status: "GONE" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(400);
    expect(setKeycloakUserEnabledMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("502s when the Keycloak enable/disable call fails, and leaves Postgres untouched", async () => {
    userLookupMock.mockResolvedValue(employee);
    setKeycloakUserEnabledMock.mockRejectedValue(new Error("Keycloak down"));

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { status: "DISABLED" }),
      paramsOf("u1")
    );
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Keycloak down");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("disables a user: flips Keycloak enabled=false and Postgres status, and audit-logs it", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN", id: "admin-1" }));
    userLookupMock.mockResolvedValue(employee);
    setKeycloakUserEnabledMock.mockResolvedValue(undefined);
    prismaMock.user.update.mockResolvedValue({ ...employee, status: "DISABLED" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { status: "DISABLED" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(200);
    expect(setKeycloakUserEnabledMock).toHaveBeenCalledWith("kc-456", false);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { status: "DISABLED" } })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      "admin-1",
      "EMPLOYEE_DISABLED",
      expect.stringContaining("Amy")
    );
  });

  it("re-enables a user: flips Keycloak enabled=true and Postgres status", async () => {
    userLookupMock.mockResolvedValue(employee);
    setKeycloakUserEnabledMock.mockResolvedValue(undefined);
    prismaMock.user.update.mockResolvedValue({ ...employee, status: "ACTIVE" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { status: "ACTIVE" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(200);
    expect(setKeycloakUserEnabledMock).toHaveBeenCalledWith("kc-456", true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ACTIVE" } })
    );
  });
});

describe("DELETE /api/users/[id]", () => {
  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(403);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("404s when the user doesn't exist", async () => {
    userLookupMock.mockResolvedValue(null);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("404s when an Admin targets another Admin (outside their tier)", async () => {
    userLookupMock.mockResolvedValue(admin);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u2"));

    expect(res.status).toBe(404);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s when the target is already archived", async () => {
    userLookupMock.mockResolvedValue({ ...employee, archivedAt: new Date() });

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("502s when the Keycloak delete fails, and leaves the Postgres row intact", async () => {
    userLookupMock.mockResolvedValue(employee);
    deleteKeycloakUserMock.mockRejectedValue(new Error("Keycloak down"));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Keycloak down");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("archives the Postgres row (not a hard delete) after removing the Keycloak login, and audit-logs it", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN", id: "admin-1" }));
    userLookupMock.mockResolvedValue(employee);
    deleteKeycloakUserMock.mockResolvedValue(undefined);
    prismaMock.user.update.mockResolvedValue({ ...employee, archivedAt: new Date(), status: "DISABLED" });

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(200);
    expect(deleteKeycloakUserMock).toHaveBeenCalledWith("kc-456");
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ archivedAt: expect.any(Date), status: "DISABLED" }),
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      "admin-1",
      "EMPLOYEE_ARCHIVED",
      expect.stringContaining("amy@x.com")
    );
  });
});
