import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { logAudit } from "./audit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAudit", () => {
  it("snapshots the actor's current name/email onto the row", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ name: "Amy Smith", email: "amy@x.com" });

    await logAudit("u1", "EMPLOYEE_UPDATED", "Updated \"Amy\"");

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { name: true, email: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        actorName: "Amy Smith",
        actorEmail: "amy@x.com",
        action: "EMPLOYEE_UPDATED",
        details: 'Updated "Amy"',
      },
    });
  });

  it("writes null actor fields and skips the lookup when userId is null", async () => {
    await logAudit(null, "AUTHZ_DENIED", "no matching account");

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        actorName: null,
        actorEmail: null,
        action: "AUTHZ_DENIED",
        details: "no matching account",
      },
    });
  });
});
