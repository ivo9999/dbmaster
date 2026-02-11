import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getDbAdapter } from "@/lib/db-adapter";
import { TableViewer } from "./table-viewer";

interface Props {
  params: Promise<{ connectionId: string; database: string; tableName: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    order?: string;
    searchCol?: string;
    searchOp?: string;
    searchVal?: string;
  }>;
}

export default async function TableViewPage({ params, searchParams }: Props) {
  const session = await auth();
  const { connectionId, database, tableName: encodedTableName } = await params;
  const { page, sort, order, searchCol, searchOp, searchVal } = await searchParams;

  if (!session) {
    redirect("/auth/signin");
  }

  // Decode table name (format: schema.table)
  const tableName = decodeURIComponent(encodedTableName);
  const [schema, table] = tableName.includes(".")
    ? tableName.split(".")
    : ["public", tableName];

  // Get connection with access check
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: {
      users: {
        where: { userId: session.user.id },
      },
    },
  });

  if (!connection) {
    notFound();
  }

  // Check access
  const hasAccess = session.user.role === "ADMIN" || connection.users.length > 0;
  if (!hasAccess) {
    redirect("/");
  }

  // Get user's role for this connection
  const userRole =
    session.user.role === "ADMIN"
      ? "ADMIN"
      : connection.users[0]?.role || "VIEWER";

  const canEdit = userRole === "ADMIN" || userRole === "DEVELOPER";

  const connectionConfig = {
    host: connection.host,
    port: connection.port,
    database: database, // Use database from URL
    username: connection.username,
    password: connection.password,
    ssl: connection.ssl,
  };

  // Fetch table schema, data, and tables list
  let tableSchema;
  let tableData;
  let tables: { name: string; schema: string; rowCount: number; size: string }[] = [];
  let error: string | null = null;

  // Build filters from search params
  const filters = searchCol ? [
    { column: searchCol, operator: searchOp || "LIKE", value: searchVal || "" }
  ] : undefined;

  try {
    const adapter = getDbAdapter(connection.dbType);
    const [schemaResult, dataResult, tablesResult] = await Promise.all([
      adapter.getTableSchema(connectionId, connectionConfig, table, schema),
      adapter.getTableData(connectionId, connectionConfig, table, schema, {
        page: page ? parseInt(page) : 1,
        pageSize: 50,
        sortColumn: sort,
        sortDirection: order as "asc" | "desc" | undefined,
        filters,
      }),
      adapter.getTables(connectionId, connectionConfig),
    ]);

    tableSchema = schemaResult;
    tableData = dataResult;
    tables = tablesResult;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch table data";
  }

  // Build activeFilter for the UI
  const activeFilter = searchCol ? {
    column: searchCol,
    operator: searchOp || "LIKE",
    value: searchVal || "",
  } : undefined;

  return (
    <div className="h-full">
      <TableViewer
        connectionId={connectionId}
        connectionName={connection.name}
        database={database}
        tableName={table}
        schema={schema}
        columns={tableSchema?.columns || []}
        data={tableData?.rows || []}
        totalRows={tableData?.totalRows || 0}
        page={tableData?.page || 1}
        pageSize={tableData?.pageSize || 50}
        totalPages={tableData?.totalPages || 1}
        sortColumn={sort}
        sortDirection={order as "asc" | "desc" | undefined}
        error={error}
        canEdit={canEdit}
        userRole={userRole}
        tables={tables}
        activeFilter={activeFilter}
      />
    </div>
  );
}
