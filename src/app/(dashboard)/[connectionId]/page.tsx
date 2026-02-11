import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getDbAdapter } from "@/lib/db-adapter";
import { DatabaseBrowser } from "./database-browser";

interface Props {
  params: Promise<{ connectionId: string }>;
}

export default async function ConnectionPage({ params }: Props) {
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

  // Fetch databases from the server
  let databases: { name: string; size: string; owner: string }[] = [];
  let error: string | null = null;
  const adapter = getDbAdapter(connection.dbType);
  const defaultDb = connection.dbType === "clickhouse" ? "default" : "postgres";

  try {
    databases = await adapter.getDatabases({
      host: connection.host,
      port: connection.port,
      database: defaultDb,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch databases";
  }

  // Fetch branches for this connection
  const branches = await prisma.branch.findMany({
    where: {
      connectionId: connectionId,
      status: "ACTIVE",
    },
    include: {
      creator: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Convert branches to a map for easy lookup
  const branchMap: Record<string, {
    id: string;
    sourceDb: string;
    description: string | null;
    createdAt: Date;
    createdBy: { name: string | null; email: string };
  }> = {};

  for (const branch of branches) {
    branchMap[branch.name] = {
      id: branch.id,
      sourceDb: branch.sourceDb,
      description: branch.description,
      createdAt: branch.createdAt,
      createdBy: {
        name: branch.creator.name,
        email: branch.creator.email,
      },
    };
  }

  // Prepare connection data for editing (without password)
  const connectionData = {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    ssl: connection.ssl,
    dbType: connection.dbType,
    environment: connection.environment,
    color: connection.color,
    description: connection.description,
    pgbouncerUrl: connection.pgbouncerUrl,
    publicHost: connection.publicHost,
    publicPort: connection.publicPort,
  };

  return (
    <div className="h-full">
      <DatabaseBrowser
        connectionId={connectionId}
        connectionName={connection.name}
        connectionData={connectionData}
        currentDatabase={connection.database}
        databases={databases}
        branches={branchMap}
        error={error}
        userRole={userRole}
        isAdmin={session.user.role === "ADMIN"}
      />
    </div>
  );
}
