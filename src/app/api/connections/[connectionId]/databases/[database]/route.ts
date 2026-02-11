import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getDbAdapter } from "@/lib/db-adapter";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; database: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, database } = await context.params;

    // Validate database name
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(database)) {
      return NextResponse.json(
        { message: "Invalid database name" },
        { status: 400 }
      );
    }

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

    // Check permissions - only admins and developers can delete databases
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canDelete =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canDelete) {
      return NextResponse.json(
        { message: "You don't have permission to delete databases" },
        { status: 403 }
      );
    }

    // Don't allow deleting the main connection database
    if (database === connection.database) {
      return NextResponse.json(
        { message: "Cannot delete the main connection database" },
        { status: 400 }
      );
    }

    const adapter = getDbAdapter(connection.dbType);
    const defaultDb = connection.dbType === "clickhouse" ? "default" : "postgres";

    await adapter.dropDatabase(
      {
        host: connection.host,
        port: connection.port,
        database: defaultDb,
        username: connection.username,
        password: connection.password,
        ssl: connection.ssl,
      },
      database
    );

    // If there's a branch record, update it to DELETED
    await prisma.branch.updateMany({
      where: {
        connectionId: connectionId,
        name: database,
      },
      data: { status: "DELETED" },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DATABASE_DELETED",
        resource: "database",
        resourceId: connectionId,
        metadata: {
          databaseName: database,
          connectionId: connectionId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Database "${database}" has been deleted`,
    });
  } catch (error) {
    console.error("Error deleting database:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to delete database",
      },
      { status: 500 }
    );
  }
}
