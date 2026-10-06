import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf, mockTransactions } from "@/test/helpers";

const {
  authMock,
  prismaMock,
  userLookupMock,
  logAuditMock,
  deleteKeycloakUserMock,
  setKeycloakUserEnabledMock,
  setKeycloakUserNameMock,
} = vi.hoisted(() => ({
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
    setKeycloakUserNameMock: vi.fn(),
  }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock, requestMeta: () => ({}) }));
vi.mock("@/lib/keycloak-admin", () => ({
  deleteKeycloakUser: deleteKeycloakUserMock,
  setKeycloakUserEnabled: setKeycloakUserEnabledMock,
  setKeycloakUserName: setKeycloakUserNameMock,
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
  mockTransactions(prismaMock);
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
    expect(setKeycloakUserNameMock).toHaveBeenCalledWith("kc-456", "Amy Smith");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { name: "Amy Smith", roleId: "r2" },
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "EMPLOYEE_UPDATED",
        details: expect.stringContaining("Amy Smith"),
      }),
      prismaMock
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
      expect.objectContaining({
        actorId: "boss-1",
        action: "ADMIN_UPDATED",
        details: expect.stringContaining("Bobby"),
      }),
      prismaMock
    );
  });

  it("leaves Keycloak alone when the name didn't change (role-only edit)", async () => {
    userLookupMock.mockResolvedValue(employee);
    prismaMock.role.findUnique.mockResolvedValue({ id: "r2", name: "Finance" });
    prismaMock.user.update.mockResolvedValue({ ...employee, roleId: "r2" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { name: "Amy", roleId: "r2" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(200);
    expect(setKeycloakUserNameMock).not.toHaveBeenCalled();
  });

  it("502s when the Keycloak rename fails, and leaves Postgres untouched", async () => {
    userLookupMock.mockResolvedValue(employee);
    setKeycloakUserNameMock.mockRejectedValue(new Error("Failed to rename the Keycloak account"));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy Smith" }), paramsOf("u1"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Failed to rename the Keycloak account");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  // Same compensation as status: Keycloak was renamed before the
  // transaction, so a failed save must put the old name back.
  it("restores the Keycloak name and 500s when the rename can't be saved with its audit row", async () => {
    userLookupMock.mockResolvedValue(employee);
    setKeycloakUserNameMock.mockResolvedValue(undefined);
    prismaMock.user.update.mockResolvedValue({ ...employee, name: "Amy Smith" });
    logAuditMock.mockRejectedValueOnce(new Error("audit down"));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy Smith" }), paramsOf("u1"));

    expect(res.status).toBe(500);
    expect(setKeycloakUserNameMock).toHaveBeenNthCalledWith(1, "kc-456", "Amy Smith");
    expect(setKeycloakUserNameMock).toHaveBeenNthCalledWith(2, "kc-456", "Amy");
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
      expect.objectContaining({
        actorId: "admin-1",
        action: "EMPLOYEE_DISABLED",
        details: expect.stringContaining("Amy"),
      }),
      prismaMock
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

  // Keycloak is flipped before the transaction, so if the status change or
  // its audit row can't be saved, Keycloak must be put back — otherwise the
  // two systems disagree about whether the account can sign in.
  it("restores Keycloak and 500s when the status change can't be saved with its audit row", async () => {
    userLookupMock.mockResolvedValue({ ...employee, status: "ACTIVE" });
    setKeycloakUserEnabledMock.mockResolvedValue(undefined);
    prismaMock.user.update.mockResolvedValue({ ...employee, status: "DISABLED" });
    logAuditMock.mockRejectedValueOnce(new Error("audit down"));

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { status: "DISABLED" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(500);
    expect(setKeycloakUserEnabledMock).toHaveBeenNthCalledWith(1, "kc-456", false);
    expect(setKeycloakUserEnabledMock).toHaveBeenNthCalledWith(2, "kc-456", true);
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
      expect.objectContaining({
        actorId: "admin-1",
        action: "EMPLOYEE_ARCHIVED",
        details: expect.stringContaining("amy@x.com"),
      }),
      prismaMock
    );
  });

  it("500s with a retryable message when the archive can't be saved with its audit row", async () => {
    userLookupMock.mockResolvedValue(employee);
    deleteKeycloakUserMock.mockResolvedValue(undefined);
    prismaMock.user.update.mockResolvedValue({ ...employee, archivedAt: new Date() });
    logAuditMock.mockRejectedValueOnce(new Error("audit down"));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("try again");
  });
});
