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
      database: database,
      username: connection.username,
      password: connection.password,
      ssl: connection.ssl,
    };

    const adapter = getDbAdapter(connection.dbType);

    // Get all tables
    const tables = await adapter.getTables(connectionId, config);

    let sql = `-- Database Export: ${database}\n`;
    sql += `-- Exported at: ${new Date().toISOString()}\n`;
    sql += `-- Tables: ${tables.length}\n`;
    sql += `-- Type: ${connection.dbType === "clickhouse" ? "ClickHouse" : "PostgreSQL"}\n\n`;

    // Export each table's schema and data
    for (const table of tables) {
      const safeSchema = table.schema.replace(/"/g, '""');
      const safeName = table.name.replace(/"/g, '""');

      sql += `-- ============================================\n`;
      sql += `-- Table: ${table.schema}.${table.name}\n`;
      sql += `-- ============================================\n\n`;

      // Get CREATE TABLE statement
      try {
        const ddl = await adapter.getTableDDL(connectionId, config, table.name, table.schema);
        if (ddl) {
          sql += ddl + '\n\n';
        }
      } catch {
        sql += `-- Could not generate DDL for ${table.schema}.${table.name}\n\n`;
      }

      // Export data
      try {
        const tableData = await adapter.getTableData(
          connectionId,
          config,
          table.name,
          table.schema,
          { page: 1, pageSize: 50000 }
        );

        if (tableData.rows.length > 0) {
          const columns = Object.keys(tableData.rows[0]);
          sql += `-- Data for ${table.schema}.${table.name} (${tableData.rows.length} rows)\n`;

          for (const row of tableData.rows) {
            const values = columns.map((col) => {
              const val = row[col];
              if (val === null) return "NULL";
              if (typeof val === "number") return val.toString();
              if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            });

            if (connection.dbType === "clickhouse") {
              sql += `INSERT INTO \`${safeName}\` (${columns.map(c => `\`${c}\``).join(", ")}) VALUES (${values.join(", ")});\n`;
            } else {
              sql += `INSERT INTO "${safeSchema}"."${safeName}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});\n`;
            }
          }
          sql += '\n';
        } else {
          sql += `-- No data in ${table.schema}.${table.name}\n\n`;
        }
      } catch (dataError) {
        sql += `-- Could not export data for ${table.schema}.${table.name}: ${dataError instanceof Error ? dataError.message : 'Unknown error'}\n\n`;
      }
    }

    // Log export action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DATABASE_EXPORTED",
        resource: database,
        resourceId: connectionId,
        metadata: { tableCount: tables.length },
      },
    });

    return new NextResponse(sql, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${database}_backup_${new Date().toISOString().split('T')[0]}.sql"`,
      },
    });
  } catch (error) {
    console.error("Error exporting database:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to export database" },
      { status: 500 }
    );
  }
}
