import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UsersTable } from "./users-table";
import { Users } from "lucide-react";

export default async function AdminUsersPage() {
  const session = await auth();

  if (!session || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const users = await prisma.user.findMany({
    orderBy: [
      { role: "asc" }, // PENDING first
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      githubId: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
      createdAt: true,
      approvedAt: true,
      approvedBy: true,
    },
  });

  const pendingCount = users.filter((u) => u.role === "PENDING").length;

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-xl bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">User Management</h1>
            <p className="text-sm text-muted-foreground">
              Manage user access and permissions
            </p>
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-sm font-medium text-amber-600">
              {pendingCount} user{pendingCount > 1 ? "s" : ""} waiting for approval
            </p>
          </div>
        )}

        <div className="rounded-xl border bg-card overflow-hidden">
          <UsersTable users={users} currentUserId={session.user.id} />
        </div>
      </div>
    </div>
  );
}
