import crypto from "crypto";

// Thin wrapper over Keycloak's Admin REST API (master realm admin-cli grant).
// Used both by scripts/bootstrap-superadmin.ts and by the User Management
// API routes — creating an app User always means creating a Keycloak login
// too, since Keycloak (not Postgres) owns credentials.

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function config() {
  return {
    baseUrl: requireEnv("KEYCLOAK_BASE_URL", process.env.KEYCLOAK_BASE_URL),
    realm: requireEnv("KEYCLOAK_REALM", process.env.KEYCLOAK_REALM),
    adminUser: requireEnv("KEYCLOAK_ADMIN_USER", process.env.KEYCLOAK_ADMIN_USER),
    adminPassword: requireEnv("KEYCLOAK_ADMIN_PASSWORD", process.env.KEYCLOAK_ADMIN_PASSWORD),
  };
}

export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

async function getAdminToken(baseUrl: string, user: string, password: string) {
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "admin-cli",
      username: user,
      password,
      grant_type: "password",
    }),
  });
  if (!res.ok) {
    console.error(`Keycloak admin token request failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to authenticate with Keycloak");
  }
  const data = await res.json();
  return data.access_token as string;
}

export async function createKeycloakUser({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}): Promise<string> {
  const { baseUrl, realm, adminUser, adminPassword } = config();
  const token = await getAdminToken(baseUrl, adminUser, adminPassword);

  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: email,
      email,
      firstName: name,
      enabled: true,
      emailVerified: true,
      requiredActions: ["UPDATE_PASSWORD"],
      credentials: [{ type: "password", value: password, temporary: true }],
    }),
  });

  if (res.status === 409) {
    throw new Error("A Keycloak user with this email already exists");
  }
  if (!res.ok) {
    console.error(`Keycloak create user failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to create Keycloak account");
  }

  const location = res.headers.get("Location");
  const keycloakId = location?.split("/").pop();
  if (!keycloakId) {
    throw new Error("Keycloak did not return a user ID for the created user");
  }
  return keycloakId;
}

export async function deleteKeycloakUser(keycloakId: string): Promise<void> {
  const { baseUrl, realm, adminUser, adminPassword } = config();
  const token = await getAdminToken(baseUrl, adminUser, adminPassword);

  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users/${keycloakId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    console.error(`Keycloak delete user failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to delete Keycloak account");
  }
}
