import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  if (session.user.role === "PENDING") {
    redirect("/auth/pending");
  }

  if (session.user.role === "REJECTED") {
    redirect("/auth/rejected");
  }

  // Get connections the user has access to
  let connections;

  if (session.user.role === "ADMIN") {
    connections = await prisma.connection.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        environment: true,
        color: true,
      },
    });
  } else {
    connections = await prisma.connection.findMany({
      where: {
        users: {
          some: {
            userId: session.user.id,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        environment: true,
        color: true,
      },
    });
  }

  return (
    <DashboardShell
      connections={connections}
      isAdmin={session.user.role === "ADMIN"}
    >
      {children}
    </DashboardShell>
  );
}
