import {
  getPool,
  closePool,
  testConnection,
  executeQuery as pgExecuteQuery,
  getDatabases as pgGetDatabases,
  createDatabase as pgCreateDatabase,
  getTables as pgGetTables,
  getTableSchema as pgGetTableSchema,
  getTableDDL as pgGetTableDDL,
  getTableTriggers as pgGetTableTriggers,
  getTableIndexes as pgGetTableIndexes,
  getTableData as pgGetTableData,
  type TableDataOptions,
} from "./db";
import {
  getClickHouseClient,
  closeClickHouseClient,
  testClickHouseConnection,
  executeClickHouseQuery,
  getClickHouseDatabases,
  getClickHouseTables,
  getClickHouseTableSchema,
  getClickHouseTableDDL,
  getClickHouseTableData,
  createClickHouseDatabase,
  dropClickHouseDatabase,
} from "./clickhouse";
import { QueryResult } from "pg";

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // Encrypted
  ssl: boolean;
}

export interface DbAdapter {
  testConnection(
    config: ConnectionConfig
  ): Promise<{ success: boolean; error?: string; version?: string }>;

  executeQuery(
    connectionId: string,
    config: ConnectionConfig,
    sql: string,
    params?: unknown[]
  ): Promise<{
    rows: Record<string, unknown>[];
    columns: string[];
    rowCount: number;
  }>;

  getDatabases(
    config: Omit<ConnectionConfig, "database"> & { database?: string }
  ): Promise<{ name: string; size: string; owner: string }[]>;

  createDatabase(
    config: Omit<ConnectionConfig, "database"> & { database?: string },
    newDbName: string
  ): Promise<void>;

  dropDatabase(
    config: Omit<ConnectionConfig, "database"> & { database?: string },
    dbName: string
  ): Promise<void>;

  getTables(
    connectionId: string,
    config: ConnectionConfig
  ): Promise<{ name: string; schema: string; rowCount: number; size: string }[]>;

  getTableSchema(
    connectionId: string,
    config: ConnectionConfig,
    tableName: string,
    schema?: string
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
  }>;

  getTableDDL(
    connectionId: string,
    config: ConnectionConfig,
    tableName: string,
    schema?: string
  ): Promise<string>;

  getTableTriggers(
    connectionId: string,
    config: ConnectionConfig,
    tableName: string,
    schema?: string
  ): Promise<{ name: string; event: string; timing: string; definition: string }[]>;

  getTableIndexes(
    connectionId: string,
    config: ConnectionConfig,
    tableName: string,
    schema?: string
  ): Promise<{ name: string; columns: string[]; unique: boolean; type: string; definition: string }[]>;

  getTableData(
    connectionId: string,
    config: ConnectionConfig,
    tableName: string,
    schema?: string,
    options?: TableDataOptions
  ): Promise<{
    rows: Record<string, unknown>[];
    totalRows: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;

  closeConnection(connectionId: string): Promise<void>;

  getPoolOrClient(connectionId: string, config: ConnectionConfig): unknown;
}

// PostgreSQL adapter
const postgresAdapter: DbAdapter = {
  testConnection: (config) => testConnection(config),

  executeQuery: async (connectionId, config, sql, params) => {
    const result: QueryResult = await pgExecuteQuery(connectionId, config, sql, params);
    return {
      rows: result.rows,
      columns: result.fields?.map((f) => f.name) || Object.keys(result.rows[0] || {}),
      rowCount: result.rowCount || result.rows.length,
    };
  },

  getDatabases: (config) => pgGetDatabases(config),

  createDatabase: (config, newDbName) => pgCreateDatabase(config, newDbName),

  dropDatabase: async (config, dbName) => {
    // Postgres uses Pool directly for DROP; handled at route level
    // This adapter method is used as a convenience
    const { Pool } = await import("pg");
    const { decrypt } = await import("./encryption");
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database || "postgres",
      user: config.username,
      password: decrypt(config.password),
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    try {
      await pool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName]
      );
      await pool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    } finally {
      await pool.end();
    }
  },

  getTables: (connectionId, config) => pgGetTables(connectionId, config),
  getTableSchema: (connectionId, config, tableName, schema) =>
    pgGetTableSchema(connectionId, config, tableName, schema),
  getTableDDL: (connectionId, config, tableName, schema) =>
    pgGetTableDDL(connectionId, config, tableName, schema),
  getTableTriggers: (connectionId, config, tableName, schema) =>
    pgGetTableTriggers(connectionId, config, tableName, schema),
  getTableIndexes: (connectionId, config, tableName, schema) =>
    pgGetTableIndexes(connectionId, config, tableName, schema),
  getTableData: (connectionId, config, tableName, schema, options) =>
    pgGetTableData(connectionId, config, tableName, schema, options),

  closeConnection: (connectionId) => closePool(connectionId),
  getPoolOrClient: (connectionId, config) => getPool(connectionId, config),
};

// ClickHouse adapter
const clickhouseAdapter: DbAdapter = {
  testConnection: (config) => testClickHouseConnection(config),

  executeQuery: async (connectionId, config, sql) => {
    return executeClickHouseQuery(connectionId, config, sql);
  },

  getDatabases: (config) => getClickHouseDatabases(config),

  createDatabase: (config, newDbName) => createClickHouseDatabase(config, newDbName),

  dropDatabase: (config, dbName) => dropClickHouseDatabase(config, dbName),

  getTables: (connectionId, config) => getClickHouseTables(connectionId, config),
  getTableSchema: (connectionId, config, tableName, schema) =>
    getClickHouseTableSchema(connectionId, config, tableName, schema),
  getTableDDL: (connectionId, config, tableName, schema) =>
    getClickHouseTableDDL(connectionId, config, tableName, schema),
  getTableTriggers: async () => [],
  getTableIndexes: async () => [],
  getTableData: (connectionId, config, tableName, schema, options) =>
    getClickHouseTableData(connectionId, config, tableName, schema, options),

  closeConnection: (connectionId) => closeClickHouseClient(connectionId),
  getPoolOrClient: (connectionId, config) => getClickHouseClient(connectionId, config),
};

export function getDbAdapter(dbType: string): DbAdapter {
  if (dbType === "clickhouse") return clickhouseAdapter;
  return postgresAdapter;
}
