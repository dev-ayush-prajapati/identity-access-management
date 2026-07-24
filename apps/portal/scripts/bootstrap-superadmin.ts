// One-time setup script: creates the first SuperAdmin account.
// Nobody exists yet to create this through the app UI, so it's bootstrapped
// directly here — creates the Keycloak login + the matching Postgres User row.
//
// Run with: node scripts/bootstrap-superadmin.ts   (from apps/portal)

import "dotenv/config";
import { prisma } from "../lib/prisma.ts";

const {
  KEYCLOAK_BASE_URL,
  KEYCLOAK_REALM,
  KEYCLOAK_ADMIN_USER,
  KEYCLOAK_ADMIN_PASSWORD,
  SUPERADMIN_NAME,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
} = process.env;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function getAdminToken(baseUrl: string, user: string, password: string) {
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "admin-cli",
      username: user,
      password: password,
      grant_type: "password",
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get admin token: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

async function findUserByUsername(baseUrl: string, realm: string, token: string, username: string) {
  const res = await fetch(
    `${baseUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Failed to query users: ${res.status} ${await res.text()}`);
  }
  const users = await res.json();
  return users[0] ?? null;
}

async function createKeycloakUser(
  baseUrl: string,
  realm: string,
  token: string,
  { name, email, password }: { name: string; email: string; password: string }
) {
  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: name,
      email,
      enabled: true,
      emailVerified: true,
      requiredActions: ["UPDATE_PASSWORD"],
      credentials: [{ type: "password", value: password, temporary: true }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create Keycloak user: ${res.status} ${await res.text()}`);
  }
  const location = res.headers.get("Location");
  const keycloakId = location?.split("/").pop();
  if (!keycloakId) {
    throw new Error("Keycloak did not return a user ID for the created user");
  }
  return keycloakId;
}

async function main() {
  const baseUrl = requireEnv("KEYCLOAK_BASE_URL", KEYCLOAK_BASE_URL);
  const realm = requireEnv("KEYCLOAK_REALM", KEYCLOAK_REALM);
  const adminUser = requireEnv("KEYCLOAK_ADMIN_USER", KEYCLOAK_ADMIN_USER);
  const adminPassword = requireEnv("KEYCLOAK_ADMIN_PASSWORD", KEYCLOAK_ADMIN_PASSWORD);
  const name = requireEnv("SUPERADMIN_NAME", SUPERADMIN_NAME);
  const email = requireEnv("SUPERADMIN_EMAIL", SUPERADMIN_EMAIL);
  const password = requireEnv("SUPERADMIN_PASSWORD", SUPERADMIN_PASSWORD);

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User ${email} already exists in Postgres (userType: ${existing.userType}). Nothing to do.`);
      return;
    }

    const token = await getAdminToken(baseUrl, adminUser, adminPassword);

    let keycloakId: string;
    const existingKeycloakUser = await findUserByUsername(baseUrl, realm, token, name);
    if (existingKeycloakUser) {
      console.log(`Keycloak user "${name}" already exists, reusing it.`);
      keycloakId = existingKeycloakUser.id;
    } else {
      keycloakId = await createKeycloakUser(baseUrl, realm, token, { name, email, password });
      console.log(`Created Keycloak user "${name}" (id: ${keycloakId}), temp password set, forced reset on first login.`);
    }

    const user = await prisma.user.create({
      data: {
        keycloakId,
        name,
        email,
        userType: "SUPERADMIN",
      },
    });

    console.log(`Created Postgres User row (id: ${user.id}, userType: SUPERADMIN).`);
    console.log(`\nDone. Log in at ${baseUrl}/realms/${realm}/account with username "${name}" and the temp password.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
