import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { GET, POST } from "./route";

const URL_ = "http://localhost:3000/api/roles";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/roles", () => {
  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await GET();

    expect(res.status).toBe(403);
  });

  it("is readable by both SuperAdmin and Admin", async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: "r1", name: "HR" }]);

    for (const userType of ["SUPERADMIN", "ADMIN"] as const) {
      authMock.mockResolvedValue(fakeSession({ userType }));
      const res = await GET();
      expect(res.status).toBe(200);
    }
  });
});

describe("POST /api/roles", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
  });

  it("403s for a SuperAdmin (writes are Admin-only)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    const res = await POST(jsonRequest(URL_, "POST", { name: "HR" }));

    expect(res.status).toBe(403);
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  it("400s on an empty name", async () => {
    const res = await POST(jsonRequest(URL_, "POST", { name: "   " }));
    expect(res.status).toBe(400);
  });

  it("409s on a duplicate name", async () => {
    prismaMock.role.findUnique.mockResolvedValue({ id: "existing" });

    const res = await POST(jsonRequest(URL_, "POST", { name: "HR" }));

    expect(res.status).toBe(409);
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  it("creates the role and logs the audit entry", async () => {
    prismaMock.role.findUnique.mockResolvedValue(null);
    prismaMock.role.create.mockResolvedValue({ id: "r1", name: "HR" });

    const res = await POST(jsonRequest(URL_, "POST", { name: "HR" }));

    expect(res.status).toBe(201);
    expect(logAuditMock).toHaveBeenCalledWith("user-1", "ROLE_CREATED", expect.stringContaining("HR"));
  });
});
