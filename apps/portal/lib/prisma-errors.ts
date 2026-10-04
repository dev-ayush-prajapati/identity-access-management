// Prisma's code for a known request failure — "P2002" (unique constraint),
// "P2025" (record to update/delete not found), ... — or undefined for any
// other error. Lets a route answer the failures it expects (404, 409) without
// swallowing the ones it doesn't: a database outage must stay a 500, not get
// reported as "not found".
//
// Matched by name, not `instanceof Prisma.PrismaClientKnownRequestError`:
// under Next.js, Prisma's runtime loads as two copies, so the class a route
// imports is not the class that threw and `instanceof` is silently false —
// confirmed live, while plain Node and the unit tests (one copy) both pass.
// lib/prisma-errors.test.ts covers that case.
export function prismaErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Error) || err.name !== "PrismaClientKnownRequestError") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

// For `.catch(nullIfNotFound)` on an update/delete by id: the record being
// gone becomes null (→ 404), anything else is rethrown.
export function nullIfNotFound(err: unknown): null {
  if (prismaErrorCode(err) === "P2025") return null;
  throw err;
}
