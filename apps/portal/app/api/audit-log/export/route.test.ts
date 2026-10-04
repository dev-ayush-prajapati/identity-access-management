import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest, mockLiveCallerFromSession } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    auditLog: {
      findMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock, requestMeta: () => ({}) }));

import { GET, csvField } from "./route";

const URL_ = "http://localhost:3000/api/audit-log/export";

function getReq() {
  return jsonRequest(URL_, "GET");
}

const LOGS = [
  {
    id: "a1",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    action: "ROLE_CREATED",
    details: "Created role HR",
    outcome: "SUCCESS",
    targetType: "Role",
    targetId: "r1",
    metadata: { name: "HR" },
    ip: "10.0.0.5",
    userAgent: "Mozilla/5.0",
    user: { name: "Ada Admin", email: "ada@example.com" },
  },
  // The acting user can be deleted after the fact — the log row survives with
  // a null relation, and the export still has to produce a full line.
  {
    id: "a2",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    action: "ACCESS_REVOKED",
    details: null,
    outcome: "SUCCESS",
    targetType: null,
    targetId: null,
    metadata: null,
    ip: null,
    userAgent: null,
    user: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.findMany.mockResolvedValue(LOGS);
  mockLiveCallerFromSession(authMock, prismaMock.user.findUnique);
});

describe("GET /api/audit-log/export", () => {
  it("401s when unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const res = await GET(getReq());

    expect(res.status).toBe(401);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("403s for an Employee, and requireUserType itself audit-logs the denial", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await GET(getReq());

    expect(res.status).toBe(403);
    expect(prismaMock.auditLog.findMany).not.toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ACCESS_DENIED", outcome: "DENIED" })
    );
  });

  it("serves a downloadable CSV to an Admin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await GET(getReq());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="audit-log.csv"');
  });

  it("writes a header row and one row per log", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const lines = (await (await GET(getReq())).text()).split("\r\n");

    expect(lines).toHaveLength(1 + LOGS.length);
    // The original five columns stay first, unchanged; the structured fields
    // are appended so anything reading the old layout keeps working.
    expect(lines[0]).toBe(
      "Timestamp,User,Email,Action,Details,Outcome,Target Type,Target ID,Metadata,IP,User Agent"
    );
    expect(lines[1]).toBe(
      '2026-01-02T03:04:05.000Z,Ada Admin,ada@example.com,ROLE_CREATED,Created role HR,SUCCESS,Role,r1,"{""name"":""HR""}",10.0.0.5,Mozilla/5.0'
    );
    expect(lines[2]).toBe("2026-01-01T00:00:00.000Z,System,,ACCESS_REVOKED,,SUCCESS,,,,,");
  });

  it("escapes details containing a comma and a double quote", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "a3",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        action: "ROLE_UPDATED",
        details: 'Renamed "HR" to "People, EU"',
        outcome: "SUCCESS",
        user: { name: "Ada Admin", email: "ada@example.com" },
      },
    ]);

    const lines = (await (await GET(getReq())).text()).split("\r\n");

    expect(lines[1]).toBe(
      '2026-01-03T00:00:00.000Z,Ada Admin,ada@example.com,ROLE_UPDATED,"Renamed ""HR"" to ""People, EU""",SUCCESS,,,,,'
    );
  });

  // An admin-entered name is the realistic vector: it lands in the User
  // column, and the CSV is the file handed to someone outside the system to
  // open in a spreadsheet.
  it("neutralizes a formula smuggled in through a user name or details", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: "a4",
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
        action: "EMPLOYEE_CREATED",
        details: "=1+1",
        outcome: "SUCCESS",
        actorName: '=HYPERLINK("http://evil.example","click")',
        user: null,
      },
    ]);

    const lines = (await (await GET(getReq())).text()).split("\r\n");

    expect(lines[1]).toBe(
      `2026-01-04T00:00:00.000Z,"'=HYPERLINK(""http://evil.example"",""click"")",,EMPLOYEE_CREATED,'=1+1,SUCCESS,,,,,`
    );
  });

  it("audits the export itself", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));

    await GET(getReq());

    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        action: "AUDIT_LOG_EXPORTED",
        details: expect.stringContaining("2 audit log entries"),
      })
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

  // OWASP CSV injection: a spreadsheet runs a cell starting with these as a
  // formula. A leading apostrophe makes it plain text.
  it("prefixes an apostrophe to anything a spreadsheet would run as a formula", () => {
    expect(csvField("=1+1")).toBe("'=1+1");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-2")).toBe("'-2");
    expect(csvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvField("\tcmd")).toBe("'\tcmd");
  });

  // Seen live: Excel still ran " =HYPERLINK(...)" — a leading space doesn't
  // stop it. Names are trimmed on write, but the User-Agent column is
  // whatever header the client sent.
  it("catches a formula hidden behind leading whitespace", () => {
    expect(csvField(" =1+1")).toBe("' =1+1");
    expect(csvField("   @SUM(A1)")).toBe("'   @SUM(A1)");
    expect(csvField("\t=1")).toBe("'\t=1");
  });

  it("neutralizes first, then quotes, when a formula also needs quoting", () => {
    expect(csvField('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it("leaves those characters alone when they aren't first", () => {
    expect(csvField("a=b")).toBe("a=b");
    expect(csvField("x@y.com")).toBe("x@y.com");
  });
});
