import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/encryption";

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
      return NextResponse.json(
        { message: "Connection not found" },
        { status: 404 }
      );
    }

    // Check access
    const hasAccess = session.user.role === "ADMIN" || connection.users.length > 0;
    if (!hasAccess) {
      return NextResponse.json(
        { message: "You don't have access to this connection" },
        { status: 403 }
      );
    }

    const decryptedPassword = decrypt(connection.password);

    if (connection.dbType === "clickhouse") {
      const protocol = connection.ssl ? "clickhouse" : "clickhouse";
      const connectionString = `${protocol}://${connection.username}:${encodeURIComponent(decryptedPassword)}@${connection.host}:${connection.port}/${database}`;

      return NextResponse.json({
        connectionString,
        pgbouncerConnectionString: null,
        devConnectionString: null,
        database,
      });
    }

    // PostgreSQL
    const connectionString = `postgresql://${connection.username}:${encodeURIComponent(decryptedPassword)}@${connection.host}:${connection.port}/${database}`;

    // Build PgBouncer connection string if configured
    let pgbouncerConnectionString: string | null = null;
    if (connection.pgbouncerUrl) {
      try {
        const url = new URL(connection.pgbouncerUrl);
        url.pathname = `/${database}`;
        pgbouncerConnectionString = url.toString();
      } catch {
        // Fallback for non-standard URLs
        const baseUrl = connection.pgbouncerUrl.replace(/\/$/, '');
        pgbouncerConnectionString = `${baseUrl}/${database}`;
      }
    }

    // Build dev connection string using public host if configured
    let devConnectionString: string | null = null;
    if (connection.publicHost) {
      const publicPort = connection.publicPort || 5432;
      devConnectionString = `postgresql://${connection.username}:${encodeURIComponent(decryptedPassword)}@${connection.publicHost}:${publicPort}/${database}?sslmode=disable&connect_timeout=10`;
    }

    return NextResponse.json({
      connectionString,
      pgbouncerConnectionString,
      devConnectionString,
      database,
    });
  } catch (error) {
    console.error("Error getting connection string:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to get connection string",
      },
      { status: 500 }
    );
  }
}
