import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getDbAdapter } from "@/lib/db-adapter";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, tableName } = await context.params;
    const schema = request.nextUrl.searchParams.get("schema") || "public";
    const database = request.nextUrl.searchParams.get("database");

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

    // Check access
    const hasAccess = session.user.role === "ADMIN" || connection.users.length > 0;
    if (!hasAccess) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    const config = {
      host: connection.host,
      port: connection.port,
      database: database || connection.database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    };

    const adapter = getDbAdapter(connection.dbType);

    // Get table schema for columns
    const tableSchema = await adapter.getTableSchema(connectionId, config, tableName, schema);

    // Get 2 sample rows
    const tableData = await adapter.getTableData(connectionId, config, tableName, schema, {
      page: 1,
      pageSize: 2,
    });

    return NextResponse.json({
      columns: tableSchema.columns.map(col => ({
        name: col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        isForeignKey: col.isForeignKey,
      })),
      rows: tableData.rows,
    });
  } catch (error) {
    console.error("Error fetching preview:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch preview" },
      { status: 500 }
    );
  }
}
