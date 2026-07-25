import type { DefaultSession } from "next-auth";
import type { UserType } from "@/lib/generated/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      userType: UserType;
      roleId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    userType?: UserType;
    roleId?: string | null;
  }
}
