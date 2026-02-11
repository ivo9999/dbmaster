import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

// Helper to get primary key columns for a table
async function getPrimaryKeyColumns(
  connectionId: string,
  config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
  },
  tableName: string,
  schema: string = "public"
): Promise<string[]> {
  const pool = getPool(connectionId, config);
  const result = await pool.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = $2
      AND tc.table_name = $1
    ORDER BY kcu.ordinal_position
  `,
    [tableName, schema]
  );
  return result.rows.map((row) => row.column_name);
}

// PUT: Update a row
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, tableName } = await context.params;
    const { schema = "public", database, primaryKey, updates } = await request.json();

    if (!primaryKey || !updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: "Primary key and updates are required" },
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

    // Check permissions
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canEdit =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canEdit) {
      return NextResponse.json(
        { message: "You don't have permission to edit data" },
        { status: 403 }
      );
    }

    const pool = getPool(connectionId, {
      host: connection.host,
      port: connection.port,
      database: database || connection.database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });

    // Build UPDATE query
    const safeSchema = schema.replace(/"/g, '""');
    const safeTable = tableName.replace(/"/g, '""');
    const fullTableName = `"${safeSchema}"."${safeTable}"`;

    const setClauses: string[] = [];
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Build SET clause
    for (const [column, value] of Object.entries(updates)) {
      const safeColumn = column.replace(/"/g, '""');
      setClauses.push(`"${safeColumn}" = $${paramIndex++}`);
      params.push(value);
    }

    // Build WHERE clause from primary key
    for (const [column, value] of Object.entries(primaryKey)) {
      const safeColumn = column.replace(/"/g, '""');
      whereConditions.push(`"${safeColumn}" = $${paramIndex++}`);
      params.push(value);
    }

    const query = `
      UPDATE ${fullTableName}
      SET ${setClauses.join(", ")}
      WHERE ${whereConditions.join(" AND ")}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { message: "Row not found" },
        { status: 404 }
      );
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "ROW_UPDATED",
        resource: `${schema}.${tableName}`,
        resourceId: connectionId,
        metadata: { primaryKey, updates },
      },
    });

    return NextResponse.json({
      success: true,
      row: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating row:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update row" },
      { status: 500 }
    );
  }
}

// POST: Insert a new row
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, tableName } = await context.params;
    const { schema = "public", database, data } = await request.json();

    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: "Row data is required" },
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

    // Check permissions
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canEdit =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canEdit) {
      return NextResponse.json(
        { message: "You don't have permission to insert data" },
        { status: 403 }
      );
    }

    const pool = getPool(connectionId, {
      host: connection.host,
      port: connection.port,
      database: database || connection.database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });

    // Build INSERT query
    const safeSchema = schema.replace(/"/g, '""');
    const safeTable = tableName.replace(/"/g, '""');
    const fullTableName = `"${safeSchema}"."${safeTable}"`;

    const columns: string[] = [];
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [column, value] of Object.entries(data)) {
      if (value !== undefined) {
        const safeColumn = column.replace(/"/g, '""');
        columns.push(`"${safeColumn}"`);
        placeholders.push(`$${paramIndex++}`);
        params.push(value);
      }
    }

    const query = `
      INSERT INTO ${fullTableName} (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING *
    `;

    const result = await pool.query(query, params);

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "ROW_INSERTED",
        resource: `${schema}.${tableName}`,
        resourceId: connectionId,
        metadata: { data },
      },
    });

    return NextResponse.json({
      success: true,
      row: result.rows[0],
    });
  } catch (error) {
    console.error("Error inserting row:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to insert row" },
      { status: 500 }
    );
  }
}

// DELETE: Delete row(s)
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string; tableName: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId, tableName } = await context.params;
    const { schema = "public", database, primaryKeys } = await request.json();

    if (!primaryKeys || !Array.isArray(primaryKeys) || primaryKeys.length === 0) {
      return NextResponse.json(
        { message: "Primary keys are required" },
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

    // Check permissions
    const isAdmin = session.user.role === "ADMIN";
    const userConnection = connection.users[0];
    const canEdit =
      isAdmin ||
      userConnection?.role === "ADMIN" ||
      userConnection?.role === "DEVELOPER";

    if (!canEdit) {
      return NextResponse.json(
        { message: "You don't have permission to delete data" },
        { status: 403 }
      );
    }

    const pool = getPool(connectionId, {
      host: connection.host,
      port: connection.port,
      database: database || connection.database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    });

    // Build DELETE query
    const safeSchema = schema.replace(/"/g, '""');
    const safeTable = tableName.replace(/"/g, '""');
    const fullTableName = `"${safeSchema}"."${safeTable}"`;

    let deletedCount = 0;

    // Delete each row
    for (const primaryKey of primaryKeys) {
      const whereConditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      for (const [column, value] of Object.entries(primaryKey)) {
        const safeColumn = column.replace(/"/g, '""');
        whereConditions.push(`"${safeColumn}" = $${paramIndex++}`);
        params.push(value);
      }

      const query = `DELETE FROM ${fullTableName} WHERE ${whereConditions.join(" AND ")}`;
      const result = await pool.query(query, params);
      deletedCount += result.rowCount || 0;
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "ROWS_DELETED",
        resource: `${schema}.${tableName}`,
        resourceId: connectionId,
        metadata: { count: deletedCount, primaryKeys },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    console.error("Error deleting rows:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete rows" },
      { status: 500 }
    );
  }
}
