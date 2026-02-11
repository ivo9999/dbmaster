import { createClient, ClickHouseClient } from "@clickhouse/client";
import { decrypt } from "./encryption";

// Client cache
const clients: Map<string, ClickHouseClient> = new Map();

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // Encrypted
  ssl: boolean;
}

function buildUrl(config: ConnectionConfig): string {
  const protocol = config.ssl ? "https" : "http";
  return `${protocol}://${config.host}:${config.port}`;
}

export function getClickHouseClient(
  connectionId: string,
  config: ConnectionConfig
): ClickHouseClient {
  const key = `${connectionId}:${config.database}`;
  const existing = clients.get(key);
  if (existing) return existing;

  const client = createClient({
    url: buildUrl(config),
    username: config.username,
    password: decrypt(config.password),
    database: config.database,
    request_timeout: 30000,
  });

  clients.set(key, client);
  return client;
}

export async function closeClickHouseClient(
  connectionId: string
): Promise<void> {
  for (const [key, client] of clients) {
    if (key.startsWith(`${connectionId}:`)) {
      await client.close();
      clients.delete(key);
    }
  }
}

export async function closeAllClickHouseClients(): Promise<void> {
  for (const client of clients.values()) {
    await client.close();
  }
  clients.clear();
}

export async function testClickHouseConnection(
  config: ConnectionConfig
): Promise<{ success: boolean; error?: string; version?: string }> {
  const client = createClient({
    url: buildUrl(config),
    username: config.username,
    password: decrypt(config.password),
    database: config.database,
    request_timeout: 5000,
  });

  try {
    const result = await client.query({
      query: "SELECT version() AS version",
      format: "JSONEachRow",
    });
    const rows = await result.json<{ version: string }>();
    await client.close();
    return {
      success: true,
      version: `ClickHouse ${rows[0]?.version}`,
    };
  } catch (error) {
    await client.close().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export async function testClickHouseConnectionRaw(config: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}): Promise<{ success: boolean; error?: string; version?: string }> {
  const protocol = config.ssl ? "https" : "http";
  const client = createClient({
    url: `${protocol}://${config.host}:${config.port}`,
    username: config.username,
    password: config.password,
    database: config.database,
    request_timeout: 5000,
  });

  try {
    const result = await client.query({
      query: "SELECT version() AS version",
      format: "JSONEachRow",
    });
    const rows = await result.json<{ version: string }>();
    await client.close();
    return {
      success: true,
      version: `ClickHouse ${rows[0]?.version}`,
    };
  } catch (error) {
    await client.close().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export async function executeClickHouseQuery(
  connectionId: string,
  config: ConnectionConfig,
  sql: string
): Promise<{
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
}> {
  const client = getClickHouseClient(connectionId, config);
  const trimmed = sql.trim().toUpperCase();
  const isSelect =
    trimmed.startsWith("SELECT") ||
    trimmed.startsWith("SHOW") ||
    trimmed.startsWith("DESCRIBE") ||
    trimmed.startsWith("EXPLAIN") ||
    trimmed.startsWith("WITH");

  if (isSelect) {
    const result = await client.query({
      query: sql,
      format: "JSON",
    });
    const json = await result.json<{
      data: Record<string, unknown>[];
      meta: { name: string; type: string }[];
      rows: number;
    }>();
    return {
      rows: json.data,
      columns: (json.meta ?? []).map((m) => m.name),
      rowCount: json.rows ?? 0,
    };
  } else {
    await client.command({ query: sql });
    return { rows: [], columns: [], rowCount: 0 };
  }
}

export async function getClickHouseDatabases(
  config: Omit<ConnectionConfig, "database"> & { database?: string }
): Promise<{ name: string; size: string; owner: string }[]> {
  const client = createClient({
    url: buildUrl({ ...config, database: config.database || "default" } as ConnectionConfig),
    username: config.username,
    password: decrypt(config.password),
    database: config.database || "default",
    request_timeout: 10000,

  });

  try {
    const result = await client.query({
      query: `
        SELECT
          name,
          engine
        FROM system.databases
        WHERE name NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
        ORDER BY name
      `,
      format: "JSONEachRow",
    });
    const rows = await result.json<{ name: string; engine: string }>();
    await client.close();

    return rows.map((row) => ({
      name: row.name,
      size: "-",
      owner: row.engine,
    }));
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function getClickHouseTables(
  connectionId: string,
  config: ConnectionConfig
): Promise<{ name: string; schema: string; rowCount: number; size: string }[]> {
  const client = getClickHouseClient(connectionId, config);

  const result = await client.query({
    query: `
      SELECT
        name,
        database,
        total_rows,
        formatReadableSize(total_bytes) AS size
      FROM system.tables
      WHERE database = currentDatabase()
        AND is_temporary = 0
        AND engine NOT IN ('View', 'MaterializedView')
      ORDER BY name
    `,
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    name: string;
    database: string;
    total_rows: string;
    size: string;
  }>();

  return rows.map((row) => ({
    name: row.name,
    schema: row.database,
    rowCount: parseInt(row.total_rows) || 0,
    size: row.size,
  }));
}

export async function getClickHouseTableSchema(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  _schema: string = "default"
): Promise<{
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    foreignKeyRef?: { table: string; column: string };
    enumValues?: string[];
  }[];
  indexes: { name: string; columns: string[]; isUnique: boolean; type: string }[];
  foreignKeys: {
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
  }[];
}> {
  const client = getClickHouseClient(connectionId, config);

  // Get columns
  const colResult = await client.query({
    query: `
      SELECT
        name,
        type,
        default_kind,
        default_expression,
        is_in_primary_key
      FROM system.columns
      WHERE database = currentDatabase()
        AND table = {tableName: String}
      ORDER BY position
    `,
    format: "JSONEachRow",
    query_params: { tableName },
  });

  const columns = await colResult.json<{
    name: string;
    type: string;
    default_kind: string;
    default_expression: string;
    is_in_primary_key: number;
  }>();

  return {
    columns: columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: col.type.startsWith("Nullable"),
      defaultValue: col.default_expression || null,
      isPrimaryKey: col.is_in_primary_key === 1,
      isForeignKey: false,
    })),
    indexes: [],
    foreignKeys: [],
  };
}

export async function getClickHouseTableDDL(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  _schema: string = "default"
): Promise<string> {
  const client = getClickHouseClient(connectionId, config);

  const result = await client.query({
    query: `SHOW CREATE TABLE ${quoteIdentifier(tableName)}`,
    format: "JSONEachRow",
  });

  const rows = await result.json<{ statement: string }>();
  return rows[0]?.statement || "";
}

export async function getClickHouseTableData(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  _schema: string = "default",
  options: {
    page?: number;
    pageSize?: number;
    sortColumn?: string;
    sortDirection?: "asc" | "desc";
    filters?: { column: string; operator: string; value: string }[];
  } = {}
): Promise<{
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const client = getClickHouseClient(connectionId, config);
  const { page = 1, pageSize = 50, sortColumn, sortDirection = "asc", filters = [] } = options;
  const offset = (page - 1) * pageSize;

  const safeName = quoteIdentifier(tableName);

  // Build WHERE clause
  let whereClause = "";
  if (filters.length > 0) {
    const conditions = filters.map((filter) => {
      const col = quoteIdentifier(filter.column);
      const escaped = filter.value.replace(/'/g, "\\'");
      switch (filter.operator) {
        case "=":
          return `${col} = '${escaped}'`;
        case "!=":
          return `${col} != '${escaped}'`;
        case ">":
          return `${col} > '${escaped}'`;
        case "<":
          return `${col} < '${escaped}'`;
        case ">=":
          return `${col} >= '${escaped}'`;
        case "<=":
          return `${col} <= '${escaped}'`;
        case "LIKE":
          return `${col} ILIKE '%${escaped}%'`;
        case "IS NULL":
          return `${col} IS NULL`;
        case "IS NOT NULL":
          return `${col} IS NOT NULL`;
        default:
          return `${col} = '${escaped}'`;
      }
    });
    whereClause = `WHERE ${conditions.join(" AND ")}`;
  }

  // Get total count
  const countResult = await client.query({
    query: `SELECT count() AS count FROM ${safeName} ${whereClause}`,
    format: "JSONEachRow",
  });
  const countRows = await countResult.json<{ count: string }>();
  const totalRows = parseInt(countRows[0]?.count || "0");

  // Build ORDER BY
  let orderByClause = "";
  if (sortColumn) {
    const dir = sortDirection === "desc" ? "DESC" : "ASC";
    orderByClause = `ORDER BY ${quoteIdentifier(sortColumn)} ${dir}`;
  }

  // Get data
  const dataResult = await client.query({
    query: `SELECT * FROM ${safeName} ${whereClause} ${orderByClause} LIMIT ${pageSize} OFFSET ${offset}`,
    format: "JSONEachRow",
  });
  const rows = await dataResult.json<Record<string, unknown>>();

  return {
    rows,
    totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
  };
}

export async function createClickHouseDatabase(
  config: Omit<ConnectionConfig, "database"> & { database?: string },
  newDbName: string
): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(newDbName)) {
    throw new Error("Invalid database name");
  }

  const client = createClient({
    url: buildUrl({ ...config, database: config.database || "default" } as ConnectionConfig),
    username: config.username,
    password: decrypt(config.password),
    database: config.database || "default",
    request_timeout: 10000,

  });

  try {
    await client.command({ query: `CREATE DATABASE ${quoteIdentifier(newDbName)}` });
    await client.close();
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function dropClickHouseDatabase(
  config: Omit<ConnectionConfig, "database"> & { database?: string },
  dbName: string
): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(dbName)) {
    throw new Error("Invalid database name");
  }

  const client = createClient({
    url: buildUrl({ ...config, database: config.database || "default" } as ConnectionConfig),
    username: config.username,
    password: decrypt(config.password),
    database: config.database || "default",
    request_timeout: 10000,

  });

  try {
    await client.command({ query: `DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}` });
    await client.close();
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}
