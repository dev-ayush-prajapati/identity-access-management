import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    role: {
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { PATCH, DELETE } from "./route";

const URL_ = "http://localhost:3000/api/roles/r1";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
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
    prismaMock.role.update.mockRejectedValue(new Error("not found"));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "IT" }), paramsOf("r1"));

    expect(res.status).toBe(404);
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

  it("deletes the role when no user references it", async () => {
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.role.delete.mockResolvedValue({ id: "r1", name: "HR" });

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));

    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledWith("user-1", "ROLE_DELETED", expect.stringContaining("HR"));
  });

  it("403s for a non-Admin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("r1"));

    expect(res.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
