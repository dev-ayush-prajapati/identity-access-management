import { NextRequest } from "next/server";
import type { Session } from "next-auth";
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

export function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function paramsOf(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
