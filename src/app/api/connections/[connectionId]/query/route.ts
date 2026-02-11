import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDbAdapter } from "@/lib/db-adapter";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const startTime = Date.now();

  try {
    const session = await auth();
    const { connectionId } = await params;

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ message: "Connection not found" }, { status: 404 });
    }

    // Check access
    const hasAccess = session.user.role === "ADMIN" || connection.users.length > 0;
    if (!hasAccess) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    // Get user's role for this connection
    const userRole =
      session.user.role === "ADMIN"
        ? "ADMIN"
        : connection.users[0]?.role || "VIEWER";

    const canExecuteWrite = userRole === "ADMIN" || userRole === "DEVELOPER";

    const { sql, database } = await request.json();

    if (!sql || typeof sql !== "string") {
      return NextResponse.json({ message: "SQL query is required" }, { status: 400 });
    }

    // Validate query for viewers (SELECT only)
    if (!canExecuteWrite) {
      const trimmedSql = sql.trim().toLowerCase();
      const isSelect = trimmedSql.startsWith("select") || trimmedSql.startsWith("with");
      if (!isSelect) {
        return NextResponse.json(
          { message: "You can only execute SELECT queries" },
          { status: 403 }
        );
      }
    }

    // Block dangerous operations for non-admins
    if (userRole !== "ADMIN") {
      const dangerousPatterns = [
        /\bdrop\s+(table|database|schema|index)/i,
        /\btruncate\s+/i,
        /\balter\s+/i,
        /\bgrant\s+/i,
        /\brevoke\s+/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(sql)) {
          return NextResponse.json(
            { message: "This operation requires admin privileges" },
            { status: 403 }
          );
        }
      }
    }

    const adapter = getDbAdapter(connection.dbType);

    // Execute query (use specified database or fall back to connection's default)
    const result = await adapter.executeQuery(
      connectionId,
      {
        host: connection.host,
        port: connection.port,
        database: database || connection.database,
        username: connection.username,
        password: connection.password,
        ssl: connection.ssl,
      },
      sql
    );

    const executionTime = Date.now() - startTime;

    // Save to query history
    await prisma.query.create({
      data: {
        userId: session.user.id,
        connectionId: connectionId,
        sql: sql.substring(0, 10000), // Limit SQL length
        executionTime,
        rowCount: result.rowCount,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "QUERY_EXECUTED",
        resource: "query",
        resourceId: connectionId,
        metadata: {
          sql: sql.substring(0, 500),
          rowCount: result.rowCount,
          executionTime,
        },
      },
    });

    return NextResponse.json({
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rowCount,
      executionTime,
    });
  } catch (error) {
    console.error("Error executing query:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Query execution failed",
      },
      { status: 500 }
    );
  }
}
