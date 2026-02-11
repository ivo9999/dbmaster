import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { decrypt } from "@/lib/encryption";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; branchId: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, branchId } = await context.params;

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

    // Check permissions - only admins and developers can delete branches
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canDelete =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canDelete) {
      return NextResponse.json(
        { message: "You don't have permission to delete branches" },
        { status: 403 }
      );
    }

    // Get the branch
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      return NextResponse.json(
        { message: "Branch not found" },
        { status: 404 }
      );
    }

    if (branch.connectionId !== connectionId) {
      return NextResponse.json(
        { message: "Branch does not belong to this connection" },
        { status: 400 }
      );
    }

    // Drop the database
    const pool = new Pool({
      host: connection.host,
      port: connection.port,
      database: "postgres", // Connect to postgres to drop the database
      user: connection.username,
      password: decrypt(connection.password),
      ssl: connection.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      // Terminate active connections to the database
      await pool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
      `, [branch.name]);

      // Drop the database
      await pool.query(`DROP DATABASE IF EXISTS "${branch.name}"`);
    } finally {
      await pool.end();
    }

    // Update branch status to DELETED
    await prisma.branch.update({
      where: { id: branchId },
      data: { status: "DELETED" },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "BRANCH_DELETED",
        resource: "branch",
        resourceId: branchId,
        metadata: {
          branchName: branch.name,
          sourceDb: branch.sourceDb,
          connectionId: connectionId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Database "${branch.name}" has been deleted`,
    });
  } catch (error) {
    console.error("Error deleting branch:", error);
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to delete branch",
      },
      { status: 500 }
    );
  }
}
