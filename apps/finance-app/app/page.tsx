import { auth } from "@/auth";
import { redirect } from "next/navigation";

const PORTAL_URL = "http://localhost:3000";

// Sole purpose of this app: prove SSO. If there's no local session yet,
// send to Auth.js's sign-in page (one click on "Sign in with Keycloak" —
// required, since initiating sign-in needs a CSRF-protected POST, which
// can't happen from a plain Server Component). If the browser already has
// a Keycloak session (from Portal), that click won't ask for a password —
// that's the actual SSO proof, not the click itself.
//
// Still no database and no business logic here, by design. What this page
// adds is legibility: the moment an evaluator lands here is the payoff of
// the whole demo, so the page says plainly what just happened.
export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const { name, email } = session.user;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <main className="stagger w-full max-w-2xl">
        <div className="animate-fade-up">
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            Finance App · localhost:3001
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            You&apos;re already signed in.
          </h1>
          <p className="mt-2 text-muted-foreground">
            This is a separate application from the portal — different codebase,
            different port, its own session cookie. You never entered a password
            here.
          </p>
        </div>

        <div className="animate-fade-up mt-8 rounded-xl border border-border bg-card p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="mt-0.5 font-medium">{name ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="mt-0.5 font-medium break-all">{email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Identity provider</dt>
              <dd className="mt-0.5 font-medium">Keycloak · realm iam-portal</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Session cookie</dt>
              <dd className="mt-0.5 font-mono text-xs font-medium">
                financeapp-session-token
              </dd>
            </div>
          </dl>
        </div>

        <div className="animate-fade-up mt-4 rounded-xl border border-border p-5">
          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
            What just happened
          </p>

          <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm">
              <p className="font-medium">Portal</p>
              <p className="font-mono text-xs text-muted-foreground">:3000</p>
            </div>

            <div
              aria-hidden
              className="text-center text-xs text-muted-foreground sm:px-1"
            >
              →
            </div>

            <div className="flex-1 rounded-lg border border-foreground bg-foreground px-3 py-2 text-center text-sm text-background">
              <p className="font-medium">Keycloak</p>
              <p className="font-mono text-xs opacity-70">one session</p>
            </div>

            <div
              aria-hidden
              className="text-center text-xs text-muted-foreground sm:px-1"
            >
              →
            </div>

            <div className="flex-1 rounded-lg border border-border px-3 py-2 text-center text-sm">
              <p className="font-medium">Finance App</p>
              <p className="font-mono text-xs text-muted-foreground">:3001</p>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Both applications trust the same Keycloak realm, so the session you
            opened at the portal is the one that let you in here. Signing out
            from the portal ends it in both places.
          </p>
        </div>

        <div className="animate-fade-up mt-6">
          <a
            href={PORTAL_URL}
            className="text-sm underline underline-offset-4 hover:text-muted-foreground"
          >
            Back to the portal
          </a>
        </div>
      </main>
    </div>
  );
}
