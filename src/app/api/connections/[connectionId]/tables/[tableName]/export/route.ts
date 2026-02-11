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
    const format = request.nextUrl.searchParams.get("format") || "csv";
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10000");

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

    // Use adapter to get table data
    const tableData = await adapter.getTableData(
      connectionId,
      config,
      tableName,
      schema,
      { page: 1, pageSize: limit }
    );

    const rows = tableData.rows;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Log export action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "TABLE_EXPORTED",
        resource: `${schema}.${tableName}`,
        resourceId: connectionId,
        metadata: { format, rowCount: rows.length },
      },
    });

    if (format === "json") {
      return new NextResponse(JSON.stringify(rows, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${tableName}.json"`,
        },
      });
    }

    if (format === "sql") {
      const safeSchema = schema.replace(/"/g, '""');
      const safeTable = tableName.replace(/"/g, '""');
      let sql = `-- Exported from ${schema}.${tableName}\n`;
      sql += `-- ${rows.length} rows\n\n`;

      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col];
          if (val === null) return "NULL";
          if (typeof val === "number") return val.toString();
          if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
          if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        sql += `INSERT INTO "${safeSchema}"."${safeTable}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});\n`;
      }

      return new NextResponse(sql, {
        headers: {
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="${tableName}.sql"`,
        },
      });
    }

    // Default: CSV
    const escapeCSV = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csv = columns.join(",") + "\n";
    for (const row of rows) {
      csv += columns.map((col) => escapeCSV(row[col])).join(",") + "\n";
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${tableName}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting data:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to export" },
      { status: 500 }
    );
  }
}
