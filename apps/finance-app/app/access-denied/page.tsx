import Link from "next/link";

const PORTAL_URL = "http://localhost:3000";

// Reached only via middleware.ts's redirect, when the portal's Access
// Matrix no longer grants this signed-in identity access to this app —
// not a login failure, so it deliberately doesn't look like one.
export default function AccessDeniedPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <main className="w-full max-w-md text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          Finance App · localhost:3001
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Access removed
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your role no longer grants access to this application. If this is
          unexpected, ask your admin to check the Access Matrix.
        </p>
        <Link
          href={PORTAL_URL}
          className="mt-6 inline-block text-sm underline underline-offset-4 hover:text-muted-foreground"
        >
          Back to the portal
        </Link>
      </main>
    </div>
  );
}
