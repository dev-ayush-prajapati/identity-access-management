import { describe, expect, it } from "vitest";
import {
  AUDIT_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  auditHref,
  auditSearchWhere,
  auditWhere,
  categorizeAction,
  clampPage,
  parseAuditQuery,
  tallyCategories,
} from "./audit-query";

const rows = [
  { action: "ROLE_CREATED", _count: { _all: 3 } },
  { action: "EMPLOYEE_CREATED", _count: { _all: 2 } },
  { action: "ROLE_UPDATED", _count: { _all: 1 } },
  { action: "EMPLOYEE_ARCHIVED", _count: { _all: 4 } },
  { action: "ACCESS_GRANTED", _count: { _all: 5 } },
  { action: "ACCESS_REVOKED", _count: { _all: 1 } },
  { action: "LOGIN_DENIED", _count: { _all: 2 } },
  { action: "AUDIT_LOG_EXPORTED", _count: { _all: 7 } },
];

describe("categorizeAction", () => {
  it("reads the trailing verb", () => {
    expect(categorizeAction("ROLE_CREATED")).toBe("created");
    expect(categorizeAction("APPLICATION_UPDATED")).toBe("updated");
    expect(categorizeAction("ACCESS_GRANTED")).toBe("access");
    expect(categorizeAction("ACCESS_REVOKED")).toBe("access");
    expect(categorizeAction("AUTHZ_DENIED")).toBe("denied");
  });

  it("treats an archive as a delete", () => {
    expect(categorizeAction("ROLE_DELETED")).toBe("deleted");
    expect(categorizeAction("EMPLOYEE_ARCHIVED")).toBe("deleted");
  });

  it("puts anything unrecognized in other instead of throwing", () => {
    expect(categorizeAction("AUDIT_LOG_EXPORTED")).toBe("other");
    expect(categorizeAction("LOGOUT")).toBe("other");
  });
});

describe("parseAuditQuery", () => {
  it("defaults to the first page of everything", () => {
    expect(parseAuditQuery({})).toEqual({ q: "", category: "all", page: 1 });
  });

  it("trims the search and caps its length", () => {
    expect(parseAuditQuery({ q: "  amy  " }).q).toBe("amy");
    expect(parseAuditQuery({ q: "x".repeat(MAX_QUERY_LENGTH + 50) }).q).toHaveLength(
      MAX_QUERY_LENGTH
    );
  });

  it("accepts only a known category", () => {
    expect(parseAuditQuery({ category: "denied" }).category).toBe("denied");
    expect(parseAuditQuery({ category: "other" }).category).toBe("all");
    expect(parseAuditQuery({ category: "DROP TABLE" }).category).toBe("all");
  });

  it("falls back to page 1 for anything that isn't a positive integer", () => {
    expect(parseAuditQuery({ page: "3" }).page).toBe(3);
    for (const bad of ["0", "-2", "abc", "2.5", ""]) {
      expect(parseAuditQuery({ page: bad }).page).toBe(1);
    }
  });

  it("uses the first value when a param is repeated", () => {
    expect(parseAuditQuery({ q: ["first", "second"], page: ["2", "9"] })).toEqual({
      q: "first",
      category: "all",
      page: 2,
    });
  });
});

describe("auditSearchWhere", () => {
  it("matches everything for an empty search", () => {
    expect(auditSearchWhere("")).toEqual({});
  });

  it("searches every displayed field case-insensitively, including the live user fallback", () => {
    const contains = { contains: "amy", mode: "insensitive" };
    expect(auditSearchWhere("amy")).toEqual({
      OR: [
        { actorName: contains },
        { actorEmail: contains },
        { action: contains },
        { details: contains },
        { user: { is: { OR: [{ name: contains }, { email: contains }] } } },
      ],
    });
  });
});

describe("tallyCategories", () => {
  it("buckets action counts, with all including uncategorized actions", () => {
    expect(tallyCategories(rows)).toEqual({
      all: 25,
      created: 5,
      updated: 1,
      deleted: 4,
      access: 6,
      denied: 2,
    });
  });

  it("is all zeroes for an empty log", () => {
    expect(tallyCategories([])).toEqual({
      all: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      access: 0,
      denied: 0,
    });
  });
});

describe("auditWhere", () => {
  it("is just the search when no category is picked", () => {
    expect(auditWhere({ q: "amy", category: "all" }, rows)).toEqual(auditSearchWhere("amy"));
  });

  it("narrows to exactly the actions that categorize into the picked category", () => {
    expect(auditWhere({ q: "", category: "access" }, rows)).toEqual({
      AND: [{}, { action: { in: ["ACCESS_GRANTED", "ACCESS_REVOKED"] } }],
    });
    expect(auditWhere({ q: "", category: "deleted" }, rows)).toEqual({
      AND: [{}, { action: { in: ["EMPLOYEE_ARCHIVED"] } }],
    });
  });

  it("matches nothing when no action falls in the category", () => {
    expect(auditWhere({ q: "", category: "denied" }, [])).toEqual({
      AND: [{}, { action: { in: [] } }],
    });
  });
});

describe("clampPage", () => {
  it("keeps an in-range page", () => {
    expect(clampPage(2, AUDIT_PAGE_SIZE * 3)).toBe(2);
  });

  it("pulls a page past the end back to the last page", () => {
    expect(clampPage(99, AUDIT_PAGE_SIZE * 2 + 1)).toBe(3);
    expect(clampPage(1e20, AUDIT_PAGE_SIZE)).toBe(1);
  });

  it("is page 1 for an empty result", () => {
    expect(clampPage(5, 0)).toBe(1);
  });
});

describe("auditHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(auditHref({ q: "", category: "all", page: 1 })).toBe("/admin/audit");
  });

  it("carries search, category and page, encoded", () => {
    expect(auditHref({ q: "amy & co", category: "denied", page: 3 })).toBe(
      "/admin/audit?q=amy+%26+co&category=denied&page=3"
    );
  });
});
