import { prisma } from "@/lib/prisma";
import type { UserType } from "@/lib/generated/prisma";

// The one query behind every user-management list — GET /api/users and the
// /admin/employees and /superadmin/admins pages. They used to query
// separately and the archivedAt filter only made it into the API, so an
// archived ("deleted") user came back on the next page refresh.
//
// Archived rows are kept for audit history (see User.archivedAt) but are gone
// from every management view. Disabled users are still listed — they exist
// and can be re-enabled.
export function listManagedUsers(userType: UserType) {
  return prisma.user.findMany({
    where: { userType, archivedAt: null },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
}
