import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cloneDatabase } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await context.params;
    const { sourceDatabase, newDatabaseName, mode, tableOptions } = await request.json();

    if (!sourceDatabase || !newDatabaseName) {
      return NextResponse.json(
        { message: "Source database and new database name are required" },
        { status: 400 }
      );
    }

    if (!["full", "schema"].includes(mode)) {
      return NextResponse.json(
        { message: "Mode must be 'full' or 'schema'" },
        { status: 400 }
      );
    }

    // tableOptions: Array<{ schema: string, table: string, rowLimit: number | null, include: boolean }>

    // Get connection
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
      include: {
        users: {
          where: { userId: session.user.id },
        },
      },
    });

    if (!connection) {
      return NextResponse.json(
        { message: "Connection not found" },
        { status: 404 }
      );
    }

    // ClickHouse does not support branching/cloning
    if (connection.dbType === "clickhouse") {
      return NextResponse.json(
        { message: "Branching is not supported for ClickHouse connections" },
        { status: 400 }
      );
    }

    // Check permissions - only admins and developers can clone databases
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canClone =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canClone) {
      return NextResponse.json(
        { message: "You don't have permission to clone databases" },
        { status: 403 }
      );
    }

    const config = {
      host: connection.host,
      port: connection.port,
      database: "postgres",
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    };

    const result = await cloneDatabase(config, sourceDatabase, newDatabaseName, mode, tableOptions);

    // Create or update branch record to track the clone relationship
    const branch = await prisma.branch.upsert({
      where: {
        connectionId_name: {
          connectionId: connectionId,
          name: newDatabaseName,
        },
      },
      update: {
        sourceDb: sourceDatabase,
        description: mode === "full" ? "Full clone with data" : "Schema only clone",
        status: "ACTIVE",
      },
      create: {
        name: newDatabaseName,
        connectionId: connectionId,
        sourceDb: sourceDatabase,
        description: mode === "full" ? "Full clone with data" : "Schema only clone",
        createdBy: session.user.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DATABASE_CLONED",
        resource: "database",
        resourceId: connectionId,
        metadata: {
          sourceDatabase,
          newDatabaseName,
          mode,
          branchId: branch.id,
          tableOptions: tableOptions?.length || "all",
        },
      },
    });

    // Build PgBouncer connection string if configured
    let pgbouncerConnectionString: string | null = null;
    if (connection.pgbouncerUrl) {
      try {
        const url = new URL(connection.pgbouncerUrl);
        url.pathname = `/${newDatabaseName}`;
        pgbouncerConnectionString = url.toString();
      } catch {
        // Fallback for non-standard URLs
        const baseUrl = connection.pgbouncerUrl.replace(/\/$/, '');
        pgbouncerConnectionString = `${baseUrl}/${newDatabaseName}`;
      }
    }

    // Build dev connection string using public host if configured
    let devConnectionString: string | null = null;
    if (connection.publicHost) {
      const publicPort = connection.publicPort || 5432;
      const urlParts = new URL(result.connectionString);
      devConnectionString = `postgresql://${connection.username}:${urlParts.password}@${connection.publicHost}:${publicPort}/${newDatabaseName}?sslmode=disable&connect_timeout=10`;
    }

    return NextResponse.json({
      success: true,
      connectionString: result.connectionString,
      pgbouncerConnectionString,
      devConnectionString,
      branchId: branch.id,
      message: `Database "${newDatabaseName}" created successfully from "${sourceDatabase}"`,
    });
  } catch (error) {
    console.error("Error cloning database:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to clone database",
      },
      { status: 500 }
    );
  }
}
