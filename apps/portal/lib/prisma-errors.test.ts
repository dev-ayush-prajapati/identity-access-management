import { describe, expect, it } from "vitest";
import { prismaError } from "@/test/helpers";
import { nullIfNotFound, prismaErrorCode } from "./prisma-errors";

// What Next.js actually hands a route: same name and code as Prisma's class,
// but thrown by a second copy of Prisma's runtime, so `instanceof` against
// the class the route imported is false. Seen live on a duplicate role
// rename — the 409 branch never ran and the route 500'd with an empty body.
function knownErrorFromAnotherCopy(code: string): Error {
  const err = new Error("Unique constraint failed") as Error & { code: string };
  err.name = "PrismaClientKnownRequestError";
  err.code = code;
  return err;
}

describe("prismaErrorCode", () => {
  it("reads the code off Prisma's own error class", () => {
    expect(prismaErrorCode(prismaError("P2002"))).toBe("P2002");
  });

  it("reads it when the error came from a different copy of the class", () => {
    expect(prismaErrorCode(knownErrorFromAnotherCopy("P2002"))).toBe("P2002");
  });

  it("ignores errors that aren't Prisma known-request errors, even with a code", () => {
    const connRefused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(prismaErrorCode(connRefused)).toBeUndefined();
    expect(prismaErrorCode(new Error("boom"))).toBeUndefined();
    expect(prismaErrorCode("P2002")).toBeUndefined();
    expect(prismaErrorCode(null)).toBeUndefined();
  });
});

describe("nullIfNotFound", () => {
  it("turns record-not-found into null", () => {
    expect(nullIfNotFound(knownErrorFromAnotherCopy("P2025"))).toBeNull();
  });

  it("rethrows anything else", () => {
    const err = knownErrorFromAnotherCopy("P2002");
    expect(() => nullIfNotFound(err)).toThrow(err);
  });
});
