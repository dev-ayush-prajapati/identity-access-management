// Applies keycloak/realm-export.json to an already-running Keycloak.
//
// docker-compose.yml starts Keycloak with --import-realm, which only imports a
// realm that doesn't exist yet — so edits to the export never reach an
// existing install. This closes that gap, idempotently (safe to re-run):
//   1. realm settings (everything in the export except clients/users/components)
//   2. user profile (the one component the export carries)
//   3. clients — created if missing, updated if present (export wins)
//   4. service-account role grants (users[] entries with serviceAccountClientId)
//
// Operator-only. It signs in as Keycloak's master admin from the ROOT .env —
// the one place outside the container that login is used. The portal app
// itself acts as the realm-scoped portal-admin service account instead.
//
// Run (from apps/portal):
//   node --env-file=../../.env --env-file=.env scripts/sync-keycloak-realm.ts

import { readFileSync } from "node:fs";

type ClientRep = { clientId: string; id?: string; attributes?: Record<string, string> } & Record<string, unknown>;
type UserRep = { username: string; serviceAccountClientId?: string; clientRoles?: Record<string, string[]> };
type ComponentRep = { config?: Record<string, string[]> };
type RealmExport = {
  realm: string;
  clients?: ClientRep[];
  users?: UserRep[];
  components?: Record<string, ComponentRep[]>;
} & Record<string, unknown>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const baseUrl = requireEnv("KEYCLOAK_BASE_URL");
const realm = requireEnv("KEYCLOAK_REALM");
const adminUser = requireEnv("KEYCLOAK_ADMIN_USER");
const adminPassword = requireEnv("KEYCLOAK_ADMIN_PASSWORD");

const exported = JSON.parse(
  readFileSync(new URL("../../../keycloak/realm-export.json", import.meta.url), "utf8")
) as RealmExport;

if (exported.realm !== realm) {
  throw new Error(`realm-export.json is for "${exported.realm}", but KEYCLOAK_REALM is "${realm}"`);
}

async function masterToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "admin-cli",
      username: adminUser,
      password: adminPassword,
      grant_type: "password",
    }),
  });
  if (!res.ok) {
    throw new Error(`Master admin sign-in failed: ${res.status} ${await res.text()}`);
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

const token = await masterToken();

// Admin REST call scoped to this realm; JSON in, JSON (or nothing) out.
async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/admin/realms/${realm}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function findClient(clientId: string): Promise<ClientRep | undefined> {
  const [client] = await api<ClientRep[]>("GET", `/clients?clientId=${encodeURIComponent(clientId)}`);
  return client;
}

const { clients = [], users = [], components = {}, ...settings } = exported;

console.log(`Syncing keycloak/realm-export.json → ${baseUrl} (realm ${realm})\n`);

// 1. Realm settings. Keycloak applies only the fields present.
await api("PUT", "", settings);
console.log(`  = realm settings (${Object.keys(settings).join(", ")})`);

// 2. User profile. An import reads it from this component, but the realm PUT
// above ignores components — it has its own endpoint, taking the same JSON.
const userProfile =
  components["org.keycloak.userprofile.UserProfileProvider"]?.[0]?.config?.["kc.user.profile.config"]?.[0];
if (userProfile) {
  await api("PUT", "/users/profile", JSON.parse(userProfile));
  console.log("  = user profile");
}

// 3. Clients.
for (const client of clients) {
  const existing = await findClient(client.clientId);
  if (!existing) {
    await api("POST", "/clients", client);
    console.log(`  + created client ${client.clientId}`);
  } else {
    await api("PUT", `/clients/${existing.id}`, {
      ...existing,
      ...client,
      attributes: { ...existing.attributes, ...client.attributes },
    });
    console.log(`  = updated client ${client.clientId}`);
  }
}

// 4. Service-account role grants. Re-granting a role it already holds is a no-op.
for (const user of users) {
  if (!user.serviceAccountClientId || !user.clientRoles) continue;

  const owner = await findClient(user.serviceAccountClientId);
  if (!owner) throw new Error(`No client ${user.serviceAccountClientId} for ${user.username}`);
  const serviceAccount = await api<{ id: string }>("GET", `/clients/${owner.id}/service-account-user`);

  for (const [roleClientId, roleNames] of Object.entries(user.clientRoles)) {
    const roleClient = await findClient(roleClientId);
    if (!roleClient) throw new Error(`No client ${roleClientId}`);
    const roles = await Promise.all(
      roleNames.map((name) =>
        api("GET", `/clients/${roleClient.id}/roles/${encodeURIComponent(name)}`)
      )
    );
    await api("POST", `/users/${serviceAccount.id}/role-mappings/clients/${roleClient.id}`, roles);
    console.log(`  = ${user.username}: ${roleClientId} → ${roleNames.join(", ")}`);
  }
}

console.log("\nDone.");
