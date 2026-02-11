import { Pool, PoolConfig, QueryResult } from "pg";
import { decrypt } from "./encryption";

// Connection pool cache
const pools: Map<string, Pool> = new Map();

interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string; // Encrypted
  ssl: boolean;
}

function getPoolConfig(config: ConnectionConfig): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: decrypt(config.password),
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 10, // Maximum connections per pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

export function getPool(connectionId: string, config: ConnectionConfig): Pool {
  // Include database in the key so each database gets its own pool
  const poolKey = `${connectionId}:${config.database}`;
  const existingPool = pools.get(poolKey);
  if (existingPool) {
    return existingPool;
  }

  const pool = new Pool(getPoolConfig(config));

  pool.on("error", (err) => {
    console.error(`Pool error for connection ${connectionId} (${config.database}):`, err);
    pools.delete(poolKey);
  });

  pools.set(poolKey, pool);
  return pool;
}

export async function closePool(connectionId: string): Promise<void> {
  const pool = pools.get(connectionId);
  if (pool) {
    await pool.end();
    pools.delete(connectionId);
  }
}

export async function closeAllPools(): Promise<void> {
  const closePromises = Array.from(pools.values()).map((pool) => pool.end());
  await Promise.all(closePromises);
  pools.clear();
}

export async function testConnection(config: ConnectionConfig): Promise<{
  success: boolean;
  error?: string;
  version?: string;
}> {
  const pool = new Pool({
    ...getPoolConfig(config),
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query("SELECT version()");
    await pool.end();
    return {
      success: true,
      version: result.rows[0]?.version,
    };
  } catch (error) {
    await pool.end().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// Query execution with parameterized queries for safety
export async function executeQuery(
  connectionId: string,
  config: ConnectionConfig,
  sql: string,
  params?: unknown[]
): Promise<QueryResult> {
  const pool = getPool(connectionId, config);
  return pool.query(sql, params);
}

// Get list of databases on a server
export async function getDatabases(
  config: Omit<ConnectionConfig, "database"> & { database?: string }
): Promise<{
  name: string;
  size: string;
  owner: string;
}[]> {
  // Connect to postgres database to list all databases
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
    return result.rows;
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

// Create a new database
export async function createDatabase(
  config: Omit<ConnectionConfig, "database"> & { database?: string },
  newDbName: string
): Promise<void> {
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
    // Validate database name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(newDbName)) {
      throw new Error("Invalid database name");
    }
    await pool.query(`CREATE DATABASE "${newDbName}"`);
    await pool.end();
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

// Table options for selective cloning
export interface CloneTableOption {
  schema: string;
  table: string;
  rowLimit: number | null; // null = all rows
  include: boolean;
}

// Clone a database (without locking the source)
export async function cloneDatabase(
  config: Omit<ConnectionConfig, "database"> & { database?: string },
  sourceDbName: string,
  newDbName: string,
  mode: "full" | "schema",
  tableOptions?: CloneTableOption[]
): Promise<{ success: boolean; connectionString: string }> {
  // Validate database names to prevent SQL injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(newDbName)) {
    throw new Error("Invalid database name");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(sourceDbName)) {
    throw new Error("Invalid source database name");
  }

  const poolConfig = {
    host: config.host,
    port: config.port,
    user: config.username,
    password: decrypt(config.password),
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 30000,
    statement_timeout: 300000, // 5 minutes for large operations
  };

  // Helper to drop database on failure
  const dropDatabaseOnError = async () => {
    const cleanupPool = new Pool({ ...poolConfig, database: config.database || "postgres" });
    try {
      await cleanupPool.query(`DROP DATABASE IF EXISTS "${newDbName}"`);
    } catch (e) {
      console.error('Failed to cleanup database:', e);
    } finally {
      await cleanupPool.end();
    }
  };

  // For full mode, try to use CREATE DATABASE WITH TEMPLATE for exact copy
  // This is disabled for now due to connection issues - always use manual copy
  // which is more reliable when there are active connections to the source
  const useTemplateCopy = false; // Disabled - template requires no connections to source

  if (mode === "full" && !tableOptions && useTemplateCopy) {
    const adminPool = new Pool({ ...poolConfig, database: config.database || "postgres" });
    try {
      // Terminate ALL connections to source DB (multiple attempts)
      for (let attempt = 0; attempt < 3; attempt++) {
        await adminPool.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
        `, [sourceDbName]);
        // Small delay to let connections close
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Create database from template - this is the most reliable way
      await adminPool.query(`CREATE DATABASE "${newDbName}" WITH TEMPLATE "${sourceDbName}"`);

      // Verify the clone has data - check if it has any tables with rows
      const verifyPool = new Pool({ ...poolConfig, database: newDbName });
      try {
        const verifyResult = await verifyPool.query(`
          SELECT EXISTS(
            SELECT 1 FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            AND table_type = 'BASE TABLE'
          ) as has_tables
        `);

        if (!verifyResult.rows[0]?.has_tables) {
          await verifyPool.end();
          // Drop the empty clone
          const dropPool = new Pool({ ...poolConfig, database: config.database || "postgres" });
          try {
            await dropPool.query(`DROP DATABASE IF EXISTS "${newDbName}"`);
          } finally {
            await dropPool.end();
          }
          throw new Error('Template copy created empty database');
        }
      } finally {
        await verifyPool.end();
      }

      // Build connection string with actual password
      const decryptedPassword = decrypt(config.password);
      const connectionString = `postgresql://${config.username}:${encodeURIComponent(decryptedPassword)}@${config.host}:${config.port}/${newDbName}`;

      return {
        success: true,
        connectionString,
      };
    } catch {
      // If template fails (e.g., active connections), fall back to manual copy
      // Try to drop the partially created database
      try {
        await adminPool.query(`DROP DATABASE IF EXISTS "${newDbName}"`);
      } catch {}
    } finally {
      await adminPool.end();
    }
  }


  // Step 1: Create empty database (for schema-only or when template fails)
  const adminPool = new Pool({ ...poolConfig, database: config.database || "postgres" });
  try {
    await adminPool.query(`CREATE DATABASE "${newDbName}"`);
  } finally {
    await adminPool.end();
  }

  try {

  // Step 2: Connect to source to get schema
  const sourcePool = new Pool({ ...poolConfig, database: sourceDbName });
  let tableList: { schema: string; name: string }[] = [];
  const ddlStatements: string[] = [];
  const foreignKeyStatements: string[] = [];
  const sequenceStatements: string[] = [];

  try {
    // Get all schemas (except system schemas) and create them
    const schemasResult = await sourcePool.query(`
      SELECT nspname FROM pg_namespace
      WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1')
        AND nspname NOT LIKE 'pg_%'
    `);
    for (const row of schemasResult.rows) {
      if (row.nspname !== 'public') {
        ddlStatements.push(`CREATE SCHEMA IF NOT EXISTS "${row.nspname}";`);
      }
    }

    // Get tables list
    const tables = await sourcePool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    tableList = tables.rows.map(r => ({ schema: r.table_schema, name: r.table_name }));

    // Get enum types first - use format_type to get the proper type name with case
    const enumsResult = await sourcePool.query(`
      SELECT
        n.nspname as schema,
        t.typname as name,
        format_type(t.oid, NULL) as formatted_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      GROUP BY n.nspname, t.typname, t.oid
    `);

    for (const row of enumsResult.rows) {
      const values = Array.isArray(row.values)
        ? row.values
        : (typeof row.values === 'string' ? row.values.replace(/^\{|\}$/g, '').split(',') : []);
      const typeName = row.name;
      ddlStatements.push(`CREATE TYPE "${row.schema}"."${typeName}" AS ENUM (${values.map((v: string) => `'${v}'`).join(', ')});`);
    }

    // Get all sequences and their current values
    const sequencesResult = await sourcePool.query(`
      SELECT
        schemaname,
        sequencename,
        last_value,
        start_value,
        increment_by,
        max_value,
        min_value,
        cache_size,
        cycle
      FROM pg_sequences
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    `);

    for (const seq of sequencesResult.rows) {
      ddlStatements.push(`CREATE SEQUENCE IF NOT EXISTS "${seq.schemaname}"."${seq.sequencename}" START WITH ${seq.start_value || 1} INCREMENT BY ${seq.increment_by || 1} MINVALUE ${seq.min_value || 1} MAXVALUE ${seq.max_value || 9223372036854775807} CACHE ${seq.cache_size || 1}${seq.cycle ? ' CYCLE' : ''};`);
      if (seq.last_value) {
        sequenceStatements.push(`SELECT setval('"${seq.schemaname}"."${seq.sequencename}"', ${seq.last_value}, true);`);
      }
    }

    // Generate table DDLs
    for (const table of tableList) {
      const { schema, name: tableName } = table;

      // Get columns
      const columnsResult = await sourcePool.query(`
        SELECT column_name, data_type, udt_name, udt_schema, character_maximum_length,
               numeric_precision, numeric_scale, is_nullable, column_default,
               is_identity, identity_generation
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, tableName]);

      // Get primary key
      const pkResult = await sourcePool.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
        ORDER BY kcu.ordinal_position
      `, [schema, tableName]);

      // Get unique constraints
      const uniqueResult = await sourcePool.query(`
        SELECT
          tc.constraint_name,
          array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1 AND tc.table_name = $2
        GROUP BY tc.constraint_name
      `, [schema, tableName]);

      // Get check constraints
      const checkResult = await sourcePool.query(`
        SELECT cc.constraint_name, cc.check_clause
        FROM information_schema.check_constraints cc
        JOIN information_schema.table_constraints tc
          ON cc.constraint_name = tc.constraint_name AND cc.constraint_schema = tc.constraint_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2
          AND cc.constraint_name NOT LIKE '%_not_null'
      `, [schema, tableName]);

      // Build CREATE TABLE
      let ddl = `CREATE TABLE IF NOT EXISTS "${schema}"."${tableName}" (\n`;
      const columnDefs = columnsResult.rows.map(col => {
        let def = `  "${col.column_name}" `;
        if (col.data_type === 'character varying') {
          def += col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
        } else if (col.data_type === 'character') {
          def += col.character_maximum_length ? `char(${col.character_maximum_length})` : 'char';
        } else if (col.data_type === 'numeric') {
          def += col.numeric_precision ? `numeric(${col.numeric_precision}${col.numeric_scale ? `,${col.numeric_scale}` : ''})` : 'numeric';
        } else if (col.data_type === 'ARRAY') {
          def += `${col.udt_name.replace(/^_/, '')}[]`;
        } else if (col.data_type === 'USER-DEFINED') {
          // Include schema for enum types - always quote to preserve case
          def += `"${col.udt_schema}"."${col.udt_name}"`;
        } else {
          def += col.data_type;
        }
        if (col.is_identity === 'YES') {
          def += ` GENERATED ${col.identity_generation === 'ALWAYS' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
        }
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        // For defaults that reference enum types, ensure proper quoting
        if (col.column_default && col.is_identity !== 'YES') {
          // Replace unquoted enum type references with quoted ones in defaults
          let defaultVal = col.column_default;
          if (col.data_type === 'USER-DEFINED' && defaultVal.includes('::')) {
            // Extract the type cast and re-quote it properly
            defaultVal = defaultVal.replace(/::"?([^":\s]+)"?/g, `::"${col.udt_schema}"."${col.udt_name}"`);
          }
          def += ` DEFAULT ${defaultVal}`;
        }
        return def;
      });

      ddl += columnDefs.join(',\n');
      if (pkResult.rows.length > 0) {
        ddl += `,\n  PRIMARY KEY (${pkResult.rows.map(r => `"${r.column_name}"`).join(', ')})`;
      }

      // Add unique constraints
      for (const unique of uniqueResult.rows) {
        const cols = Array.isArray(unique.columns) ? unique.columns : [];
        if (cols.length > 0) {
          ddl += `,\n  CONSTRAINT "${unique.constraint_name}" UNIQUE (${cols.map((c: string) => `"${c}"`).join(', ')})`;
        }
      }

      // Add check constraints
      for (const check of checkResult.rows) {
        ddl += `,\n  CONSTRAINT "${check.constraint_name}" CHECK (${check.check_clause})`;
      }

      ddl += '\n);';
      ddlStatements.push(ddl);
    }

    // Get foreign keys (add after all tables are created)
    const fkResult = await sourcePool.query(`
      SELECT
        tc.constraint_name,
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position
    `);

    // Group foreign keys by constraint name
    const fkMap = new Map<string, {
      schema: string;
      table: string;
      columns: string[];
      foreignSchema: string;
      foreignTable: string;
      foreignColumns: string[];
      updateRule: string;
      deleteRule: string;
    }>();

    for (const fk of fkResult.rows) {
      const key = `${fk.table_schema}.${fk.table_name}.${fk.constraint_name}`;
      if (!fkMap.has(key)) {
        fkMap.set(key, {
          schema: fk.table_schema,
          table: fk.table_name,
          columns: [],
          foreignSchema: fk.foreign_table_schema,
          foreignTable: fk.foreign_table_name,
          foreignColumns: [],
          updateRule: fk.update_rule,
          deleteRule: fk.delete_rule,
        });
      }
      const entry = fkMap.get(key)!;
      if (!entry.columns.includes(fk.column_name)) {
        entry.columns.push(fk.column_name);
        entry.foreignColumns.push(fk.foreign_column_name);
      }
    }

    for (const [key, fk] of fkMap) {
      const constraintName = key.split('.')[2];
      let stmt = `ALTER TABLE "${fk.schema}"."${fk.table}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY (${fk.columns.map(c => `"${c}"`).join(', ')}) REFERENCES "${fk.foreignSchema}"."${fk.foreignTable}" (${fk.foreignColumns.map(c => `"${c}"`).join(', ')})`;
      if (fk.deleteRule && fk.deleteRule !== 'NO ACTION') {
        stmt += ` ON DELETE ${fk.deleteRule}`;
      }
      if (fk.updateRule && fk.updateRule !== 'NO ACTION') {
        stmt += ` ON UPDATE ${fk.updateRule}`;
      }
      stmt += ';';
      foreignKeyStatements.push(stmt);
    }

    // Get indexes (non-primary key, non-unique constraint)
    const indexesResult = await sourcePool.query(`
      SELECT pg_indexes.indexdef FROM pg_indexes
      WHERE pg_indexes.schemaname NOT IN ('pg_catalog', 'information_schema')
        AND pg_indexes.indexname NOT IN (
          SELECT tc.constraint_name FROM information_schema.table_constraints tc
          WHERE tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
        )
    `);
    for (const idx of indexesResult.rows) {
      if (idx.indexdef) {
        ddlStatements.push(idx.indexdef.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS') + ';');
      }
    }
  } finally {
    await sourcePool.end();
  }

  // Step 3: Execute DDLs on target database
  const targetPool = new Pool({ ...poolConfig, database: newDbName });
  try {
    for (const ddl of ddlStatements) {
      try {
        await targetPool.query(ddl);
      } catch {
        // Continue on error - some DDLs may fail if objects exist
      }
    }
  } finally {
    await targetPool.end();
  }

  // Step 4: If full mode, copy data table by table (no locking!)
  if (mode === "full" && tableList.length > 0) {
    const sourceDataPool = new Pool({ ...poolConfig, database: sourceDbName });
    const targetDataPool = new Pool({ ...poolConfig, database: newDbName });

    try {
      // Disable foreign key checks temporarily for faster inserts
      await targetDataPool.query('SET session_replication_role = replica;');

      for (const table of tableList) {
        const { schema, name: tableName } = table;
        const fullName = `"${schema}"."${tableName}"`;

        // Check if this table should be included and get row limit
        let shouldCopy = true;
        let rowLimit: number | null = null;

        if (tableOptions && tableOptions.length > 0) {
          const option = tableOptions.find(
            o => o.schema === schema && o.table === tableName
          );
          if (option) {
            shouldCopy = option.include;
            rowLimit = option.rowLimit;
          } else {
            // If tableOptions provided but this table not in list, skip it
            shouldCopy = false;
          }
        }

        if (!shouldCopy) continue;

        try {
          // Fetch data from source (with optional limit)
          const limitClause = rowLimit ? ` LIMIT ${rowLimit}` : '';
          const dataResult = await sourceDataPool.query(`SELECT * FROM ${fullName}${limitClause}`);

          if (dataResult.rows.length > 0) {
            const columns = dataResult.fields.map(f => `"${f.name}"`).join(', ');

            // Insert in batches to avoid memory issues
            const batchSize = 1000;
            for (let i = 0; i < dataResult.rows.length; i += batchSize) {
              const batch = dataResult.rows.slice(i, i + batchSize);
              const values: unknown[] = [];
              const valuePlaceholders = batch.map((row, batchIndex) => {
                const rowPlaceholders = dataResult.fields.map((f, colIndex) => {
                  values.push(row[f.name]);
                  return `$${batchIndex * dataResult.fields.length + colIndex + 1}`;
                });
                return `(${rowPlaceholders.join(', ')})`;
              });

              await targetDataPool.query(
                `INSERT INTO ${fullName} (${columns}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT DO NOTHING`,
                values
              );
            }
          }
        } catch {
          // Continue with other tables
        }
      }

      // Re-enable foreign key checks
      await targetDataPool.query('SET session_replication_role = DEFAULT;');

      // Update sequences to correct values after data insert
      for (const seqStmt of sequenceStatements) {
        try {
          await targetDataPool.query(seqStmt);
        } catch {
          // Ignore sequence update errors
        }
      }
    } finally {
      await sourceDataPool.end();
      await targetDataPool.end();
    }
  }

  // Step 5: Add foreign key constraints (after data is copied)
  const fkPool = new Pool({ ...poolConfig, database: newDbName });
  try {
    for (const fkStmt of foreignKeyStatements) {
      try {
        await fkPool.query(fkStmt);
      } catch {
        // Continue - FK might already exist or reference missing table
      }
    }
  } finally {
    await fkPool.end();
  }

  // Build connection string with actual password
  const decryptedPassword = decrypt(config.password);
  const connectionString = `postgresql://${config.username}:${encodeURIComponent(decryptedPassword)}@${config.host}:${config.port}/${newDbName}`;

    return {
      success: true,
      connectionString,
    };

  } catch (error) {
    // Cleanup: drop the database if cloning failed
    await dropDatabaseOnError();
    throw error;
  }
}

// Get table list from a connection
export async function getTables(
  connectionId: string,
  config: ConnectionConfig
): Promise<
  {
    name: string;
    schema: string;
    rowCount: number;
    size: string;
  }[]
> {
  const pool = getPool(connectionId, config);

  const result = await pool.query(`
    SELECT
      t.table_schema as schema,
      t.table_name as name,
      COALESCE(s.n_live_tup, 0) as row_count,
      pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))) as size
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables s
      ON s.schemaname = t.table_schema
      AND s.relname = t.table_name
    WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_schema, t.table_name
  `);

  return result.rows.map((row) => ({
    name: row.name,
    schema: row.schema,
    rowCount: parseInt(row.row_count, 10),
    size: row.size,
  }));
}

// Get table schema/columns
export async function getTableSchema(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  schema: string = "public"
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
  const pool = getPool(connectionId, config);

  // Get columns
  const columnsResult = await pool.query(
    `
    SELECT
      c.column_name as name,
      c.data_type as type,
      c.udt_name as udt_type,
      c.is_nullable = 'YES' as nullable,
      c.column_default as default_value,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
      CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
      fk.foreign_table_name,
      fk.foreign_column_name
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $2
        AND tc.table_name = $1
    ) pk ON pk.column_name = c.column_name
    LEFT JOIN (
      SELECT
        kcu.column_name,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $2
        AND tc.table_name = $1
    ) fk ON fk.column_name = c.column_name
    WHERE c.table_schema = $2 AND c.table_name = $1
    ORDER BY c.ordinal_position
  `,
    [tableName, schema]
  );

  // Get indexes
  const indexesResult = await pool.query(
    `
    SELECT
      i.relname as name,
      array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
      ix.indisunique as is_unique,
      am.amname as type
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE n.nspname = $2 AND t.relname = $1
    GROUP BY i.relname, ix.indisunique, am.amname
    ORDER BY i.relname
  `,
    [tableName, schema]
  );

  // Get foreign keys
  const fkResult = await pool.query(
    `
    SELECT
      tc.constraint_name as name,
      array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
      ccu.table_name as referenced_table,
      array_agg(ccu.column_name ORDER BY kcu.ordinal_position) as referenced_columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $2
      AND tc.table_name = $1
    GROUP BY tc.constraint_name, ccu.table_name
  `,
    [tableName, schema]
  );

  // Get enum values for columns with enum types
  const enumResult = await pool.query(
    `
    SELECT
      c.column_name,
      array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
    FROM information_schema.columns c
    JOIN pg_type t ON t.typname = c.udt_name
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE c.table_schema = $2
      AND c.table_name = $1
      AND c.data_type = 'USER-DEFINED'
    GROUP BY c.column_name
  `,
    [tableName, schema]
  );

  const enumMap: Record<string, string[]> = {};
  for (const row of enumResult.rows) {
    // Ensure enum_values is always an array (pg driver sometimes returns string format)
    const values = row.enum_values;
    if (Array.isArray(values)) {
      enumMap[row.column_name] = values;
    } else if (typeof values === 'string') {
      // Parse PostgreSQL array string format: {val1,val2,val3}
      enumMap[row.column_name] = values.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    }
  }

  return {
    columns: columnsResult.rows.map((row) => ({
      name: row.name,
      type: row.udt_type || row.type,
      nullable: row.nullable,
      defaultValue: row.default_value,
      isPrimaryKey: row.is_primary_key,
      isForeignKey: row.is_foreign_key,
      foreignKeyRef: row.is_foreign_key
        ? { table: row.foreign_table_name, column: row.foreign_column_name }
        : undefined,
      enumValues: enumMap[row.name],
    })),
    indexes: indexesResult.rows.map((row) => ({
      name: row.name,
      columns: row.columns,
      isUnique: row.is_unique,
      type: row.type,
    })),
    foreignKeys: fkResult.rows.map((row) => ({
      name: row.name,
      columns: row.columns,
      referencedTable: row.referenced_table,
      referencedColumns: row.referenced_columns,
    })),
  };
}

// Get table DDL (CREATE TABLE statement)
export async function getTableDDL(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  schema: string = "public"
): Promise<string> {
  const pool = getPool(connectionId, config);

  // Get columns
  const columnsResult = await pool.query(`
    SELECT
      column_name,
      data_type,
      udt_name,
      character_maximum_length,
      numeric_precision,
      numeric_scale,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schema, tableName]);

  // Get primary key
  const pkResult = await pool.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
    ORDER BY kcu.ordinal_position
  `, [schema, tableName]);

  // Get foreign keys
  const fkResult = await pool.query(`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema AS foreign_schema,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND tc.table_name = $2
  `, [schema, tableName]);

  // Get unique constraints
  const uniqueResult = await pool.query(`
    SELECT
      tc.constraint_name,
      array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = $1
      AND tc.table_name = $2
    GROUP BY tc.constraint_name
  `, [schema, tableName]);

  // Build DDL
  const pkColumns = pkResult.rows.map(r => r.column_name);
  const fkMap = new Map<string, { columns: string[], foreignSchema: string, foreignTable: string, foreignColumns: string[] }>();

  for (const fk of fkResult.rows) {
    if (!fkMap.has(fk.constraint_name)) {
      fkMap.set(fk.constraint_name, {
        columns: [],
        foreignSchema: fk.foreign_schema,
        foreignTable: fk.foreign_table,
        foreignColumns: []
      });
    }
    const entry = fkMap.get(fk.constraint_name)!;
    entry.columns.push(fk.column_name);
    entry.foreignColumns.push(fk.foreign_column);
  }

  let ddl = `CREATE TABLE "${schema}"."${tableName}" (\n`;

  // Columns
  const columnDefs = columnsResult.rows.map(col => {
    let def = `  "${col.column_name}" `;

    // Data type
    if (col.data_type === 'character varying') {
      def += col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
    } else if (col.data_type === 'character') {
      def += col.character_maximum_length ? `char(${col.character_maximum_length})` : 'char';
    } else if (col.data_type === 'numeric') {
      def += col.numeric_precision ? `numeric(${col.numeric_precision}${col.numeric_scale ? `,${col.numeric_scale}` : ''})` : 'numeric';
    } else if (col.data_type === 'ARRAY') {
      def += `${col.udt_name.replace(/^_/, '')}[]`;
    } else if (col.data_type === 'USER-DEFINED') {
      def += col.udt_name;
    } else {
      def += col.data_type;
    }

    // Nullable
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }

    // Default
    if (col.column_default) {
      def += ` DEFAULT ${col.column_default}`;
    }

    return def;
  });

  ddl += columnDefs.join(',\n');

  // Primary key
  if (pkColumns.length > 0) {
    ddl += `,\n  PRIMARY KEY (${pkColumns.map(c => `"${c}"`).join(', ')})`;
  }

  // Unique constraints
  for (const unique of uniqueResult.rows) {
    ddl += `,\n  CONSTRAINT "${unique.constraint_name}" UNIQUE (${unique.columns.map((c: string) => `"${c}"`).join(', ')})`;
  }

  // Foreign keys
  for (const [name, fk] of fkMap) {
    ddl += `,\n  CONSTRAINT "${name}" FOREIGN KEY (${fk.columns.map(c => `"${c}"`).join(', ')}) REFERENCES "${fk.foreignSchema}"."${fk.foreignTable}" (${fk.foreignColumns.map(c => `"${c}"`).join(', ')})`;
  }

  ddl += '\n);';

  return ddl;
}

// Get triggers for a table
export async function getTableTriggers(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  schema: string = "public"
): Promise<{ name: string; event: string; timing: string; definition: string }[]> {
  const pool = getPool(connectionId, config);

  const result = await pool.query(`
    SELECT
      t.tgname as name,
      CASE t.tgtype::int & 66
        WHEN 2 THEN 'BEFORE'
        WHEN 64 THEN 'INSTEAD OF'
        ELSE 'AFTER'
      END as timing,
      CASE t.tgtype::int & 28
        WHEN 4 THEN 'INSERT'
        WHEN 8 THEN 'DELETE'
        WHEN 16 THEN 'UPDATE'
        WHEN 20 THEN 'INSERT OR UPDATE'
        WHEN 12 THEN 'INSERT OR DELETE'
        WHEN 24 THEN 'UPDATE OR DELETE'
        WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
      END as event,
      pg_get_triggerdef(t.oid) as definition
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = $1
      AND c.relname = $2
      AND NOT t.tgisinternal
    ORDER BY t.tgname
  `, [schema, tableName]);

  return result.rows;
}

// Get indexes for a table
export async function getTableIndexes(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  schema: string = "public"
): Promise<{ name: string; columns: string[]; unique: boolean; type: string; definition: string }[]> {
  const pool = getPool(connectionId, config);

  const result = await pool.query(`
    SELECT
      i.relname as name,
      array_agg(a.attname ORDER BY x.n) as columns,
      ix.indisunique as unique,
      am.amname as type,
      pg_get_indexdef(i.oid) as definition
    FROM pg_index ix
    JOIN pg_class i ON ix.indexrelid = i.oid
    JOIN pg_class t ON ix.indrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    JOIN pg_am am ON i.relam = am.oid
    JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, n) ON TRUE
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
    WHERE n.nspname = $1
      AND t.relname = $2
      AND NOT ix.indisprimary
    GROUP BY i.relname, ix.indisunique, am.amname, i.oid
    ORDER BY i.relname
  `, [schema, tableName]);

  // Ensure columns is always an array (pg driver sometimes returns string format)
  return result.rows.map(row => ({
    ...row,
    columns: Array.isArray(row.columns)
      ? row.columns
      : typeof row.columns === 'string'
        ? row.columns.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
        : []
  }));
}

// Get table data with pagination, sorting, and filtering
export interface TableDataOptions {
  page?: number;
  pageSize?: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  filters?: { column: string; operator: string; value: string }[];
}

export async function getTableData(
  connectionId: string,
  config: ConnectionConfig,
  tableName: string,
  schema: string = "public",
  options: TableDataOptions = {}
): Promise<{
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const pool = getPool(connectionId, config);
  const { page = 1, pageSize = 50, sortColumn, sortDirection = "asc", filters = [] } = options;

  const offset = (page - 1) * pageSize;
  const params: unknown[] = [];
  let paramIndex = 1;

  // Build WHERE clause from filters
  let whereClause = "";
  if (filters.length > 0) {
    const conditions = filters.map((filter) => {
      const column = `"${filter.column.replace(/"/g, '""')}"`;
      switch (filter.operator) {
        case "=":
          params.push(filter.value);
          return `${column} = $${paramIndex++}`;
        case "!=":
          params.push(filter.value);
          return `${column} != $${paramIndex++}`;
        case ">":
          params.push(filter.value);
          return `${column} > $${paramIndex++}`;
        case "<":
          params.push(filter.value);
          return `${column} < $${paramIndex++}`;
        case ">=":
          params.push(filter.value);
          return `${column} >= $${paramIndex++}`;
        case "<=":
          params.push(filter.value);
          return `${column} <= $${paramIndex++}`;
        case "LIKE":
          params.push(`%${filter.value}%`);
          return `${column}::text ILIKE $${paramIndex++}`;
        case "IS NULL":
          return `${column} IS NULL`;
        case "IS NOT NULL":
          return `${column} IS NOT NULL`;
        default:
          params.push(filter.value);
          return `${column} = $${paramIndex++}`;
      }
    });
    whereClause = `WHERE ${conditions.join(" AND ")}`;
  }

  // Sanitize table and schema names
  const safeSchema = schema.replace(/"/g, '""');
  const safeTable = tableName.replace(/"/g, '""');
  const fullTableName = `"${safeSchema}"."${safeTable}"`;

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM ${fullTableName} ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const totalRows = parseInt(countResult.rows[0].count, 10);

  // Build ORDER BY clause
  let orderByClause = "";
  if (sortColumn) {
    const safeColumn = sortColumn.replace(/"/g, '""');
    const direction = sortDirection === "desc" ? "DESC" : "ASC";
    orderByClause = `ORDER BY "${safeColumn}" ${direction}`;
  }

  // Get data
  params.push(pageSize, offset);
  const dataQuery = `
    SELECT * FROM ${fullTableName}
    ${whereClause}
    ${orderByClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  const dataResult = await pool.query(dataQuery, params);

  return {
    rows: dataResult.rows,
    totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
  };
}
