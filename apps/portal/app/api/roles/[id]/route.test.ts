import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf, mockLiveCallerFromSession, prismaError } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    role: {
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock, requestMeta: () => ({}) }));

import { PATCH, DELETE } from "./route";

const URL_ = "http://localhost:3000/api/roles/r1";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
  mockLiveCallerFromSession(authMock, prismaMock.user.findUnique);
});

describe("PATCH /api/roles/[id]", () => {
  it("403s for a SuperAdmin (writes are Admin-only)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "IT" }), paramsOf("r1"));

    expect(res.status).toBe(403);
  });

  it("400s on an empty name", async () => {
    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "" }), paramsOf("r1"));
    expect(res.status).toBe(400);
  });

  it("404s when the role doesn't exist", async () => {
    prismaMock.role.update.mockRejectedValue(prismaError("P2025"));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "IT" }), paramsOf("r1"));

    expect(res.status).toBe(404);
  });

  it("409s when renaming to a name another role already has", async () => {
    prismaMock.role.update.mockRejectedValue(prismaError("P2002"));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "HR" }), paramsOf("r1"));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain("already exists");
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("doesn't disguise an unexpected database error as 404", async () => {
    prismaMock.role.update.mockRejectedValue(new Error("connection refused"));

    await expect(
      PATCH(jsonRequest(URL_, "PATCH", { name: "IT" }), paramsOf("r1"))
    ).rejects.toThrow("connection refused");
  });
});

describe("DELETE /api/roles/[id]", () => {
  it("blocks deletion with 409 when users still reference the role", async () => {
    prismaMock.user.count.mockResolvedValue(3);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain("3 user(s)");
    expect(prismaMock.role.delete).not.toHaveBeenCalled();
  });

  // Archiving keeps a user's roleId (the row stays for audit history), so a
  // count that included them would block the delete forever — the Admin can't
  // see or reassign an archived user.
  it("doesn't count archived users as still holding the role", async () => {
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.role.delete.mockResolvedValue({ id: "r1", name: "HR" });

    await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { roleId: "r1", archivedAt: null },
    });
  });

  it("404s when the role doesn't exist", async () => {
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.role.delete.mockRejectedValue(prismaError("P2025"));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));

    expect(res.status).toBe(404);
  });

  it("deletes the role when no user references it", async () => {
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.role.delete.mockResolvedValue({ id: "r1", name: "HR" });

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));

    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "user-1", action: "ROLE_DELETED", details: expect.stringContaining("HR") })
    );
  });

  it("403s for a non-Admin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));

    expect(res.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
