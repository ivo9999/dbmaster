import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { QueryRunner } from "./query-runner";

interface Props {
  params: Promise<{ connectionId: string }>;
}

export default async function QueryPage({ params }: Props) {
  const session = await auth();
  const { connectionId } = await params;

  if (!session) {
    redirect("/auth/signin");
  }

  // Get connection with access check
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: {
      users: {
        where: { userId: session.user.id },
      },
    },
  });

  if (!connection) {
    notFound();
  }

  // Check access
  const hasAccess = session.user.role === "ADMIN" || connection.users.length > 0;
  if (!hasAccess) {
    redirect("/");
  }

  // Get user's role for this connection
  const userRole =
    session.user.role === "ADMIN"
      ? "ADMIN"
      : connection.users[0]?.role || "VIEWER";

  // Viewer can only run SELECT queries
  const canExecuteWrite = userRole === "ADMIN" || userRole === "DEVELOPER";

  // Get recent queries for this user and connection
  const recentQueries = await prisma.query.findMany({
    where: {
      userId: session.user.id,
      connectionId: connectionId,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="h-full">
      <QueryRunner
        connectionId={connectionId}
        connectionName={connection.name}
        canExecuteWrite={canExecuteWrite}
        userRole={userRole}
        recentQueries={recentQueries}
      />
    </div>
  );
}
