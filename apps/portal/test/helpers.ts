import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import type { Mock } from "vitest";
import type { UserType } from "@/lib/generated/prisma";

// Shared fixtures for API route tests — keeps each route.test.ts focused on
// the behavior it's actually verifying instead of request/session plumbing.

export function fakeSession(overrides: {
  id?: string;
  userType: UserType;
  roleId?: string | null;
}): Session {
  return {
    user: {
      id: overrides.id ?? "user-1",
      userType: overrides.userType,
      roleId: overrides.roleId ?? null,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as Session;
}

export function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// `requireUserType` re-reads the caller's live status/userType/roleId from
// Postgres on every call (see lib/api-auth.ts) instead of trusting the
// session's JWT claims. For a route whose own logic never calls
// `prisma.user.findUnique` itself, this wires that lookup to just mirror
// whatever the test's mocked `auth()` currently resolves to, as an ACTIVE
// user — so route tests can keep configuring `authMock` the way they always
// have, with no per-test awareness of the live-status check underneath.
//
// Not for routes whose own logic also calls `prisma.user.findUnique` (e.g.
// a target-user lookup, or a duplicate-email check) — those need to
// dispatch on the `where` shape themselves, since this call and the
// caller-check both go through the same mocked function. See
// app/api/users/route.test.ts and app/api/users/[id]/route.test.ts.
export function mockLiveCallerFromSession(authMock: Mock, findUniqueMock: Mock): void {
  findUniqueMock.mockImplementation(async () => {
    const session = (await authMock()) as Session | null;
    if (!session?.user) return null;
    return { userType: session.user.userType, roleId: session.user.roleId, status: "ACTIVE" };
  });
}
