import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getDbAdapter } from "@/lib/db-adapter";

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
    const { name } = await request.json();

    // Validate database name
    if (!name || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name)) {
      return NextResponse.json(
        { message: "Invalid database name. Use only letters, numbers, underscores, and hyphens." },
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

    // Check permissions - only admins and developers can create databases
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canCreate =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canCreate) {
      return NextResponse.json(
        { message: "You don't have permission to create databases" },
        { status: 403 }
      );
    }

    const adapter = getDbAdapter(connection.dbType);
    const defaultDb = connection.dbType === "clickhouse" ? "default" : "postgres";

    await adapter.createDatabase(
      {
        host: connection.host,
        port: connection.port,
        database: defaultDb,
        username: connection.username,
        password: connection.password,
        ssl: connection.ssl,
      },
      name
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DATABASE_CREATED",
        resource: "database",
        resourceId: connectionId,
        metadata: {
          databaseName: name,
          connectionId: connectionId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Database "${name}" created successfully`,
    });
  } catch (error) {
    console.error("Error creating database:", error);
    const message = error instanceof Error ? error.message : "Failed to create database";
    // Check for duplicate database error
    if (message.includes("already exists")) {
      return NextResponse.json(
        { message: `Database already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message },
      { status: 500 }
    );
  }
}
