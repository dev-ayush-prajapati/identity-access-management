import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import type { UserType } from "@/lib/generated/prisma";

// Server-side gate for API routes. Middleware already protects the page
// routes, but API routes are a separate surface (not covered by the
// middleware matcher) and must check for themselves — never rely on a
// protected page being the only thing standing between a request and data.
export async function requireUserType(
  allowed: UserType[]
): Promise<{ session: Session; error?: undefined } | { session?: undefined; error: NextResponse }> {
  const session = await auth();

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!allowed.includes(session.user.userType)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
}
