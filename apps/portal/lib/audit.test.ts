import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { logAudit, requestMeta } from "./audit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAudit", () => {
  it("snapshots the actor's current name/email and defaults outcome to SUCCESS", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ name: "Amy Smith", email: "amy@x.com" });

    await logAudit({
      actorId: "u1",
      action: "EMPLOYEE_UPDATED",
      details: 'Updated "Amy"',
      targetType: "User",
      targetId: "u1",
      metadata: { name: "Amy Smith" },
    });

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
        targetType: "User",
        targetId: "u1",
        metadata: { name: "Amy Smith" },
        outcome: "SUCCESS",
        ip: null,
        userAgent: null,
      },
    });
  });

  it("writes null actor fields and skips the lookup when actorId is null", async () => {
    await logAudit({ actorId: null, action: "AUTHZ_DENIED", outcome: "DENIED" });

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        actorName: null,
        actorEmail: null,
        action: "AUTHZ_DENIED",
        details: null,
        targetType: null,
        targetId: null,
        metadata: undefined,
        outcome: "DENIED",
        ip: null,
        userAgent: null,
      },
    });
  });

  it("carries ip and userAgent through when given", async () => {
    await logAudit({
      actorId: null,
      action: "LOGIN_DENIED",
      outcome: "DENIED",
      ip: "203.0.113.4",
      userAgent: "curl/8.0",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ip: "203.0.113.4", userAgent: "curl/8.0" }) })
    );
  });
});

describe("requestMeta", () => {
  it("reads the first x-forwarded-for entry and the user-agent header", () => {
    const req = { headers: new Headers({ "x-forwarded-for": "203.0.113.4, 10.0.0.1", "user-agent": "curl/8.0" }) };

    expect(requestMeta(req)).toEqual({ ip: "203.0.113.4", userAgent: "curl/8.0" });
  });

  it("returns nulls when the headers are absent", () => {
    const req = { headers: new Headers() };

    expect(requestMeta(req)).toEqual({ ip: null, userAgent: null });
  });
});
