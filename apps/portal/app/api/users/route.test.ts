import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest } from "@/test/helpers";

const {
  authMock,
  prismaMock,
  userLookupMock,
  logAuditMock,
  createKeycloakUserMock,
  deleteKeycloakUserMock,
  generateTempPasswordMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    role: { findUnique: vi.fn() },
  },
  // `prisma.user.findUnique` serves two different callers here:
  // `requireUserType`'s own live-status check (keyed by the caller's session
  // id) and this route's duplicate-email check (keyed by email). The mock
  // below dispatches on which one a given call is; the duplicate-email
  // behavior is configured through this stand-in instead of
  // `prismaMock.user.findUnique` directly.
  userLookupMock: vi.fn(),
  logAuditMock: vi.fn(),
  createKeycloakUserMock: vi.fn(),
  deleteKeycloakUserMock: vi.fn(),
  generateTempPasswordMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock, requestMeta: () => ({}) }));
vi.mock("@/lib/keycloak-admin", () => ({
  createKeycloakUser: createKeycloakUserMock,
  deleteKeycloakUser: deleteKeycloakUserMock,
  generateTempPassword: generateTempPasswordMock,
}));

import { GET, POST } from "./route";

const URL_ = "http://localhost:3000/api/users";

beforeEach(() => {
  vi.clearAllMocks();
  generateTempPasswordMock.mockReturnValue("temp-pw-123");
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id?: string; email?: string } }) => {
    const session = await authMock();
    if (session?.user && args.where.id === session.user.id) {
      return { userType: session.user.userType, roleId: session.user.roleId, status: "ACTIVE" };
    }
    return userLookupMock(args);
  });
});

describe("GET /api/users — tier is derived from the caller, never a param", () => {
  it("a SuperAdmin sees Admins", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    await GET();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userType: "ADMIN", archivedAt: null } })
    );
  });

  it("an Admin sees Employees", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    await GET();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userType: "EMPLOYEE", archivedAt: null } })
    );
  });

  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await GET();

    expect(res.status).toBe(403);
  });
});

describe("POST /api/users", () => {
  it("400s when an Admin creates an Employee with no roleId", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await POST(jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com" }));

    expect(res.status).toBe(400);
    expect(createKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("400s when the given roleId doesn't exist", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    prismaMock.role.findUnique.mockResolvedValue(null);

    const res = await POST(
      jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com", roleId: "missing" })
    );

    expect(res.status).toBe(400);
  });

  it("409s on a duplicate email without ever contacting Keycloak", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
    userLookupMock.mockResolvedValue({ id: "existing" });

    const res = await POST(jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com" }));

    expect(res.status).toBe(409);
    expect(createKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("502s when Keycloak account creation fails, and never creates the Postgres row", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
    userLookupMock.mockResolvedValue(null);
    createKeycloakUserMock.mockRejectedValue(new Error("Keycloak down"));

    const res = await POST(jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com" }));

    expect(res.status).toBe(502);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("500s and rolls back the Keycloak account when the Postgres create fails", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
    userLookupMock.mockResolvedValue(null);
    createKeycloakUserMock.mockResolvedValue("kc-orphan");
    prismaMock.user.create.mockRejectedValue(new Error("db down"));
    deleteKeycloakUserMock.mockResolvedValue(undefined);

    const res = await POST(jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com" }));

    expect(res.status).toBe(500);
    expect(deleteKeycloakUserMock).toHaveBeenCalledWith("kc-orphan");
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("a SuperAdmin can only ever create Admins, even if the request body claims otherwise", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN", id: "boss-1" }));
    userLookupMock.mockResolvedValue(null);
    prismaMock.role.findUnique.mockResolvedValue({ id: "r9", name: "Whatever" });
    createKeycloakUserMock.mockResolvedValue("kc-123");
    prismaMock.user.create.mockResolvedValue({ id: "u1", email: "bob@x.com" });

    const res = await POST(
      jsonRequest(URL_, "POST", {
        name: "Bob",
        email: "bob@x.com",
        userType: "SUPERADMIN", // spoofed privilege-escalation attempt — route never reads this field
        roleId: "r9",
      })
    );

    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userType: "ADMIN",
          roleId: null, // Admins never carry a Role, regardless of what the body sent
          createdById: "boss-1",
        }),
      })
    );
    const data = await res.json();
    expect(data.tempPassword).toBe("temp-pw-123");
  });

  it("an Admin creates an Employee with the given role", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN", id: "admin-1" }));
    prismaMock.role.findUnique.mockResolvedValue({ id: "r1", name: "HR" });
    userLookupMock.mockResolvedValue(null);
    createKeycloakUserMock.mockResolvedValue("kc-456");
    prismaMock.user.create.mockResolvedValue({ id: "u2", email: "amy@x.com" });

    const res = await POST(
      jsonRequest(URL_, "POST", { name: "Amy", email: "amy@x.com", roleId: "r1" })
    );

    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userType: "EMPLOYEE",
          roleId: "r1",
          createdById: "admin-1",
        }),
      })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "EMPLOYEE_CREATED",
        details: expect.stringContaining("Amy"),
      })
    );
  });
});
