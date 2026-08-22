import { beforeEach, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    role: { findUnique: vi.fn() },
    application: { findUnique: vi.fn() },
    roleAccess: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { PATCH } from "./route";

const URL_ = "http://localhost:3000/api/access-matrix";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
  prismaMock.role.findUnique.mockResolvedValue({ id: "r1", name: "HR" });
  prismaMock.application.findUnique.mockResolvedValue({ id: "a1", name: "Finance" });
});

it("403s for a non-Admin", async () => {
  authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

  const res = await PATCH(
    jsonRequest(URL_, "PATCH", { roleId: "r1", applicationId: "a1", granted: true })
  );

  expect(res.status).toBe(403);
});

it("400s on malformed input", async () => {
  const res = await PATCH(jsonRequest(URL_, "PATCH", { roleId: "r1", granted: "yes" }));
  expect(res.status).toBe(400);
});

it("404s when the role or application doesn't exist", async () => {
  prismaMock.role.findUnique.mockResolvedValue(null);

  const res = await PATCH(
    jsonRequest(URL_, "PATCH", { roleId: "missing", applicationId: "a1", granted: true })
  );

  expect(res.status).toBe(404);
});

it("grants access via upsert", async () => {
  const res = await PATCH(
    jsonRequest(URL_, "PATCH", { roleId: "r1", applicationId: "a1", granted: true })
  );

  expect(res.status).toBe(200);
  expect(prismaMock.roleAccess.upsert).toHaveBeenCalledWith({
    where: { roleId_applicationId: { roleId: "r1", applicationId: "a1" } },
    create: { roleId: "r1", applicationId: "a1" },
    update: {},
  });
  expect(prismaMock.roleAccess.deleteMany).not.toHaveBeenCalled();
  expect(logAuditMock).toHaveBeenCalledWith(
    "user-1",
    "ACCESS_GRANTED",
    expect.stringContaining("HR")
  );
});

it("revokes access via deleteMany", async () => {
  const res = await PATCH(
    jsonRequest(URL_, "PATCH", { roleId: "r1", applicationId: "a1", granted: false })
  );

  expect(res.status).toBe(200);
  expect(prismaMock.roleAccess.deleteMany).toHaveBeenCalledWith({
    where: { roleId: "r1", applicationId: "a1" },
  });
  expect(prismaMock.roleAccess.upsert).not.toHaveBeenCalled();
  expect(logAuditMock).toHaveBeenCalledWith(
    "user-1",
    "ACCESS_REVOKED",
    expect.stringContaining("Finance")
  );
});
