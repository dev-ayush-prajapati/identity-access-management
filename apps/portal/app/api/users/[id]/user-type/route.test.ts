import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, paramsOf } from "@/test/helpers";

const { authMock, prismaMock, userLookupMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
  userLookupMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock, requestMeta: () => ({}) }));

import { PATCH } from "./route";

const URL_ = "http://localhost:3000/api/users/u2/user-type";

const admin = {
  id: "u2",
  name: "Bob",
  email: "bob@x.com",
  userType: "ADMIN",
  keycloakId: "kc-123",
  archivedAt: null,
};

const superAdmin = {
  id: "u3",
  name: "Cara",
  email: "cara@x.com",
  userType: "SUPERADMIN",
  keycloakId: "kc-789",
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN", id: "boss-1" }));
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const session = await authMock();
    if (session?.user && args.where.id === session.user.id) {
      return { userType: session.user.userType, roleId: session.user.roleId, status: "ACTIVE" };
    }
    return userLookupMock(args);
  });
});

describe("PATCH /api/users/[id]/user-type", () => {
  it("403s for an Admin — only a SuperAdmin can change tiers", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "SUPERADMIN" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s on an invalid userType value", async () => {
    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "EMPLOYEE" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("404s when the target doesn't exist", async () => {
    userLookupMock.mockResolvedValue(null);

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "SUPERADMIN" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(404);
  });

  it("404s when the target is archived", async () => {
    userLookupMock.mockResolvedValue({ ...admin, archivedAt: new Date() });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "SUPERADMIN" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(404);
  });

  it("404s when the target is an Employee (out of scope for this ladder)", async () => {
    userLookupMock.mockResolvedValue({ ...admin, userType: "EMPLOYEE" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "SUPERADMIN" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(404);
  });

  it("400s when the target already has the requested userType", async () => {
    userLookupMock.mockResolvedValue(admin);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { userType: "ADMIN" }), paramsOf("u2"));

    expect(res.status).toBe(400);
  });

  it("400s when a SuperAdmin tries to change their own account type", async () => {
    // Self-targeting means requireUserType's own caller check and this
    // route's target lookup both query `where: { id: "boss-1" }` — same
    // shape, so the shared id-dispatch mock in beforeEach can't tell them
    // apart. Queue the two calls explicitly instead, in the order the route
    // makes them: caller check first, target lookup second.
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ userType: "SUPERADMIN", roleId: null, status: "ACTIVE" })
      .mockResolvedValueOnce({ ...superAdmin, id: "boss-1" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "ADMIN" }),
      paramsOf("boss-1")
    );

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("400s when demoting the last SuperAdmin", async () => {
    userLookupMock.mockResolvedValue(superAdmin);
    prismaMock.user.count.mockResolvedValue(1);

    const res = await PATCH(jsonRequest(URL_, "PATCH", { userType: "ADMIN" }), paramsOf("u3"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/last SuperAdmin/i);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("promotes an Admin to SuperAdmin and audit-logs it", async () => {
    userLookupMock.mockResolvedValue(admin);
    prismaMock.user.update.mockResolvedValue({ ...admin, userType: "SUPERADMIN" });

    const res = await PATCH(
      jsonRequest(URL_, "PATCH", { userType: "SUPERADMIN" }),
      paramsOf("u2")
    );

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u2" }, data: { userType: "SUPERADMIN" } })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "boss-1",
        action: "USER_PROMOTED",
        details: expect.stringContaining("Bob"),
      })
    );
  });

  it("demotes a SuperAdmin to Admin when more than one SuperAdmin remains", async () => {
    userLookupMock.mockResolvedValue(superAdmin);
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.user.update.mockResolvedValue({ ...superAdmin, userType: "ADMIN" });

    const res = await PATCH(jsonRequest(URL_, "PATCH", { userType: "ADMIN" }), paramsOf("u3"));

    expect(res.status).toBe(200);
    expect(prismaMock.user.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userType: "SUPERADMIN", archivedAt: null } })
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "boss-1",
        action: "USER_DEMOTED",
        details: expect.stringContaining("Cara"),
      })
    );
  });
});
