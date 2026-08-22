import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    application: {
      update: vi.fn(),
      delete: vi.fn(),
    },
    roleAccess: {
      count: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { PATCH, DELETE } from "./route";

const URL_ = "http://localhost:3000/api/applications/a1";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
  prismaMock.roleAccess.count.mockResolvedValue(0);
});

describe("PATCH /api/applications/[id]", () => {
  it("403s for a non-SuperAdmin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "New" }), paramsOf("a1"));

    expect(res.status).toBe(403);
    expect(prismaMock.application.update).not.toHaveBeenCalled();
  });

  it("400s when no valid fields are given", async () => {
    const res = await PATCH(jsonRequest(URL_, "PATCH", {}), paramsOf("a1"));
    expect(res.status).toBe(400);
  });

  it("rejects a non-http(s) URL on update (stored-XSS regression)", async () => {
    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { url: "javascript:alert(1)" }),
      paramsOf("a1")
    );

    expect(res.status).toBe(400);
    expect(prismaMock.application.update).not.toHaveBeenCalled();
  });

  it("404s when the application doesn't exist", async () => {
    prismaMock.application.update.mockRejectedValue(new Error("not found"));

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "New" }), paramsOf("a1"));

    expect(res.status).toBe(404);
  });

  it("updates the application and logs the audit entry", async () => {
    prismaMock.application.update.mockResolvedValue({ id: "a1", name: "New" });

    const res = await PATCH(jsonRequest(URL_, "PATCH", { name: "New" }), paramsOf("a1"));

    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledWith(
      "user-1",
      "APPLICATION_UPDATED",
      expect.stringContaining("New")
    );
  });
});

describe("DELETE /api/applications/[id]", () => {
  it("403s for a non-SuperAdmin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("a1"));

    expect(res.status).toBe(403);
    expect(prismaMock.application.delete).not.toHaveBeenCalled();
  });

  it("404s when the application doesn't exist", async () => {
    prismaMock.application.delete.mockRejectedValue(new Error("not found"));

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("a1"));

    expect(res.status).toBe(404);
  });

  it("blocks deletion with 409 when a role still has access to it", async () => {
    prismaMock.roleAccess.count.mockResolvedValue(2);

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("a1"));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain("2 role(s)");
    expect(prismaMock.application.delete).not.toHaveBeenCalled();
  });

  it("deletes the application and logs the audit entry", async () => {
    prismaMock.application.delete.mockResolvedValue({ id: "a1", name: "Finance" });

    const res = await DELETE(jsonRequest(URL_, "DELETE"), paramsOf("a1"));

    expect(res.status).toBe(200);
    expect(logAuditMock).toHaveBeenCalledWith(
      "user-1",
      "APPLICATION_DELETED",
      expect.stringContaining("Finance")
    );
  });
});
