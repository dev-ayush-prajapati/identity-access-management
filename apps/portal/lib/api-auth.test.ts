import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession } from "@/test/helpers";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { requireUserType } from "./api-auth";

describe("requireUserType", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("401s when there is no session", async () => {
    authMock.mockResolvedValue(null);

    const { error, session } = await requireUserType(["ADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(401);
  });

  it("403s when the caller's userType isn't in the allowed list", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const { error, session } = await requireUserType(["ADMIN", "SUPERADMIN"]);

    expect(session).toBeUndefined();
    expect(error?.status).toBe(403);
  });

  it("returns the session when the caller's userType is allowed", async () => {
    const session = fakeSession({ userType: "ADMIN" });
    authMock.mockResolvedValue(session);

    const result = await requireUserType(["ADMIN"]);

    expect(result.error).toBeUndefined();
    expect(result.session).toEqual(session);
  });
});
