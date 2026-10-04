import { readdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSession } from "@/test/helpers";

const { authMock, prismaMock, logAuditMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: { user: { findUnique: vi.fn() } },
  logAuditMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
// redirect() works by throwing; mirror that so a test can see where it went.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { decidePageAccess, requirePageUser } from "./page-auth";

const active = { userType: "ADMIN" as const, status: "ACTIVE" as const, archivedAt: null };

describe("decidePageAccess", () => {
  it("lets an active user into their own zone, and into ANY", () => {
    expect(decidePageAccess(active, "ADMIN")).toEqual({ allow: true });
    expect(decidePageAccess(active, "ANY")).toEqual({ allow: true });
  });

  it("sends an active user in the wrong zone to their own (e.g. just promoted)", () => {
    expect(decidePageAccess({ ...active, userType: "SUPERADMIN" }, "ADMIN")).toEqual({
      allow: false,
      redirectTo: "/superadmin",
      reason: "wrong_user_type",
    });
    expect(decidePageAccess({ ...active, userType: "EMPLOYEE" }, "ADMIN")).toMatchObject({
      redirectTo: "/dashboard",
    });
  });

  it("turns away a disabled or archived user even from ANY", () => {
    for (const user of [
      { ...active, status: "DISABLED" as const },
      { ...active, status: "DISABLED" as const, archivedAt: new Date() },
    ]) {
      expect(decidePageAccess(user, "ANY")).toEqual({
        allow: false,
        redirectTo: "/",
        reason: "disabled",
      });
    }
  });

  it("turns away a missing account", () => {
    expect(decidePageAccess(null, "ANY")).toMatchObject({ allow: false, reason: "no_account" });
  });
});

describe("requirePageUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A stale token on purpose: it still claims ADMIN, whatever the row says.
    authMock.mockResolvedValue(fakeSession({ id: "u1", userType: "ADMIN" }));
  });

  it("returns the live row when allowed", async () => {
    const row = { id: "u1", ...active, role: null };
    prismaMock.user.findUnique.mockResolvedValue(row);

    await expect(requirePageUser("ADMIN")).resolves.toBe(row);
  });

  it("decides on the live row, not the token", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", ...active, userType: "SUPERADMIN" });

    await expect(requirePageUser("ADMIN")).rejects.toThrow("REDIRECT /superadmin");
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("redirects a disabled account out and audit-logs the attempt", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", ...active, status: "DISABLED" });

    await expect(requirePageUser("ADMIN")).rejects.toThrow("REDIRECT /");
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        action: "ACCESS_DENIED",
        outcome: "DENIED",
        metadata: { reason: "disabled", zone: "ADMIN" },
      })
    );
  });

  it("redirects with no audit row when the account row is gone", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(requirePageUser("ANY")).rejects.toThrow("REDIRECT /");
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});

// middleware.ts no longer checks zones, so a zone page that forgets this call
// is open to every signed-in user. This is the check that it didn't.
describe("every zone page calls requirePageUser for its own zone", () => {
  const ZONES = { superadmin: "SUPERADMIN", admin: "ADMIN", dashboard: "EMPLOYEE", profile: "ANY" };

  for (const [dir, zone] of Object.entries(ZONES)) {
    const root = new URL(`../app/${dir}/`, import.meta.url);
    const pages = readdirSync(root, { recursive: true })
      .map(String)
      .filter((file) => /(^|[\\/])page\.tsx$/.test(file));

    it(`finds pages under /${dir}`, () => {
      expect(pages.length).toBeGreaterThan(0);
    });

    for (const page of pages) {
      it(`app/${dir}/${page.replace(/\\/g, "/")}`, () => {
        const source = readFileSync(new URL(page.replace(/\\/g, "/"), root), "utf8");
        expect(source).toContain(`requirePageUser("${zone}")`);
      });
    }
  }
});
