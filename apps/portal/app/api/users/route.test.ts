import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest } from "@/test/helpers";

const {
  authMock,
  prismaMock,
  logAuditMock,
  createKeycloakUserMock,
  generateTempPasswordMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    role: { findUnique: vi.fn() },
  },
  logAuditMock: vi.fn(),
  createKeycloakUserMock: vi.fn(),
  generateTempPasswordMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("@/lib/keycloak-admin", () => ({
  createKeycloakUser: createKeycloakUserMock,
  generateTempPassword: generateTempPasswordMock,
}));

import { GET, POST } from "./route";

const URL_ = "http://localhost:3000/api/users";

beforeEach(() => {
  vi.clearAllMocks();
  generateTempPasswordMock.mockReturnValue("temp-pw-123");
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("GET /api/users — tier is derived from the caller, never a param", () => {
  it("a SuperAdmin sees Admins", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    await GET();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userType: "ADMIN" } })
    );
  });

  it("an Admin sees Employees", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    await GET();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userType: "EMPLOYEE" } })
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
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });

    const res = await POST(jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com" }));

    expect(res.status).toBe(409);
    expect(createKeycloakUserMock).not.toHaveBeenCalled();
  });

  it("502s when Keycloak account creation fails, and never creates the Postgres row", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
    prismaMock.user.findUnique.mockResolvedValue(null);
    createKeycloakUserMock.mockRejectedValue(new Error("Keycloak down"));

    const res = await POST(jsonRequest(URL_, "POST", { name: "Bob", email: "bob@x.com" }));

    expect(res.status).toBe(502);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("a SuperAdmin can only ever create Admins, even if the request body claims otherwise", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN", id: "boss-1" }));
    prismaMock.user.findUnique.mockResolvedValue(null);
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
    prismaMock.user.findUnique.mockResolvedValue(null);
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
      "admin-1",
      "EMPLOYEE_CREATED",
      expect.stringContaining("Amy")
    );
  });
});
