import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getDbAdapter } from "@/lib/db-adapter";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; database: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, database } = await context.params;

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
      return NextResponse.json({ message: "Connection not found" }, { status: 404 });
    }

    // Check access
    const hasAccess = session.user.role === "ADMIN" || connection.users.length > 0;
    if (!hasAccess) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }

    const adapter = getDbAdapter(connection.dbType);
    const tables = await adapter.getTables(connectionId, {
      host: connection.host,
      port: connection.port,
      database: database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });

    return NextResponse.json({
      tables: tables.map((t) => ({
        schema: t.schema,
        name: t.name,
        row_count: t.rowCount,
        size: t.size,
      })),
    });
  } catch (error) {
    console.error("Error fetching tables:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch tables" },
      { status: 500 }
    );
  }
}
