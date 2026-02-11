import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getDbAdapter } from "@/lib/db-adapter";
import { TableViewer } from "./table-viewer";

interface Props {
  params: Promise<{ connectionId: string; tableName: string }>;
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
  const { connectionId, tableName: encodedTableName } = await params;
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
    database: connection.database,
    username: connection.username,
    password: connection.password,
    ssl: connection.ssl,
  };

  // Build filters from search params
  const filters = searchCol ? [
    { column: searchCol, operator: searchOp || "LIKE", value: searchVal || "" }
  ] : undefined;

  // Fetch table schema and data
  let tableSchema;
  let tableData;
  let error: string | null = null;

  try {
    const adapter = getDbAdapter(connection.dbType);
    const [schemaResult, dataResult] = await Promise.all([
      adapter.getTableSchema(connectionId, connectionConfig, table, schema),
      adapter.getTableData(connectionId, connectionConfig, table, schema, {
        page: page ? parseInt(page) : 1,
        pageSize: 50,
        sortColumn: sort,
        sortDirection: order as "asc" | "desc" | undefined,
        filters,
      }),
    ]);

    tableSchema = schemaResult;
    tableData = dataResult;
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
        activeFilter={activeFilter}
      />
    </div>
  );
}
