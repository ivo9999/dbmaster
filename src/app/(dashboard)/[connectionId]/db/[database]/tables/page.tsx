import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getTables } from "@/lib/db";

interface Props {
  params: Promise<{ connectionId: string; database: string }>;
}

export default async function TablesPage({ params }: Props) {
  const session = await auth();
  const { connectionId, database } = await params;

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

  // Fetch tables from the specified database
  let tables: { name: string; schema: string; rowCount: number; size: string }[] = [];

  try {
    tables = await getTables(connectionId, {
      host: connection.host,
      port: connection.port,
      database: database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });
  } catch {
    // If we can't fetch tables, redirect to connection page
    redirect(`/${connectionId}`);
  }

  // Redirect to first table if available
  if (tables.length > 0) {
    const firstTable = tables[0];
    const tableName = encodeURIComponent(`${firstTable.schema}.${firstTable.name}`);
    redirect(`/${connectionId}/db/${database}/tables/${tableName}`);
  }

  // No tables - redirect to connection page
  redirect(`/${connectionId}`);
}
