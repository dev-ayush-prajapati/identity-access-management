import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Sole purpose of this app: prove SSO. If there's no local session yet,
// send to Auth.js's sign-in page (one click on "Sign in with Keycloak" —
// required, since initiating sign-in needs a CSRF-protected POST, which
// can't happen from a plain Server Component). If the browser already has
// a Keycloak session (from Portal), that click won't ask for a password —
// that's the actual SSO proof, not the click itself.
export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Finance App
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Logged in as {session.user.name} via SSO
        </p>
      </main>
    </div>
  );
}
