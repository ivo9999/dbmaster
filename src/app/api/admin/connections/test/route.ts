import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { testClickHouseConnectionRaw } from "@/lib/clickhouse";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { host, port, database, username, password, ssl, dbType } = await request.json();

    if (dbType === "clickhouse") {
      const result = await testClickHouseConnectionRaw({
        host,
        port,
        database,
        username,
        password,
        ssl: ssl || false,
      });

      return NextResponse.json({
        success: result.success,
        version: result.version,
        error: result.error,
      });
    }

    // PostgreSQL
    const pool = new Pool({
      host,
      port,
      database,
      user: username,
      password,
      ssl: ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    try {
      const result = await pool.query("SELECT version()");
      await pool.end();

      // Extract just the version info
      const fullVersion = result.rows[0]?.version || "";
      const versionMatch = fullVersion.match(/PostgreSQL [\d.]+/);
      const version = versionMatch ? versionMatch[0] : "PostgreSQL";

      return NextResponse.json({
        success: true,
        version,
      });
    } catch (dbError) {
      await pool.end().catch(() => {});
      return NextResponse.json({
        success: false,
        error: dbError instanceof Error ? dbError.message : "Connection failed",
      });
    }
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      { success: false, error: "Connection test failed" },
      { status: 500 }
    );
  }
}
