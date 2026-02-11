import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getDbAdapter } from "@/lib/db-adapter";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await context.params;

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
        { message: "Access denied" },
        { status: 403 }
      );
    }

    const adapter = getDbAdapter(connection.dbType);
    const defaultDb = connection.dbType === "clickhouse" ? "default" : "postgres";

    // Fetch databases
    const databases = await adapter.getDatabases({
      host: connection.host,
      port: connection.port,
      database: defaultDb,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });

    // For ClickHouse, skip branch detection (no branching support)
    if (connection.dbType === "clickhouse") {
      const result = databases.map((db) => ({
        name: db.name,
        size: db.size,
        isMain: true,
        branches: [] as string[],
      }));
      return NextResponse.json({ databases: result });
    }

    // Fetch branches for this connection (PostgreSQL only)
    const branches = await prisma.branch.findMany({
      where: {
        connectionId: connectionId,
        status: "ACTIVE",
      },
      select: {
        name: true,
        sourceDb: true,
      },
    });

    // Build branch map
    const branchMap: Record<string, string> = {};
    for (const branch of branches) {
      branchMap[branch.name] = branch.sourceDb;
    }

    // Identify main databases and their branches
    const dbNames = databases.map(d => d.name);
    const result: {
      name: string;
      size: string;
      isMain: boolean;
      branches: string[];
    }[] = [];

    for (const db of databases) {
      // Check if this is a branch (has underscore and parent exists)
      const underscoreIdx = db.name.lastIndexOf("_");
      const potentialParent = underscoreIdx > 0 ? db.name.substring(0, underscoreIdx) : null;
      const isBranch = potentialParent && dbNames.includes(potentialParent);

      if (!isBranch) {
        // This is a main database - find its branches
        const dbBranches = dbNames.filter(name => {
          if (name === db.name) return false;
          const idx = name.lastIndexOf("_");
          return idx > 0 && name.substring(0, idx) === db.name;
        });

        result.push({
          name: db.name,
          size: db.size,
          isMain: true,
          branches: dbBranches,
        });
      }
    }

    return NextResponse.json({ databases: result });
  } catch (error) {
    console.error("Error fetching databases:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch databases" },
      { status: 500 }
    );
  }
}
