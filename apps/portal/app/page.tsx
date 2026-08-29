import Link from "next/link";
import { Check, Grid3x3, KeyRound, ScrollText, Shield } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

const ZONE_BY_USER_TYPE: Record<string, string> = {
  SUPERADMIN: "/superadmin",
  ADMIN: "/admin",
  EMPLOYEE: "/dashboard",
};

// Decorative preview of the real Access Matrix (Role x Application). Not
// live data - just enough of a pattern to read as believable. Purely
// illustrative, so the whole thing is aria-hidden; the surrounding copy
// carries the meaning for screen readers.
const MATRIX_ROLES = ["HR", "Finance", "IT", "Ops"];
const MATRIX_APPS = ["Payroll", "CRM", "VPN", "Docs"];
const MATRIX_GRANTS = [
  [true, false, false, true],
  [true, true, false, true],
  [false, false, true, true],
  [false, false, true, false],
];

const STEPS = [
  {
    title: "Sign in once",
    body: "Through Keycloak, the identity provider — one login for every connected app.",
  },
  {
    title: "Land on your tier",
    body: "SuperAdmin, Admin, or Employee — the dashboard that matches your account.",
  },
  {
    title: "See only your grants",
    body: "Roles decide which applications appear. Everything else stays out of reach.",
  },
];

const FEATURES = [
  {
    icon: KeyRound,
    title: "Single sign-on",
    body: "Keycloak holds your credentials. Sign in once, reach every connected app without a second prompt.",
  },
  {
    icon: Shield,
    title: "Role-based access",
    body: "Your account type decides what you manage. Your role decides what you see — two separate questions.",
  },
  {
    icon: Grid3x3,
    title: "Access matrix",
    body: "Every grant between a role and an application lives in one grid. Change it there, and it changes everywhere.",
  },
  {
    icon: ScrollText,
    title: "Audit trail",
    body: "Every create, update, and delete is recorded — who, what, and when. Nothing happens off the record.",
  },
];

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(ZONE_BY_USER_TYPE[session.user.userType] ?? "/profile");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 md:px-10">
        <span className="font-semibold tracking-tight">IAM Portal</span>
        <ThemeToggle />
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-16 px-6 py-12 md:grid-cols-2 md:items-center md:py-20 md:px-10">
          <div className="flex flex-col gap-6">
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
              Identity &amp; Access Management
            </span>
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight md:text-5xl">
              One sign-in. Every app. Access only where it&apos;s granted.
            </h1>
            <p className="max-w-md text-base text-muted-foreground">
              Keycloak owns who you are. This portal decides what you can reach —
              by role, not by guesswork. Every grant and every sign-in lands in
              one audit trail.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link href="/api/auth/signin" className={buttonVariants({ size: "lg" })}>
                Sign in
              </Link>
              <span className="text-xs text-muted-foreground">
                Redirects to Keycloak — this app never sees your password.
              </span>
            </div>
          </div>

          <div aria-hidden="true" className="mx-auto w-full max-w-xs">
            <div className="grid grid-cols-[auto_repeat(4,1fr)] items-center gap-1.5">
              <span />
              {MATRIX_APPS.map((app) => (
                <span
                  key={app}
                  className="truncate text-center font-mono text-[10px] tracking-tight text-muted-foreground uppercase"
                >
                  {app}
                </span>
              ))}
              {MATRIX_ROLES.flatMap((role, r) => [
                <span
                  key={`role-${role}`}
                  className="pr-2 text-right font-mono text-[10px] tracking-tight text-muted-foreground uppercase"
                >
                  {role}
                </span>,
                ...MATRIX_APPS.map((app, c) => {
                  const granted = MATRIX_GRANTS[r][c];
                  const delay = (r * MATRIX_APPS.length + c) * 90;
                  return (
                    <span
                      key={`${role}-${app}`}
                      style={{ animationDelay: `${delay}ms` }}
                      className={cn(
                        "matrix-cell flex size-8 items-center justify-center rounded-md border md:size-9",
                        granted
                          ? "border-transparent bg-foreground text-background"
                          : "border-border/60 bg-muted/40"
                      )}
                    >
                      {granted && <Check className="size-3.5" strokeWidth={2.5} />}
                    </span>
                  );
                }),
              ])}
            </div>
            <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
              role × application access grid
            </p>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
            <h2 className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
              How it works
            </h2>
            <ol className="mt-6 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    0{i + 1}
                  </span>
                  <p className="font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="size-5 text-muted-foreground" />
                  <CardTitle className="mt-3">{feature.title}</CardTitle>
                  <CardDescription>{feature.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
