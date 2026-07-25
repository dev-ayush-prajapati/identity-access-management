import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const ZONE_BY_USER_TYPE: Record<string, string> = {
  SUPERADMIN: "/superadmin",
  ADMIN: "/admin",
  EMPLOYEE: "/dashboard",
};

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect(ZONE_BY_USER_TYPE[session.user.userType] ?? "/profile");
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          IAM Portal
        </h1>
        <Link
          href="/api/auth/signin"
          className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Sign in
        </Link>
      </main>
    </div>
  );
}
