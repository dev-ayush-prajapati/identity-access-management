// Demo seed script: fills the database with enough data that every screen has
// something to show — roles, an application catalog, a lopsided access matrix,
// one Admin, six Employees, and a backdated audit trail behind all of it.
// On a fresh database every screen is an empty state, which demos badly.
//
// Idempotent: every entity is looked up by its unique field (Role.name,
// Application.name, User.email) and skipped if it already exists, so re-running
// never duplicates anything. Audit entries are written only for what this run
// actually created, which keeps the log honest on a re-run.
//
// Run scripts/bootstrap-superadmin.ts first (this attributes the application
// catalog to that SuperAdmin, the way the real routes would).
//
// Run with: node scripts/seed-demo.ts   (from apps/portal)

import "dotenv/config";
import { prisma } from "../lib/prisma.ts";
import { createKeycloakUser, generateTempPassword } from "../lib/keycloak-admin.ts";

const {
  DATABASE_URL,
  KEYCLOAK_BASE_URL,
  KEYCLOAK_REALM,
  KEYCLOAK_ADMIN_USER,
  KEYCLOAK_ADMIN_PASSWORD,
} = process.env;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Everything seeded is backdated. The overview's activity chart buckets the
// last 14 days, so stamping every event with now() would draw one tall bar and
// thirteen empty ones — which tells an evaluator nothing.
function daysAgo(days: number, hour: number, minute: number): Date {
  const at = new Date();
  at.setDate(at.getDate() - days);
  at.setHours(hour, minute, 0, 0);
  return at;
}

function plusMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

const COMPANY_DOMAIN = "northwind.example.com";

const ROLES = [
  { name: "HR", at: daysAgo(13, 9, 40) },
  { name: "Finance", at: daysAgo(13, 9, 55) },
  { name: "Engineering", at: daysAgo(12, 10, 5) },
  { name: "Operations", at: daysAgo(12, 10, 20) },
];

const APPLICATIONS = [
  {
    name: "Company Intranet",
    description: "Announcements, policies, and the people directory.",
    url: "https://intranet.example.com",
    at: daysAgo(12, 14, 30),
  },
  {
    name: "Finance App",
    description: "Expense claims and invoices. Opens without a second sign-in — same session.",
    // The one real URL in the catalog: this is the second Next.js app, and
    // clicking through to it without a second login is the SSO proof the whole
    // demo turns on. The rest point at example.com on purpose.
    url: "http://localhost:3001",
    at: daysAgo(11, 11, 15),
  },
  {
    name: "Service Desk",
    description: "Raise a ticket for hardware, access, or anything broken.",
    url: "https://servicedesk.example.com",
    at: daysAgo(11, 11, 40),
  },
  {
    name: "People Hub",
    description: "Leave requests, onboarding, and performance reviews.",
    url: "https://people.example.com",
    at: daysAgo(10, 9, 25),
  },
  {
    name: "Deploy Console",
    description: "Build pipelines, environments, and release history.",
    url: "https://deploy.example.com",
    at: daysAgo(10, 16, 5),
  },
];

// Deliberately lopsided — 11 of the 20 possible pairs. A full grid would prove
// nothing: what an evaluator should see is that the role, not the person,
// decides what shows up, so only Finance reaches the finance app and only HR
// reaches People Hub.
const ACCESS = [
  {
    role: "HR",
    applications: ["Company Intranet", "Service Desk", "People Hub"],
    at: daysAgo(9, 10, 0),
  },
  {
    role: "Finance",
    applications: ["Company Intranet", "Finance App"],
    at: daysAgo(8, 11, 20),
  },
  {
    role: "Engineering",
    applications: ["Company Intranet", "Service Desk", "Deploy Console"],
    at: daysAgo(7, 9, 45),
  },
  {
    role: "Operations",
    applications: ["Company Intranet", "Service Desk", "Deploy Console"],
    at: daysAgo(6, 15, 10),
  },
];

// Admins carry no Role — a Role only decides which applications an Employee
// sees, and an Admin's powers come from userType instead.
const ADMIN = {
  name: "Meera Iyer",
  email: `meera.iyer@${COMPANY_DOMAIN}`,
  at: daysAgo(13, 9, 10),
};

const EMPLOYEES = [
  { name: "Ananya Rao", email: `ananya.rao@${COMPANY_DOMAIN}`, role: "HR", at: daysAgo(5, 9, 30) },
  { name: "Rohan Mehta", email: `rohan.mehta@${COMPANY_DOMAIN}`, role: "Finance", at: daysAgo(5, 9, 48) },
  { name: "Sara Khan", email: `sara.khan@${COMPANY_DOMAIN}`, role: "Finance", at: daysAgo(4, 13, 5) },
  { name: "Vikram Nair", email: `vikram.nair@${COMPANY_DOMAIN}`, role: "Engineering", at: daysAgo(3, 10, 40) },
  { name: "Dev Patel", email: `dev.patel@${COMPANY_DOMAIN}`, role: "Engineering", at: daysAgo(3, 10, 52) },
  { name: "Neha Joshi", email: `neha.joshi@${COMPANY_DOMAIN}`, role: "Operations", at: daysAgo(1, 9, 15) },
];

type Outcome = "created" | "skipped" | "blocked";

const MARKS: Record<Outcome, string> = { created: "+", skipped: "=", blocked: "!" };
const counts: Record<Outcome, number> = { created: 0, skipped: 0, blocked: 0 };

function report(outcome: Outcome, label: string) {
  counts[outcome] += 1;
  console.log(`  ${MARKS[outcome]} ${label}`);
}

// Audit rows can only be attributed to an account that exists. If the Admin
// couldn't be created and there's no SuperAdmin either, say how many entries
// were dropped rather than writing ownerless rows.
let unattributedAudits = 0;

async function recordAudit(actorId: string | null, action: string, details: string, at: Date) {
  if (!actorId) {
    unattributedAudits += 1;
    return;
  }
  await prisma.auditLog.create({ data: { userId: actorId, action, details, createdAt: at } });
}

async function assertPostgresReady() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Cannot reach Postgres with DATABASE_URL. Start the containers first: `docker compose up -d` from the repo root."
    );
  }
  try {
    await prisma.role.count();
  } catch {
    throw new Error("Postgres is up but the schema is missing. Run `npx prisma migrate deploy` first.");
  }
}

async function assertKeycloakReady(baseUrl: string, realm: string) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/realms/${realm}/.well-known/openid-configuration`);
  } catch {
    throw new Error(
      `Cannot reach Keycloak at ${baseUrl}. Start the containers first: \`docker compose up -d\` from the repo root.`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Keycloak answered ${res.status} for realm "${realm}". Check KEYCLOAK_REALM against keycloak/realm-export.json.`
    );
  }
}

interface Person {
  name: string;
  email: string;
  at: Date;
  userType: "ADMIN" | "EMPLOYEE";
  roleId: string | null;
  createdById: string | null;
}

type SeededUser =
  | { status: "created"; id: string; password: string }
  | { status: "skipped"; id: string }
  | { status: "blocked" };

async function seedUser(person: Person): Promise<SeededUser> {
  const existing = await prisma.user.findUnique({ where: { email: person.email } });
  if (existing) {
    report("skipped", `${person.name} (${person.email})`);
    return { status: "skipped", id: existing.id };
  }

  const password = generateTempPassword();

  // Keycloak first, never the reverse: it owns identity, and the signIn
  // callback rejects any login with no matching Postgres row. A Postgres row
  // written first would be a person who cannot sign in; a Keycloak account
  // written first is at worst an unused login this script tells you about.
  let keycloakId: string;
  try {
    keycloakId = await createKeycloakUser({
      name: person.name,
      email: person.email,
      password,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already exists")) {
      report("blocked", `${person.name} (${person.email})`);
      console.log("      Keycloak has this login but Postgres has no row for it, so it can't sign in.");
      console.log("      Delete the user in the Keycloak admin console (Users → search this email), then re-run.");
      return { status: "blocked" };
    }
    throw new Error(
      `Failed to create the Keycloak account for ${person.email}: ${message}. Nothing was written to Postgres for this person — fix Keycloak and re-run, the seeder picks up where it stopped.`
    );
  }

  const user = await prisma.user.create({
    data: {
      keycloakId,
      name: person.name,
      email: person.email,
      userType: person.userType,
      roleId: person.roleId,
      createdById: person.createdById,
      createdAt: person.at,
    },
  });

  report("created", `${person.name} (${person.email})`);
  return { status: "created", id: user.id, password };
}

// Returns name → id for every role, created or pre-existing, so the employee
// and access-matrix steps don't have to query for them again.
async function seedRoles(actorId: string | null): Promise<Map<string, string>> {
  console.log("\nRoles");
  const ids = new Map<string, string>();

  for (const role of ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: role.name } });
    if (existing) {
      ids.set(role.name, existing.id);
      report("skipped", role.name);
      continue;
    }

    const created = await prisma.role.create({ data: { name: role.name, createdAt: role.at } });
    ids.set(role.name, created.id);
    await recordAudit(actorId, "ROLE_CREATED", `Created role "${role.name}"`, role.at);
    report("created", role.name);
  }

  return ids;
}

async function seedApplications(actorId: string | null): Promise<Map<string, string>> {
  console.log("\nApplications");
  const ids = new Map<string, string>();

  for (const app of APPLICATIONS) {
    const existing = await prisma.application.findUnique({ where: { name: app.name } });
    if (existing) {
      ids.set(app.name, existing.id);
      report("skipped", `${app.name} — ${existing.url}`);
      continue;
    }

    const created = await prisma.application.create({
      data: {
        name: app.name,
        description: app.description,
        url: app.url,
        createdAt: app.at,
      },
    });
    ids.set(app.name, created.id);
    await recordAudit(actorId, "APPLICATION_CREATED", `Created application "${app.name}"`, app.at);
    report("created", `${app.name} — ${app.url}`);
  }

  return ids;
}

async function seedAccessMatrix(
  roleIds: Map<string, string>,
  applicationIds: Map<string, string>,
  actorId: string | null
) {
  console.log("\nAccess matrix");

  for (const entry of ACCESS) {
    const roleId = roleIds.get(entry.role);
    if (!roleId) {
      throw new Error(`No role id for "${entry.role}" — the ROLES and ACCESS tables disagree.`);
    }

    for (const [index, applicationName] of entry.applications.entries()) {
      const applicationId = applicationIds.get(applicationName);
      if (!applicationId) {
        throw new Error(
          `No application id for "${applicationName}" — the APPLICATIONS and ACCESS tables disagree.`
        );
      }

      const label = `${entry.role} → ${applicationName}`;
      const existing = await prisma.roleAccess.findUnique({
        where: { roleId_applicationId: { roleId, applicationId } },
      });
      if (existing) {
        report("skipped", label);
        continue;
      }

      await prisma.roleAccess.create({ data: { roleId, applicationId } });
      // Grants for one role land minutes apart rather than on the same
      // timestamp, so the audit log reads like someone working through the grid.
      await recordAudit(
        actorId,
        "ACCESS_GRANTED",
        `Granted "${entry.role}" access to "${applicationName}"`,
        plusMinutes(entry.at, index * 7)
      );
      report("created", label);
    }
  }
}

interface Login {
  email: string;
  name: string;
  access: string;
  password: string;
}

function printLogins(logins: Login[]) {
  if (logins.length === 0) return;

  const columns: [string, (login: Login) => string][] = [
    ["EMAIL", (login) => login.email],
    ["NAME", (login) => login.name],
    ["ACCESS", (login) => login.access],
    ["TEMP PASSWORD", (login) => login.password],
  ];
  const widths = columns.map(([header, pick]) =>
    Math.max(header.length, ...logins.map((login) => pick(login).length))
  );
  const row = (cells: string[]) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd();

  console.log(row(columns.map(([header]) => header)));
  console.log(row(widths.map((width) => "-".repeat(width))));
  for (const login of logins) {
    console.log(row(columns.map(([, pick]) => pick(login))));
  }
}

async function main() {
  requireEnv("DATABASE_URL", DATABASE_URL);
  const baseUrl = requireEnv("KEYCLOAK_BASE_URL", KEYCLOAK_BASE_URL);
  const realm = requireEnv("KEYCLOAK_REALM", KEYCLOAK_REALM);
  // Read by lib/keycloak-admin on every call — checked here too so a missing
  // one fails before anything is written, not halfway through the accounts.
  requireEnv("KEYCLOAK_ADMIN_USER", KEYCLOAK_ADMIN_USER);
  requireEnv("KEYCLOAK_ADMIN_PASSWORD", KEYCLOAK_ADMIN_PASSWORD);

  try {
    await assertPostgresReady();
    await assertKeycloakReady(baseUrl, realm);

    console.log("Seeding demo data.   + created   = already there   ! needs attention");

    const superAdmin = await prisma.user.findFirst({
      where: { userType: "SUPERADMIN" },
      orderBy: { createdAt: "asc" },
    });
    if (!superAdmin) {
      console.log(
        "\nNo SuperAdmin found. Run `node scripts/bootstrap-superadmin.ts` for the top tier — seeding the rest anyway."
      );
    }

    console.log("\nAdmin");
    const admin = await seedUser({
      ...ADMIN,
      userType: "ADMIN",
      roleId: null,
      createdById: superAdmin?.id ?? null,
    });
    const adminId = admin.status === "blocked" ? null : admin.id;

    // Audit rows are attributed the way the routes would have written them:
    // the application catalog is a SuperAdmin power, while roles, employees,
    // and the matrix belong to the Admin.
    const actorId = adminId ?? superAdmin?.id ?? null;
    const catalogActorId = superAdmin?.id ?? adminId;

    const roleIds = await seedRoles(actorId);
    const applicationIds = await seedApplications(catalogActorId);
    await seedAccessMatrix(roleIds, applicationIds, actorId);

    console.log("\nEmployees");
    const logins: Login[] = [];
    if (admin.status !== "blocked") {
      logins.push({
        email: ADMIN.email,
        name: ADMIN.name,
        access: "Admin",
        password: admin.status === "created" ? admin.password : "(set earlier — unchanged)",
      });
    }

    for (const employee of EMPLOYEES) {
      const roleId = roleIds.get(employee.role);
      if (!roleId) {
        throw new Error(`No role id for "${employee.role}" — the ROLES and EMPLOYEES tables disagree.`);
      }

      const seeded = await seedUser({
        name: employee.name,
        email: employee.email,
        at: employee.at,
        userType: "EMPLOYEE",
        roleId,
        createdById: adminId,
      });
      if (seeded.status === "blocked") continue;

      if (seeded.status === "created") {
        await recordAudit(
          actorId,
          "EMPLOYEE_CREATED",
          `Created employee "${employee.name}" (${employee.email})`,
          employee.at
        );
      }
      logins.push({
        email: employee.email,
        name: employee.name,
        access: `Employee (${employee.role})`,
        password: seeded.status === "created" ? seeded.password : "(set earlier — unchanged)",
      });
    }

    // The Admin's own audit row is written last because it needs an actor id,
    // and until the account exists there isn't one to attribute it to.
    if (admin.status === "created") {
      await recordAudit(
        superAdmin?.id ?? adminId,
        "ADMIN_CREATED",
        `Created admin "${ADMIN.name}" (${ADMIN.email})`,
        ADMIN.at
      );
    }

    console.log(
      `\nSummary: ${counts.created} created, ${counts.skipped} already there, ${counts.blocked} need attention.`
    );
    if (unattributedAudits > 0) {
      console.log(
        `${unattributedAudits} audit entries were skipped: no Admin or SuperAdmin exists to attribute them to.`
      );
    }

    console.log("\nLogins — Keycloak forces a password reset on first sign-in, so these are one-use:");
    printLogins(logins);

    console.log("\nNext: `npm run dev` here (port 3000) and in apps/finance-app (port 3001),");
    console.log("then sign in at http://localhost:3000 with any login above.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
