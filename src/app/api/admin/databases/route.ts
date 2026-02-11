import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { z } from "zod";
import { getClickHouseDatabases, createClickHouseDatabase } from "@/lib/clickhouse";
import { encrypt } from "@/lib/encryption";

const createDatabaseSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/),
  connectionString: z.string().min(1),
});

// Parse PostgreSQL or ClickHouse connection string
function parseConnectionString(connStr: string): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  dbType: "postgres" | "clickhouse";
} | null {
  try {
    const isClickHouse = connStr.startsWith("clickhouse://");
    const normalized = connStr
      .replace(/^postgresql:/, "postgres:")
      .replace(/^clickhouse:/, "postgres:"); // Temporarily use postgres: for URL parsing

    const url = new URL(normalized);
    const host = url.hostname;
    const defaultPort = isClickHouse ? 8123 : 5432;
    const port = parseInt(url.port) || defaultPort;
    const database = url.pathname.slice(1);
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const ssl = url.searchParams.get("sslmode") !== "disable";

    return {
      host,
      port,
      database,
      username,
      password,
      ssl,
      dbType: isClickHouse ? "clickhouse" : "postgres",
    };
  } catch {
    return null;
  }
}

// GET: List all databases on a server
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const connectionString = request.nextUrl.searchParams.get("connectionString");
    if (!connectionString) {
      return NextResponse.json(
        { message: "Connection string is required" },
        { status: 400 }
      );
    }

    const parsed = parseConnectionString(connectionString);
    if (!parsed) {
      return NextResponse.json(
        { message: "Invalid connection string format" },
        { status: 400 }
      );
    }

    if (parsed.dbType === "clickhouse") {
      // Use ClickHouse adapter
      const databases = await getClickHouseDatabases({
        host: parsed.host,
        port: parsed.port,
        database: parsed.database || "default",
        username: parsed.username,
        password: encrypt(parsed.password),
        ssl: parsed.ssl,
      });

      return NextResponse.json({
        databases,
        server: {
          host: parsed.host,
          port: parsed.port,
          username: parsed.username,
        },
      });
    }

    // PostgreSQL
    const pool = new Pool({
      host: parsed.host,
      port: parsed.port,
      database: parsed.database || "postgres",
      user: parsed.username,
      password: parsed.password,
      ssl: parsed.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      const result = await pool.query(`
        SELECT
          d.datname as name,
          pg_size_pretty(pg_database_size(d.datname)) as size,
          r.rolname as owner
        FROM pg_database d
        JOIN pg_roles r ON d.datdba = r.oid
        WHERE d.datistemplate = false
        ORDER BY d.datname
      `);
      await pool.end();

      return NextResponse.json({
        databases: result.rows,
        server: {
          host: parsed.host,
          port: parsed.port,
          username: parsed.username,
        },
      });
    } catch (dbError) {
      await pool.end().catch(() => {});
      console.error("Error listing databases:", dbError);
      return NextResponse.json(
        {
          message:
            dbError instanceof Error
              ? dbError.message
              : "Failed to list databases",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error listing databases:", error);
    return NextResponse.json(
      { message: "Failed to list databases" },
      { status: 500 }
    );
  }
}

// POST: Create a new database
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createDatabaseSchema.parse(body);

    const parsed = parseConnectionString(data.connectionString);
    if (!parsed) {
      return NextResponse.json(
        { message: "Invalid connection string format" },
        { status: 400 }
      );
    }

    if (parsed.dbType === "clickhouse") {
      await createClickHouseDatabase(
        {
          host: parsed.host,
          port: parsed.port,
          database: parsed.database || "default",
          username: parsed.username,
          password: encrypt(parsed.password),
          ssl: parsed.ssl,
        },
        data.name
      );

      const newConnString = `clickhouse://${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@${parsed.host}:${parsed.port}/${data.name}`;

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "DATABASE_CREATED",
          resource: "database",
          resourceId: data.name,
          metadata: { host: parsed.host, database: data.name },
        },
      });

      return NextResponse.json({
        success: true,
        database: data.name,
        connectionString: newConnString,
      });
    }

    // PostgreSQL
    const pool = new Pool({
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.username,
      password: parsed.password,
      ssl: parsed.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 10000,
    });

    try {
      // Check if database already exists
      const checkResult = await pool.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [data.name]
      );

      if (checkResult.rows.length > 0) {
        await pool.end();
        return NextResponse.json(
          { message: `Database "${data.name}" already exists` },
          { status: 400 }
        );
      }

      // Create the database
      await pool.query(`CREATE DATABASE "${data.name}"`);

      await pool.end();

      // Build connection string for the new database
      const newConnString = `postgresql://${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@${parsed.host}:${parsed.port}/${data.name}${parsed.ssl ? "?sslmode=require" : ""}`;

      // Log the action
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "DATABASE_CREATED",
          resource: "database",
          resourceId: data.name,
          metadata: { host: parsed.host, database: data.name },
        },
      });

      return NextResponse.json({
        success: true,
        database: data.name,
        connectionString: newConnString,
      });
    } catch (dbError) {
      await pool.end().catch(() => {});
      console.error("Error creating database:", dbError);
      return NextResponse.json(
        {
          message:
            dbError instanceof Error
              ? dbError.message
              : "Failed to create database",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid data", errors: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating database:", error);
    return NextResponse.json(
      { message: "Failed to create database" },
      { status: 500 }
    );
  }
}
