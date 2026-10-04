// One-time setup script: creates the first SuperAdmin account.
// Nobody exists yet to create this through the app UI, so it's bootstrapped
// directly here — creates the Keycloak login + the matching Postgres User row.
//
// Goes through lib/keycloak-admin.ts like every other account creation, so it
// acts as the realm's portal-admin service account (KEYCLOAK_ADMIN_CLIENT_ID /
// KEYCLOAK_ADMIN_CLIENT_SECRET), not Keycloak's master admin.
//
// Run with: node scripts/bootstrap-superadmin.ts   (from apps/portal)

import "dotenv/config";
import { prisma } from "../lib/prisma.ts";
import { createKeycloakUser, findKeycloakUserIdByEmail } from "../lib/keycloak-admin.ts";

const { KEYCLOAK_BASE_URL, KEYCLOAK_REALM, SUPERADMIN_NAME, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } =
  process.env;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const baseUrl = requireEnv("KEYCLOAK_BASE_URL", KEYCLOAK_BASE_URL);
  const realm = requireEnv("KEYCLOAK_REALM", KEYCLOAK_REALM);
  const name = requireEnv("SUPERADMIN_NAME", SUPERADMIN_NAME);
  const email = requireEnv("SUPERADMIN_EMAIL", SUPERADMIN_EMAIL);
  const password = requireEnv("SUPERADMIN_PASSWORD", SUPERADMIN_PASSWORD);

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User ${email} already exists in Postgres (userType: ${existing.userType}). Nothing to do.`);
      return;
    }

    let keycloakId = await findKeycloakUserIdByEmail(email);
    if (keycloakId) {
      console.log(`Keycloak user "${email}" already exists, reusing it.`);
    } else {
      keycloakId = await createKeycloakUser({ name, email, password });
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
    console.log(`\nDone. Log in at ${baseUrl}/realms/${realm}/account with username "${email}" and the temp password.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
