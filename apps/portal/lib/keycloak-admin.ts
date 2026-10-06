import crypto from "crypto";

// Thin wrapper over Keycloak's Admin REST API. Used by the User Management
// API routes and by scripts/bootstrap-superadmin.ts + seed-demo.ts — creating
// an app User always means creating a Keycloak login too, since Keycloak (not
// Postgres) owns credentials.
//
// Acts as this realm's `portal-admin` service account (client-credentials
// grant, see keycloak/realm-export.json), which holds only manage/view/query
// users in this realm. It used to sign in as Keycloak's master `admin`, which
// controls every realm and Keycloak itself — a leaked portal env would have
// handed over the whole installation. The master login now lives only in the
// root .env, for the container and scripts/sync-keycloak-realm.ts.

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

// Fresh token per call — a handful of admin operations per minute at most,
// so caching it isn't worth the expiry handling.
async function adminSession(): Promise<{ baseUrl: string; realm: string; token: string }> {
  const baseUrl = requireEnv("KEYCLOAK_BASE_URL", process.env.KEYCLOAK_BASE_URL);
  const realm = requireEnv("KEYCLOAK_REALM", process.env.KEYCLOAK_REALM);
  const clientId = requireEnv("KEYCLOAK_ADMIN_CLIENT_ID", process.env.KEYCLOAK_ADMIN_CLIENT_ID);
  const clientSecret = requireEnv("KEYCLOAK_ADMIN_CLIENT_SECRET", process.env.KEYCLOAK_ADMIN_CLIENT_SECRET);

  const res = await fetch(`${baseUrl}/realms/${realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    console.error(`Keycloak service-account token request failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to authenticate with Keycloak");
  }
  const data = await res.json();
  return { baseUrl, realm, token: data.access_token as string };
}

// Exact email match; null when there's no such login. Used by the bootstrap
// script to reuse a Keycloak account that already exists. By email, not
// username: accounts made before usernames were set to the email (the first
// SuperAdmin's username is just "ayush") would be missed, and the email is
// what the portal treats as a person's identity.
export async function findKeycloakUserIdByEmail(email: string): Promise<string | null> {
  const { baseUrl, realm, token } = await adminSession();

  const res = await fetch(
    `${baseUrl}/admin/realms/${realm}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    console.error(`Keycloak user lookup failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to look up the Keycloak account");
  }
  const users = (await res.json()) as { id: string }[];
  return users[0]?.id ?? null;
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
  const { baseUrl, realm, token } = await adminSession();

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

// Partial update: Keycloak changes only the fields sent.
async function updateKeycloakUser(keycloakId: string, fields: object, action: string): Promise<void> {
  const { baseUrl, realm, token } = await adminSession();

  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users/${keycloakId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });

  if (!res.ok) {
    console.error(`Keycloak ${action} user failed: ${res.status} ${await res.text()}`);
    throw new Error(`Failed to ${action} the Keycloak account`);
  }
}

export async function setKeycloakUserEnabled(keycloakId: string, enabled: boolean): Promise<void> {
  await updateKeycloakUser(keycloakId, { enabled }, enabled ? "enable" : "disable");
}

// The portal keeps one `name`; Keycloak's token `name` claim (what finance-app
// shows) is firstName + lastName. So the whole name goes in firstName and
// lastName is cleared — the realm's user profile makes lastName optional,
// otherwise Keycloak would demand one at the next sign-in.
export async function setKeycloakUserName(keycloakId: string, name: string): Promise<void> {
  await updateKeycloakUser(keycloakId, { firstName: name, lastName: "" }, "rename");
}

export async function resetKeycloakUserPassword(keycloakId: string, password: string): Promise<void> {
  const { baseUrl, realm, token } = await adminSession();

  const res = await fetch(
    `${baseUrl}/admin/realms/${realm}/users/${keycloakId}/reset-password`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "password", value: password, temporary: true }),
    }
  );

  if (!res.ok) {
    console.error(`Keycloak password reset failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to reset the Keycloak password");
  }
}

export async function deleteKeycloakUser(keycloakId: string): Promise<void> {
  const { baseUrl, realm, token } = await adminSession();

  const res = await fetch(`${baseUrl}/admin/realms/${realm}/users/${keycloakId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    console.error(`Keycloak delete user failed: ${res.status} ${await res.text()}`);
    throw new Error("Failed to delete Keycloak account");
  }
}
