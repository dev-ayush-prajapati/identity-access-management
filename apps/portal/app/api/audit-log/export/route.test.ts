import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    auditLog: {
      findMany: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { GET, csvField } from "./route";

const LOGS = [
  {
    id: "a1",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    action: "ROLE_CREATED",
    details: "Created role HR",
    user: { name: "Ada Admin", email: "ada@example.com" },
  },
  // The acting user can be deleted after the fact — the log row survives with
  // a null relation, and the export still has to produce a full line.
  {
    id: "a2",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    action: "ACCESS_REVOKED",
    details: null,
    user: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.findMany.mockResolvedValue(LOGS);
});

describe("GET /api/audit-log/export", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await GET();

    expect(res.status).toBe(403);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("serves a downloadable CSV to an Admin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="audit-log.csv"');
  });

  it("writes a header row and one row per log", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const lines = (await (await GET()).text()).split("\r\n");

    expect(lines).toHaveLength(1 + LOGS.length);
    expect(lines[0]).toBe("Timestamp,User,Email,Action,Details");
    expect(lines[1]).toBe(
      "2026-01-02T03:04:05.000Z,Ada Admin,ada@example.com,ROLE_CREATED,Created role HR"
    );
    expect(lines[2]).toBe("2026-01-01T00:00:00.000Z,System,,ACCESS_REVOKED,");
  });

  it("escapes details containing a comma and a double quote", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "a3",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        action: "ROLE_UPDATED",
        details: 'Renamed "HR" to "People, EU"',
        user: { name: "Ada Admin", email: "ada@example.com" },
      },
    ]);

    const lines = (await (await GET()).text()).split("\r\n");

    expect(lines[1]).toBe(
      '2026-01-03T00:00:00.000Z,Ada Admin,ada@example.com,ROLE_UPDATED,"Renamed ""HR"" to ""People, EU"""'
    );
  });

  it("audits the export itself", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    await GET();

    expect(logAuditMock).toHaveBeenCalledWith(
      "user-1",
      "AUDIT_LOG_EXPORTED",
      expect.stringContaining("2 audit log entries")
    );
  });
});

describe("csvField", () => {
  it("leaves an ordinary field unquoted", () => {
    expect(csvField("ROLE_CREATED")).toBe("ROLE_CREATED");
  });

  it("renders a missing field as empty", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes a field containing a comma", () => {
    expect(csvField("HR, EU")).toBe('"HR, EU"');
  });

  it("doubles an embedded double quote", () => {
    expect(csvField('Created role "HR"')).toBe('"Created role ""HR"""');
  });

  it("quotes a field containing a line break", () => {
    expect(csvField("first\r\nsecond")).toBe('"first\r\nsecond"');
  });
});
