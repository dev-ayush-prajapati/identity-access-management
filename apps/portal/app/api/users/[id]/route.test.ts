import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock, deleteKeycloakUserMock } = vi.hoisted(() => ({
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
  logAuditMock: vi.fn(),
  deleteKeycloakUserMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/keycloak-admin", () => ({ deleteKeycloakUser: deleteKeycloakUserMock }));

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
});

describe("PATCH /api/users/[id]", () => {
  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("404s when the user doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s when an Admin targets another Admin (outside their tier)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(admin);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Bob" }), paramsOf("u2"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s when a SuperAdmin targets an Employee (outside their tier)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
    prismaMock.user.findUnique.mockResolvedValue(employee);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "Amy" }), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s on an empty name", async () => {
    prismaMock.user.findUnique.mockResolvedValue(employee);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "   " }), paramsOf("u1"));

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s when an Employee's roleId is explicitly cleared", async () => {
    prismaMock.user.findUnique.mockResolvedValue(employee);

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { name: "Amy", roleId: "" }),
      paramsOf("u1")
    );

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s when the given roleId doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(employee);
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
    prismaMock.user.findUnique.mockResolvedValue(employee);
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
    prismaMock.user.findUnique.mockResolvedValue(admin);
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
});

describe("DELETE /api/users/[id]", () => {
  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(403);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("404s when the user doesn't exist", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(404);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("404s when an Admin targets another Admin (outside their tier)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(admin);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u2"));

    expect(res.status).toBe(404);
    expect(deleteKeycloakUserMock).not.toHaveBeenCalled();
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("502s when the Keycloak delete fails, and leaves the Postgres row intact", async () => {
    prismaMock.user.findUnique.mockResolvedValue(employee);
    deleteKeycloakUserMock.mockRejectedValue(new Error("Keycloak down"));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));
    const data = await res.json();

    expect(res.status).toBe(502);
    expect(data.error).toBe("Keycloak down");
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("deletes the Keycloak account and the Postgres row, and audit-logs it", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN", id: "admin-1" }));
    prismaMock.user.findUnique.mockResolvedValue(employee);
    deleteKeycloakUserMock.mockResolvedValue(undefined);
    prismaMock.user.delete.mockResolvedValue(employee);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("u1"));

    expect(res.status).toBe(200);
    expect(deleteKeycloakUserMock).toHaveBeenCalledWith("kc-456");
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(logAuditMock).toHaveBeenCalledWith(
      "admin-1",
      "EMPLOYEE_DELETED",
      expect.stringContaining("amy@x.com")
    );
  });
});
