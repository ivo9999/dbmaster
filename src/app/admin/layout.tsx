import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  // Get all connections for admin
  const connections = await prisma.connection.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      environment: true,
      color: true,
    },
  });

  return (
    <div className="flex h-screen flex-col">
      <Header connections={connections} isAdmin={true} />
      <main className="flex-1 overflow-auto bg-background p-6">{children}</main>
    </div>
  );
}
