import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession, jsonRequest } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    application: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));

import { GET, POST } from "./route";

const URL_ = "http://localhost:3000/api/applications";

describe("GET /api/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("403s for an Employee", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "EMPLOYEE" }));

    const res = await GET();

    expect(res.status).toBe(403);
    expect(prismaMock.application.findMany).not.toHaveBeenCalled();
  });

  it("lists applications for an Admin", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));
    prismaMock.application.findMany.mockResolvedValue([{ id: "a1", name: "Finance" }]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([{ id: "a1", name: "Finance" }]);
  });
});

describe("POST /api/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(fakeSession({ userType: "SUPERADMIN" }));
  });

  it("403s for an Admin (SuperAdmin-only)", async () => {
    authMock.mockResolvedValue(fakeSession({ userType: "ADMIN" }));

    const res = await POST(jsonRequest(URL_, "POST", { name: "X", url: "https://x.com" }));

    expect(res.status).toBe(403);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("400s when name or url is missing", async () => {
    const res = await POST(jsonRequest(URL_, "POST", { name: "" }));
    expect(res.status).toBe(400);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("rejects a javascript: URL and does not create the row (stored-XSS regression)", async () => {
    const res = await POST(
      jsonRequest(URL_, "POST", { name: "Evil", url: "javascript:alert(1)" })
    );

    expect(res.status).toBe(400);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("409s on a duplicate name", async () => {
    prismaMock.application.findUnique.mockResolvedValue({ id: "existing" });

    const res = await POST(
      jsonRequest(URL_, "POST", { name: "Finance", url: "https://finance.example.com" })
    );

    expect(res.status).toBe(409);
    expect(prismaMock.application.create).not.toHaveBeenCalled();
  });

  it("creates the application and writes an audit log entry", async () => {
    prismaMock.application.findUnique.mockResolvedValue(null);
    prismaMock.application.create.mockResolvedValue({ id: "a1", name: "Finance" });

    const res = await POST(
      jsonRequest(URL_, "POST", { name: "Finance", url: "https://finance.example.com" })
    );

    expect(res.status).toBe(201);
    expect(prismaMock.application.create).toHaveBeenCalledWith({
      data: { name: "Finance", url: "https://finance.example.com", description: null },
    });
    expect(logAuditMock).toHaveBeenCalledWith(
      "user-1",
      "APPLICATION_CREATED",
      expect.stringContaining("Finance")
    );
  });
});
