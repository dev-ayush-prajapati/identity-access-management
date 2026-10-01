import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, logAuditMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: findUniqueMock } } }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { evaluateSignIn } from "./evaluate-sign-in";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateSignIn", () => {
  it("denies and skips the lookup when there's no keycloakId at all", async () => {
    const allowed = await evaluateSignIn(undefined);

    expect(allowed).toBe(false);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("denies and audit-logs with no actor when no matching User row exists", async () => {
    findUniqueMock.mockResolvedValue(null);

    const allowed = await evaluateSignIn("kc-999");

    expect(allowed).toBe(false);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        action: "LOGIN_DENIED",
        outcome: "DENIED",
        metadata: expect.objectContaining({ keycloakId: "kc-999", reason: "no_account" }),
      })
    );
  });

  it("denies and audit-logs a disabled account", async () => {
    findUniqueMock.mockResolvedValue({ id: "u1", name: "Amy", status: "DISABLED" });

    const allowed = await evaluateSignIn("kc-1");

    expect(allowed).toBe(false);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        action: "LOGIN_DENIED",
        outcome: "DENIED",
        metadata: expect.objectContaining({ reason: "disabled" }),
      })
    );
  });

  it("allows and audit-logs an active account", async () => {
    findUniqueMock.mockResolvedValue({ id: "u1", name: "Amy", status: "ACTIVE" });

    const allowed = await evaluateSignIn("kc-1");

    expect(allowed).toBe(true);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "u1", action: "LOGIN_SUCCESS" })
    );
  });
});
