import Link from "next/link";
import { Playfair_Display, Inter } from "next/font/google";
import {
  Activity,
  Check,
  Grid3x3,
  KeyRound,
  ScrollText,
  Shield,
} from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/common/animated-number";

const displaySerif = Playfair_Display({
  variable: "--font-slash-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const uiSans = Inter({
  variable: "--font-slash-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

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

// Decorative preview of the Audit Log, same treatment as the matrix above:
// illustrative only, aria-hidden, not a claim about real activity.
const ACTIVITY_FEED = [
  { actor: "Admin", action: "granted Finance → CRM" },
  { actor: "Employee", action: "signed in via SSO" },
  { actor: "SuperAdmin", action: "added a new application" },
  { actor: "Admin", action: "revoked IT → Payroll" },
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

const STATS = [
  { value: 3, caption: "account tiers — SuperAdmin, Admin, Employee, each seeing only their own tools." },
  { value: 1, caption: "sign-in, shared by every connected app through Keycloak." },
  { value: 100, suffix: "%", caption: "of grants and sign-ins written to one audit trail — nothing off the record." },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slash-copper focus-visible:ring-offset-2 focus-visible:ring-offset-slash-obsidian";

function LiveDot() {
  return (
    <span className="relative mr-1.5 inline-flex size-1.5">
      <span className="pulse-dot absolute inline-block size-1.5 rounded-full bg-slash-copper" />
      <span className="relative inline-block size-1.5 rounded-full bg-slash-copper" />
    </span>
  );
}

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(ZONE_BY_USER_TYPE[session.user.userType] ?? "/profile");
  }

  return (
    <div
      className={cn(
        displaySerif.variable,
        uiSans.variable,
        "min-h-screen bg-slash-obsidian text-slash-bone [font-family:var(--font-slash-sans)]"
      )}
    >
      <header className="mx-auto flex max-w-[1216px] items-center justify-between px-6 py-6 md:px-10">
        <span className="text-sm font-medium tracking-tight text-slash-paper">
          IAM Portal
        </span>
        <Link
          href="/api/auth/signin"
          className={cn(
            "rounded-full border border-slash-paper/80 px-5 py-2 text-sm font-medium text-slash-paper transition-colors hover:bg-slash-paper/10",
            focusRing
          )}
        >
          Sign in
        </Link>
      </header>

      <main>
        <section className="relative overflow-hidden">
          {/* Ambient glow - purely atmospheric, sits behind everything in this section. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div
              className="absolute top-[-12rem] left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
              style={{ backgroundImage: "var(--gradient-slash-gilded)" }}
            />
          </div>

          <div className="mx-auto grid max-w-[1216px] gap-16 px-6 py-16 md:grid-cols-2 md:items-center md:py-28">
            <div className="stagger flex flex-col gap-6">
              <span className="animate-fade-up font-mono text-xs tracking-[0.2em] text-slash-copper uppercase">
                Identity &amp; Access Management
              </span>
              <h1 className="animate-fade-up text-6xl leading-[0.98] font-semibold tracking-[0.01em] text-slash-paper md:text-7xl lg:text-[5.5rem] [font-family:var(--font-slash-display)]">
                One sign-in. Every app. Access only where it&apos;s granted.
              </h1>
              <p className="animate-fade-up max-w-md text-base leading-relaxed text-slash-bone">
                Keycloak owns who you are. This portal decides what you can reach —
                by role, not by guesswork. Every grant and every sign-in lands in
                one audit trail.
              </p>
              <div className="animate-fade-up flex flex-col gap-2 sm:flex-row sm:items-center">
                <Link
                  href="/api/auth/signin"
                  className={cn(
                    "rounded-full bg-slash-paper px-6 py-3 text-sm font-medium text-black transition-transform duration-200 hover:scale-[1.03] hover:opacity-90",
                    focusRing
                  )}
                >
                  Sign in
                </Link>
                <span className="text-xs text-slash-fog">
                  Redirects to Keycloak — this app never sees your password.
                </span>
              </div>
            </div>

            <div className="animate-scale-in flex flex-col gap-4">
              <div
                aria-hidden="true"
                className="scan-once relative overflow-hidden rounded-[10px] border border-slash-copper/15 bg-slash-onyx p-6"
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex items-center font-mono text-[10px] tracking-[0.15em] text-slash-fog uppercase">
                    <LiveDot />
                    Access matrix
                  </span>
                  <span
                    className="h-1.5 w-10 rounded-full"
                    style={{ backgroundImage: "var(--gradient-slash-gilded)" }}
                  />
                </div>
                <div className="grid grid-cols-[auto_repeat(4,1fr)] items-center gap-1.5">
                  <span />
                  {MATRIX_APPS.map((app) => (
                    <span
                      key={app}
                      className="truncate text-center font-mono text-[10px] tracking-tight text-slash-fog uppercase"
                    >
                      {app}
                    </span>
                  ))}
                  {MATRIX_ROLES.flatMap((role, r) => [
                    <span
                      key={`role-${role}`}
                      className="pr-2 text-right font-mono text-[10px] tracking-tight text-slash-fog uppercase"
                    >
                      {role}
                    </span>,
                    ...MATRIX_APPS.map((app, c) => {
                      const granted = MATRIX_GRANTS[r][c];
                      const delay = (r * MATRIX_APPS.length + c) * 90;
                      return (
                        <span
                          key={`${role}-${app}`}
                          style={{
                            animationDelay: `${delay}ms`,
                            ...(granted
                              ? { backgroundImage: "var(--gradient-slash-gilded)" }
                              : {}),
                          }}
                          className={cn(
                            "matrix-cell flex size-8 items-center justify-center rounded-md md:size-9",
                            granted
                              ? "text-black"
                              : "border border-slash-graphite bg-slash-carbon/40"
                          )}
                        >
                          {granted && <Check className="size-3.5" strokeWidth={2.5} />}
                        </span>
                      );
                    }),
                  ])}
                </div>
              </div>

              <div
                aria-hidden="true"
                className="rounded-[10px] border border-slash-graphite bg-slash-onyx p-6"
              >
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="size-3.5 text-slash-fog" />
                  <span className="font-mono text-[10px] tracking-[0.15em] text-slash-fog uppercase">
                    Recent activity
                  </span>
                </div>
                <ul className="stagger flex flex-col gap-3">
                  {ACTIVITY_FEED.map((item) => (
                    <li
                      key={`${item.actor}-${item.action}`}
                      className="animate-fade-in flex items-center justify-between border-b border-slash-graphite pb-3 text-sm last:border-0 last:pb-0"
                    >
                      <span className="text-slash-silver">{item.actor}</span>
                      <span className="text-slash-fog">{item.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slash-graphite">
          <div className="mx-auto max-w-[1216px] px-6 py-16 md:px-10 md:py-24">
            <span className="font-mono text-xs tracking-[0.2em] text-slash-copper uppercase">
              How it works
            </span>
            <ol className="mt-6 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex flex-col gap-2">
                  <span className="font-mono text-sm text-slash-fog">
                    0{i + 1}
                  </span>
                  <p className="font-medium text-slash-paper">{step.title}</p>
                  <p className="text-sm leading-relaxed text-slash-fog">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1216px] px-6 py-16 md:px-10 md:py-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-[10px] border border-slash-graphite p-6 transition-all duration-200 hover:-translate-y-1 hover:border-slash-copper/40"
              >
                <feature.icon
                  className="size-5 text-slash-steel transition-colors duration-200 group-hover:text-slash-copper"
                  strokeWidth={1.5}
                />
                <p className="mt-3 font-medium text-slash-paper">{feature.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slash-fog">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slash-graphite">
          <div className="mx-auto grid max-w-[1216px] gap-8 px-6 py-16 sm:grid-cols-3 md:px-10 md:py-24">
            {STATS.map((stat) => (
              <div key={stat.caption} className="flex flex-col gap-2">
                <span className="text-4xl font-semibold text-slash-paper [font-family:var(--font-slash-display)]">
                  <AnimatedNumber value={stat.value} durationMs={1200} />
                  {stat.suffix}
                </span>
                <p className="text-sm leading-relaxed text-slash-fog">{stat.caption}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slash-graphite">
        <div className="mx-auto max-w-[1216px] px-6 py-8 text-xs text-slash-fog md:px-10">
          IAM Portal — Identity &amp; Access Management
        </div>
      </footer>
    </div>
  );
}
