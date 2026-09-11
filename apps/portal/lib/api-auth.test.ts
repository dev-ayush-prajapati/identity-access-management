import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession } from "@/test/helpers";

const { authMock, findUniqueMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findUniqueMock: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: findUniqueMock } } }));

import { requireUserType } from "./api-auth";

describe("requireUserType", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
  });

  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const { error, session } = await requireUserType(["ADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("401s when the session's user no longer exists in Postgres (deleted since the token was issued)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    findUniqueMock.mockResolvedValue(null);

    const { error, session } = await requireUserType(["ADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(401);
  });

  it("403s a disabled user even if the session's stale token still says ADMIN", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    findUniqueMock.mockResolvedValue({ userType: "ADMIN", roleId: null, status: "DISABLED" });

    const { error, session } = await requireUserType(["ADMIN", "SUPERADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(403);
  });

  it("403s when the caller's live userType isn't in the allowed list", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));
    findUniqueMock.mockResolvedValue({ userType: "EMPLOYEE", roleId: "role-1", status: "ACTIVE" });

    const { error, session } = await requireUserType(["ADMIN", "SUPERADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(403);
  });

  it("403s based on the live userType, not a stale token claim (demoted since the token was issued)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    findUniqueMock.mockResolvedValue({ userType: "EMPLOYEE", roleId: "role-1", status: "ACTIVE" });

    const { error, session } = await requireUserType(["ADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(403);
  });

  it("returns the session, refreshed with the live userType/roleId, when the caller is allowed", async () => {
    const session = fakeSession({ userType: "ADMIN", roleId: null });
    authMock.mockResolvedValue(session);
    findUniqueMock.mockResolvedValue({ userType: "ADMIN", roleId: null, status: "ACTIVE" });

    const result = await requireUserType(["ADMIN"]);

    expect(result.error).toBeUndefined();
    expect(result.session?.user.userType).toBe("ADMIN");
    expect(result.session?.user.id).toBe(session.user.id);
  });

  it("reflects a live roleId change even if the session's token still carries the old one", async () => {
    const session = fakeSession({ userType: "EMPLOYEE", roleId: "old-role" });
    authMock.mockResolvedValue(session);
    findUniqueMock.mockResolvedValue({ userType: "EMPLOYEE", roleId: "new-role", status: "ACTIVE" });

    const result = await requireUserType(["EMPLOYEE"]);

    expect(result.error).toBeUndefined();
    expect(result.session?.user.roleId).toBe("new-role");
  });

  it("looks the caller up by the session's own id", async () => {
    const session = fakeSession({ id: "user-42", userType: "ADMIN" });
    authMock.mockResolvedValue(session);
    findUniqueMock.mockResolvedValue({ userType: "ADMIN", roleId: null, status: "ACTIVE" });

    await requireUserType(["ADMIN"]);

    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: "user-42" } });
  });
});
