"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Key,
  Link as LinkIcon,
  Copy,
  Check,
  Plus,
  Trash2,
  Loader2,
  X,
  Save,
  Download,
  Code,
  Database,
  FileJson,
  FileSpreadsheet,
  FileCode,
  Table2,
  Search,
  MoreVertical,
  Edit,
  PanelLeftClose,
  PanelLeft,
  Play,
  Clock,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { SqlEditor } from "@/components/sql-editor/sql-editor";

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyRef?: { table: string; column: string };
  enumValues?: string[];
}

interface Index {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
  definition: string;
}

interface Trigger {
  name: string;
  event: string;
  timing: string;
  definition: string;
}

interface TableInfo {
  name: string;
  schema: string;
  rowCount: number;
  size: string;
}

interface ActiveFilter {
  column: string;
  operator: string;
  value: string;
}

interface TableViewerProps {
  connectionId: string;
  connectionName: string;
  database?: string;
  tableName: string;
  schema: string;
  columns: Column[];
  data: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  error: string | null;
  canEdit: boolean;
  userRole: string;
  tables?: TableInfo[];
  activeFilter?: ActiveFilter;
}

interface EditingCell {
  rowIndex: number;
  columnName: string;
  originalValue: unknown;
  currentValue: string;
}

interface SchemaInfo {
  ddl: string;
  indexes: Index[];
  triggers: Trigger[];
  columns: Column[];
}

export function TableViewer({
  connectionId,
  connectionName,
  database,
  tableName,
  schema,
  columns,
  data: initialData,
  totalRows,
  page,
  pageSize,
  totalPages,
  sortColumn,
  sortDirection,
  error,
  canEdit,
  userRole,
  tables = [],
  activeFilter,
}: TableViewerProps) {
  // Build the base path based on whether we have a database param
  const basePath = database
    ? `/${connectionId}/db/${database}`
    : `/${connectionId}`;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [copiedDDL, setCopiedDDL] = useState(false);
  const [data, setData] = useState(initialData);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showNewRowForm, setShowNewRowForm] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"data" | "schema" | "query">("data");
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Query tab state
  const [sql, setSql] = useState(`SELECT * FROM ${schema !== "public" ? `${schema}.` : ""}${tableName} LIMIT 100;`);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<{ rows: Record<string, unknown>[]; columns: string[]; rowCount: number; executionTime: number } | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tableSearch, setTableSearch] = useState("");
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Search/filter state - now per-column in header
  const [searchValue, setSearchValue] = useState(activeFilter?.value || "");
  const [activeSearchColumn, setActiveSearchColumn] = useState<string | null>(activeFilter?.column || null);

  // FK preview state
  const [fkPreviewData, setFkPreviewData] = useState<Record<string, {
    columns: { name: string; type: string; isPrimaryKey: boolean; isForeignKey: boolean }[];
    rows: Record<string, unknown>[];
    loading: boolean;
    error?: string;
  }>>({});

  // Fetch FK preview data
  const fetchFkPreview = useCallback(async (refTable: string, refSchema: string) => {
    const cacheKey = `${refSchema}.${refTable}`;

    // Skip if already loaded or loading
    if (fkPreviewData[cacheKey]?.columns || fkPreviewData[cacheKey]?.loading) {
      return;
    }

    setFkPreviewData(prev => ({
      ...prev,
      [cacheKey]: { columns: [], rows: [], loading: true }
    }));

    try {
      const response = await fetch(
        `/api/connections/${connectionId}/tables/${refTable}/preview?schema=${refSchema}${database ? `&database=${database}` : ''}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch preview');
      }

      const data = await response.json();
      setFkPreviewData(prev => ({
        ...prev,
        [cacheKey]: {
          columns: data.columns || [],
          rows: data.rows || [],
          loading: false
        }
      }));
    } catch {
      setFkPreviewData(prev => ({
        ...prev,
        [cacheKey]: { columns: [], rows: [], loading: false, error: 'Failed to load preview' }
      }));
    }
  }, [connectionId, database, fkPreviewData]);

  // Filter tables by search
  const filteredTables = tables.filter(t =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
    t.schema.toLowerCase().includes(tableSearch.toLowerCase())
  );

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Get primary key columns
  const primaryKeyColumns = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

  // Update data when initialData changes
  useEffect(() => {
    setData(initialData);
    setSelectedRows(new Set());
  }, [initialData]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // N for new row
      if (e.key === "n" && !editingCell && canEdit && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setShowNewRowForm(true);
      }
      // D for delete
      if (e.key === "d" && selectedRows.size > 0 && canEdit && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setShowDeleteDialog(true);
      }
      // Escape to cancel
      if (e.key === "Escape") {
        setEditingCell(null);
        setShowNewRowForm(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingCell, selectedRows, canEdit]);

  // Load schema info when tab changes
  const loadSchemaInfo = useCallback(async () => {
    if (schemaInfo) return;
    setLoadingSchema(true);
    try {
      const response = await fetch(
        `/api/connections/${connectionId}/tables/${tableName}/schema?schema=${schema}${database ? `&database=${database}` : ''}`
      );
      if (response.ok) {
        const data = await response.json();
        setSchemaInfo(data);
      }
    } catch {
      toast.error("Failed to load schema info");
    } finally {
      setLoadingSchema(false);
    }
  }, [connectionId, tableName, schema, database, schemaInfo]);

  useEffect(() => {
    if (activeTab === "schema") {
      loadSchemaInfo();
    }
  }, [activeTab, loadSchemaInfo]);

  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.push(`?${params.toString()}`);
  };

  const handleSort = (columnName: string) => {
    if (sortColumn === columnName) {
      if (sortDirection === "asc") {
        updateParams({ sort: columnName, order: "desc" });
      } else {
        updateParams({ sort: undefined, order: undefined });
      }
    } else {
      updateParams({ sort: columnName, order: "asc" });
    }
  };

  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage.toString() });
  };

  const handleSearch = (columnName: string, value: string) => {
    if (!value.trim()) {
      // Clear filter if empty
      handleClearFilters();
      return;
    }

    const updates: Record<string, string | undefined> = {
      page: "1", // Reset to first page on new search
      searchCol: columnName,
      searchOp: "LIKE", // Always use LIKE (contains) for inline search
      searchVal: value,
    };

    updateParams(updates);
  };

  const handleClearFilters = () => {
    setSearchValue("");
    setActiveSearchColumn(null);
    updateParams({
      page: "1",
      searchCol: undefined,
      searchOp: undefined,
      searchVal: undefined,
    });
  };

  // Execute query in the query tab
  const executeQuery = async () => {
    if (!sql.trim()) {
      toast.error("Please enter a SQL query");
      return;
    }

    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const response = await fetch(`/api/connections/${connectionId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sql.trim(), database }),
      });

      const data = await response.json();

      if (!response.ok) {
        setQueryError(data.message || "Query failed");
        return;
      }

      setQueryResult(data);
      toast.success(`Query completed in ${data.executionTime}ms`);
    } catch {
      setQueryError("Failed to execute query");
    } finally {
      setQueryLoading(false);
    }
  };

  const toggleColumnSearch = (columnName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent sorting when clicking search icon
    if (activeSearchColumn === columnName) {
      // If clicking the same column, close search
      setActiveSearchColumn(null);
    } else {
      // Open search for this column
      setActiveSearchColumn(columnName);
      // Pre-fill with existing filter value if filtering this column
      if (activeFilter?.column === columnName) {
        setSearchValue(activeFilter.value);
      } else {
        setSearchValue("");
      }
    }
  };

  const copyToClipboard = async (value: string, cellId: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 2000);
  };

  const copyDDL = async () => {
    if (schemaInfo?.ddl) {
      await navigator.clipboard.writeText(schemaInfo.ddl);
      setCopiedDDL(true);
      setTimeout(() => setCopiedDDL(false), 2000);
      toast.success("DDL copied to clipboard");
    }
  };

  const formatCellValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const parseInputValue = (value: string, type: string): unknown => {
    if (value === "" || value === "NULL") return null;
    if (type.includes("int") || type === "int4" || type === "int8" || type === "int2") {
      return parseInt(value, 10);
    }
    if (type.includes("float") || type.includes("double") || type.includes("numeric") || type.includes("decimal") || type === "float4" || type === "float8") {
      return parseFloat(value);
    }
    if (type === "bool" || type === "boolean") {
      return value.toLowerCase() === "true" || value === "1";
    }
    if (type === "json" || type === "jsonb") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  };

  const getTypeColor = (type: string): string => {
    if (type.includes("int") || type.includes("numeric") || type.includes("decimal") || type.includes("float") || type.includes("double"))
      return "text-blue-400";
    if (type.includes("char") || type.includes("text"))
      return "text-green-400";
    if (type.includes("bool"))
      return "text-purple-400";
    if (type.includes("time") || type.includes("date"))
      return "text-orange-400";
    if (type.includes("json"))
      return "text-yellow-400";
    if (type.includes("uuid"))
      return "text-pink-400";
    return "text-muted-foreground";
  };

  const getPrimaryKeyValue = (row: Record<string, unknown>): Record<string, unknown> => {
    const pk: Record<string, unknown> = {};
    for (const col of primaryKeyColumns) {
      pk[col] = row[col];
    }
    return pk;
  };

  const startEditing = (rowIndex: number, columnName: string, value: unknown) => {
    if (!canEdit) return;
    setEditingCell({
      rowIndex,
      columnName,
      originalValue: value,
      currentValue: formatCellValue(value),
    });
  };

  const cancelEditing = () => {
    setEditingCell(null);
  };

  const saveEdit = async (valueOverride?: string) => {
    if (!editingCell) return;

    const row = data[editingCell.rowIndex];
    const column = columns.find((c) => c.name === editingCell.columnName);
    if (!column) return;

    const valueToSave = valueOverride !== undefined ? valueOverride : editingCell.currentValue;
    const newValue = parseInputValue(valueToSave, column.type);

    // Don't save if value hasn't changed
    if (newValue === editingCell.originalValue) {
      setEditingCell(null);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        `/api/connections/${connectionId}/tables/${tableName}/data`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema,
            database,
            primaryKey: getPrimaryKeyValue(row),
            updates: { [editingCell.columnName]: newValue },
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to update");
        return;
      }

      // Update local data
      const newData = [...data];
      newData[editingCell.rowIndex] = result.row;
      setData(newData);
      toast.success("Updated successfully");
      setEditingCell(null);
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const toggleRowSelection = (rowIndex: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(rowIndex)) {
      newSelected.delete(rowIndex);
    } else {
      newSelected.add(rowIndex);
    }
    setSelectedRows(newSelected);
  };

  const toggleAllRows = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map((_, i) => i)));
    }
  };

  const deleteSelectedRows = async () => {
    if (selectedRows.size === 0) return;

    setDeleting(true);
    try {
      const primaryKeys = Array.from(selectedRows).map((index) =>
        getPrimaryKeyValue(data[index])
      );

      const response = await fetch(
        `/api/connections/${connectionId}/tables/${tableName}/data`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema, database, primaryKeys }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to delete");
        return;
      }

      toast.success(`Deleted ${result.deletedCount} row(s)`);
      setShowDeleteDialog(false);
      setSelectedRows(new Set());
      router.refresh();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const insertRow = async () => {
    setSaving(true);
    try {
      const rowData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newRowData)) {
        if (value !== "") {
          const column = columns.find((c) => c.name === key);
          if (column) {
            rowData[key] = parseInputValue(value, column.type);
          }
        }
      }

      const response = await fetch(
        `/api/connections/${connectionId}/tables/${tableName}/data`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schema, database, data: rowData }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to insert");
        return;
      }

      toast.success("Row inserted");
      setShowNewRowForm(false);
      setNewRowData({});
      router.refresh();
    } catch {
      toast.error("Failed to insert");
    } finally {
      setSaving(false);
    }
  };

  const exportData = (format: "csv" | "json" | "sql") => {
    const url = `/api/connections/${connectionId}/tables/${tableName}/export?schema=${schema}&format=${format}${database ? `&database=${database}` : ''}`;
    window.open(url, "_blank");
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Error Loading Table</h2>
          <p className="text-sm text-muted-foreground max-w-md mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        {/* Sidebar with Tables List - collapsible on mobile */}
        {tables.length > 0 && (
          <div className={cn(
            "border-r bg-card flex flex-col shrink-0 min-h-0 transition-all duration-200",
            sidebarOpen ? "w-64" : "w-0 border-r-0 overflow-hidden",
            "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20",
            !sidebarOpen && "max-md:w-0"
          )}>
            <div className="p-3 border-b flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tables..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 md:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-1">
                {filteredTables.map((table) => {
                  const isActive = table.name === tableName && table.schema === schema;
                  return (
                    <Link
                      key={`${table.schema}.${table.name}`}
                      href={`${basePath}/tables/${table.schema}.${table.name}`}
                      onClick={() => {
                        // Close sidebar on mobile after selection
                        if (window.innerWidth < 768) {
                          setSidebarOpen(false);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Table2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{table.name}</span>
                      </div>
                      <span className="text-xs opacity-60 ml-2 shrink-0">{formatNumber(table.rowCount)}</span>
                    </Link>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-2 border-t text-xs text-muted-foreground text-center">
              {tables.length} table{tables.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Mobile sidebar backdrop */}
        {tables.length > 0 && sidebarOpen && (
          <div
            className="fixed inset-0 bg-background/80 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "data" | "schema" | "query")} className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Header */}
          <div className="border-b bg-card px-3 md:px-4 py-2 md:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                {/* Mobile sidebar toggle */}
                {tables.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 md:hidden"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                )}
                {tables.length === 0 && (
                  <Link
                    href={`${basePath}/tables`}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                )}
                <div className="min-w-0">
                  <h1 className="text-sm md:text-base font-semibold truncate">{tableName}</h1>
                  <p className="text-xs text-muted-foreground truncate hidden sm:block">
                    {database && <span className="text-primary">{database}</span>}
                    {database && " / "}
                    {schema !== "public" && `${schema}.`}
                    {connectionName} · {totalRows.toLocaleString()} rows
                  </p>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {totalRows.toLocaleString()} rows
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                {canEdit && selectedRows.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Delete ({selectedRows.size})</span>
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setShowNewRowForm(true)}
                  >
                    <Plus className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">New Row</span>
                  </Button>
                )}
                <TabsList className="h-8">
                  <TabsTrigger value="data" className="text-xs px-2 md:px-3">
                    <Database className="h-3 w-3 md:mr-1" />
                    <span className="hidden md:inline">Data</span>
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="text-xs px-2 md:px-3">
                    <Code className="h-3 w-3 md:mr-1" />
                    <span className="hidden md:inline">Schema</span>
                  </TabsTrigger>
                  <TabsTrigger value="query" className="text-xs px-2 md:px-3">
                    <Play className="h-3 w-3 md:mr-1" />
                    <span className="hidden md:inline">Query</span>
                  </TabsTrigger>
                </TabsList>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <Download className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Export</span>
                    </Button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => exportData("csv")}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData("json")}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData("sql")}>
                    <FileCode className="mr-2 h-4 w-4" />
                    Export as SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Badge variant="outline" className="hidden sm:inline-flex">{userRole}</Badge>
            </div>
          </div>
        </div>

          {/* Data Tab */}
          <TabsContent value="data" className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden">
            {/* New Row Form */}
            {showNewRowForm && (
              <div className="border-b bg-muted/50 px-3 md:px-6 py-3 md:py-4 max-h-[50vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm md:text-base">Insert New Row</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewRowForm(false);
                      setNewRowData({});
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {columns.map((column) => (
                    <div key={column.name} className="space-y-1">
                      <label className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        {column.isPrimaryKey && <Key className="h-3 w-3 text-yellow-500" />}
                        <span className="truncate">{column.name}</span>
                        <span className={cn("text-xs", getTypeColor(column.type))}>
                          ({column.type})
                        </span>
                        {!column.nullable && <span className="text-red-400">*</span>}
                      </label>
                      <Input
                        size={1}
                        placeholder={column.defaultValue || (column.nullable ? "NULL" : "required")}
                        value={newRowData[column.name] || ""}
                        onChange={(e) =>
                          setNewRowData({ ...newRowData, [column.name]: e.target.value })
                        }
                        className="h-9 md:h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3 gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewRowForm(false);
                      setNewRowData({});
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={insertRow} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Insert
                  </Button>
                </div>
              </div>
            )}

            {/* Active Filter Indicator */}
            {activeFilter && (
              <div className="border-b bg-muted/50 px-3 md:px-4 py-1.5 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtered:</span>
                <Badge variant="secondary" className="gap-1 text-xs">
                  <span className="font-mono">{activeFilter.column}</span>
                  <span className="text-muted-foreground">contains</span>
                  <span className="font-mono">&quot;{activeFilter.value}&quot;</span>
                  <button
                    onClick={handleClearFilters}
                    className="ml-1 hover:bg-muted rounded-full"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </div>
            )}

            {/* Table */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="min-w-max">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    {canEdit && (
                      <TableHead className="w-8 px-2">
                        <Checkbox
                          checked={selectedRows.size === data.length && data.length > 0}
                          onCheckedChange={toggleAllRows}
                        />
                      </TableHead>
                    )}
                    {columns.map((column) => {
                      const isSearchActive = activeSearchColumn === column.name;
                      const hasActiveFilter = activeFilter?.column === column.name;

                      return (
                        <TableHead
                          key={column.name}
                          className="whitespace-nowrap px-2 py-1.5"
                        >
                          {isSearchActive ? (
                            // Inline search input
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Input
                                placeholder={`Search ${column.name}...`}
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSearch(column.name, searchValue);
                                    setActiveSearchColumn(null);
                                  } else if (e.key === "Escape") {
                                    setActiveSearchColumn(null);
                                  }
                                }}
                                className="h-6 w-[120px] text-xs"
                                autoFocus
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSearch(column.name, searchValue);
                                  setActiveSearchColumn(null);
                                }}
                              >
                                <Search className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveSearchColumn(null);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            // Normal column header with lens icon
                            <div className="flex items-center gap-1">
                              {column.isPrimaryKey && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Key className="h-3 w-3 text-yellow-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>Primary Key</TooltipContent>
                                </Tooltip>
                              )}
                              {column.isForeignKey && column.foreignKeyRef && (() => {
                                const refTable = column.foreignKeyRef.table;
                                const cacheKey = `${schema}.${refTable}`;
                                const preview = fkPreviewData[cacheKey];

                                return (
                                  <HoverCard
                                    openDelay={100}
                                    closeDelay={200}
                                    onOpenChange={(open) => {
                                      if (open) {
                                        fetchFkPreview(refTable, schema);
                                      }
                                    }}
                                  >
                                    <HoverCardTrigger asChild>
                                      <button className="hover:bg-blue-500/20 rounded p-0.5 transition-colors">
                                        <LinkIcon className="h-3 w-3 text-blue-500" />
                                      </button>
                                    </HoverCardTrigger>
                                    <HoverCardContent align="start" side="bottom" className="w-[700px] p-0">
                                      {/* Header */}
                                      <div className="flex items-center justify-between px-3 py-2 border-b bg-card">
                                        <div className="flex items-center gap-2">
                                          <LinkIcon className="h-4 w-4 text-blue-500" />
                                          <span className="font-semibold text-sm">{refTable}</span>
                                          <span className="text-xs text-muted-foreground font-mono">
                                            ({tableName}.{column.name} → {column.foreignKeyRef.column})
                                          </span>
                                        </div>
                                        <Link
                                          href={`${basePath}/tables/${schema}.${refTable}`}
                                          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                                        >
                                          Open
                                          <ExternalLink className="h-3 w-3" />
                                        </Link>
                                      </div>

                                      {/* Table Preview */}
                                      <ScrollArea className="max-h-[250px]">
                                        <div className="min-w-max">
                                          {preview?.loading ? (
                                            <div className="flex items-center justify-center py-12">
                                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                            </div>
                                          ) : preview?.error ? (
                                            <div className="flex items-center justify-center py-12 text-sm text-destructive">
                                              {preview.error}
                                            </div>
                                          ) : preview?.columns ? (
                                            <Table className="text-xs">
                                              <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm">
                                                <TableRow>
                                                  {preview.columns.map((col) => (
                                                    <TableHead
                                                      key={col.name}
                                                      className="px-2 py-1.5 h-auto whitespace-nowrap"
                                                    >
                                                      <div className="flex items-center gap-1">
                                                        {col.isPrimaryKey && (
                                                          <Key className="h-3 w-3 text-yellow-500" />
                                                        )}
                                                        {col.isForeignKey && (
                                                          <LinkIcon className="h-3 w-3 text-blue-500" />
                                                        )}
                                                        <span className="font-medium">{col.name}</span>
                                                        <span className={cn("text-[10px] opacity-50", getTypeColor(col.type))}>
                                                          {col.type}
                                                        </span>
                                                      </div>
                                                    </TableHead>
                                                  ))}
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {preview.rows.length > 0 ? (
                                                  preview.rows.map((row, i) => (
                                                    <TableRow key={i}>
                                                      {preview.columns.map((col) => {
                                                        const value = row[col.name];
                                                        const isNull = value === null;
                                                        const displayValue = isNull ? 'NULL' :
                                                          typeof value === 'object' ? JSON.stringify(value) : String(value);

                                                        return (
                                                          <TableCell
                                                            key={col.name}
                                                            className={cn(
                                                              "px-2 py-1.5 font-mono whitespace-nowrap",
                                                              isNull && "text-muted-foreground italic"
                                                            )}
                                                          >
                                                            <span className="truncate block max-w-[120px]" title={displayValue}>
                                                              {displayValue.length > 20 ? displayValue.slice(0, 20) + '…' : displayValue}
                                                            </span>
                                                          </TableCell>
                                                        );
                                                      })}
                                                    </TableRow>
                                                  ))
                                                ) : (
                                                  <TableRow>
                                                    <TableCell colSpan={preview.columns.length} className="py-6 text-center text-muted-foreground">
                                                      No records
                                                    </TableCell>
                                                  </TableRow>
                                                )}
                                              </TableBody>
                                            </Table>
                                          ) : (
                                            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                                              Loading...
                                            </div>
                                          )}
                                        </div>
                                        <ScrollBar orientation="horizontal" />
                                      </ScrollArea>
                                    </HoverCardContent>
                                  </HoverCard>
                                );
                              })()}
                              <span
                                className="font-medium cursor-pointer hover:underline"
                                onClick={() => handleSort(column.name)}
                              >
                                {column.name}
                              </span>
                              <span className={cn("text-[10px] opacity-60", getTypeColor(column.type))}>
                                {column.type}
                              </span>
                              {!column.nullable && (
                                <span className="text-[10px] text-red-400">*</span>
                              )}
                              {sortColumn === column.name && (
                                <span onClick={() => handleSort(column.name)} className="cursor-pointer">
                                  {sortDirection === "asc" ? (
                                    <ArrowUp className="h-3 w-3" />
                                  ) : (
                                    <ArrowDown className="h-3 w-3" />
                                  )}
                                </span>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => toggleColumnSearch(column.name, e)}
                                    className={cn(
                                      "ml-1 p-0.5 rounded hover:bg-accent transition-colors",
                                      hasActiveFilter && "text-primary bg-primary/10"
                                    )}
                                  >
                                    <Search className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Search in {column.name}</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, rowIndex) => (
                    <TableRow
                      key={rowIndex}
                      className={cn(selectedRows.has(rowIndex) && "bg-muted/50")}
                    >
                      {canEdit && (
                        <TableCell className="w-8 px-2">
                          <Checkbox
                            checked={selectedRows.has(rowIndex)}
                            onCheckedChange={() => toggleRowSelection(rowIndex)}
                          />
                        </TableCell>
                      )}
                      {columns.map((column) => {
                        const value = row[column.name];
                        const displayValue = formatCellValue(value);
                        const cellId = `${rowIndex}-${column.name}`;
                        const isNull = value === null;
                        const isTruncated = displayValue.length > 50;
                        const isEditing =
                          editingCell?.rowIndex === rowIndex &&
                          editingCell?.columnName === column.name;

                        return (
                          <TableCell
                            key={column.name}
                            className={cn(
                              "font-mono whitespace-nowrap group relative px-2 py-1 h-8",
                              isNull && "text-muted-foreground italic",
                              !isEditing && "cursor-pointer hover:bg-accent/50",
                              copiedCell === cellId && "bg-green-500/10"
                            )}
                            onClick={(e) => {
                              // Don't copy if editing or if it might be a double-click
                              if (isEditing) return;

                              // Clear any pending single-click timeout
                              if (clickTimeoutRef.current) {
                                clearTimeout(clickTimeoutRef.current);
                                clickTimeoutRef.current = null;
                              }

                              // Only trigger copy on single click after delay
                              clickTimeoutRef.current = setTimeout(() => {
                                copyToClipboard(displayValue, cellId);
                                toast.success("Copied to clipboard", { duration: 1500 });
                                clickTimeoutRef.current = null;
                              }, 250);
                            }}
                            onDoubleClick={() => {
                              // Cancel any pending single-click (copy)
                              if (clickTimeoutRef.current) {
                                clearTimeout(clickTimeoutRef.current);
                                clickTimeoutRef.current = null;
                              }
                              if (canEdit) startEditing(rowIndex, column.name, value);
                            }}
                          >
                            {isEditing ? (
                              <div className="flex items-center gap-1 h-full" onClick={(e) => e.stopPropagation()}>
                                {Array.isArray(column.enumValues) && column.enumValues.length > 0 ? (
                                  <Select
                                    value={editingCell.currentValue}
                                    onValueChange={(val) => saveEdit(val)}
                                    disabled={saving}
                                  >
                                    <SelectTrigger className="h-6 text-xs font-mono border-primary" onClick={(e) => e.stopPropagation()}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {column.nullable && (
                                        <SelectItem value="NULL">NULL</SelectItem>
                                      )}
                                      {column.enumValues.map((val) => (
                                        <SelectItem key={val} value={val}>
                                          {val}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : column.type === "bool" || column.type === "boolean" ? (
                                  <Select
                                    value={editingCell.currentValue.toLowerCase()}
                                    onValueChange={(val) => saveEdit(val)}
                                    disabled={saving}
                                  >
                                    <SelectTrigger className="h-6 text-xs font-mono border-primary" onClick={(e) => e.stopPropagation()}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {column.nullable && (
                                        <SelectItem value="null">NULL</SelectItem>
                                      )}
                                      <SelectItem value="true">true</SelectItem>
                                      <SelectItem value="false">false</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    ref={inputRef}
                                    defaultValue={editingCell.currentValue}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        saveEdit((e.target as HTMLInputElement).value);
                                      } else if (e.key === "Escape") {
                                        cancelEditing();
                                      }
                                    }}
                                    onBlur={(e) => saveEdit(e.target.value)}
                                    className="h-6 text-xs font-mono"
                                    disabled={saving}
                                    autoFocus
                                  />
                                )}
                                {saving && (
                                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-1 h-full">
                                <span className="truncate max-w-[200px]">
                                  {isTruncated
                                    ? `${displayValue.slice(0, 50)}...`
                                    : displayValue}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (clickTimeoutRef.current) {
                                          clearTimeout(clickTimeoutRef.current);
                                          clickTimeoutRef.current = null;
                                        }
                                      }}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-accent"
                                    >
                                      <MoreVertical className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(displayValue, cellId);
                                      toast.success("Copied to clipboard");
                                    }}>
                                      <Copy className="h-3.5 w-3.5 mr-2" />
                                      Copy
                                    </DropdownMenuItem>
                                    {canEdit && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={(e) => {
                                          e.stopPropagation();
                                          startEditing(rowIndex, column.name, value);
                                        }}>
                                          <Edit className="h-3.5 w-3.5 mr-2" />
                                          Edit
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {data.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length + (canEdit ? 1 : 0)}
                        className="h-32 text-center text-muted-foreground"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <span>{activeFilter ? "No matching results" : "No data found"}</span>
                          {activeFilter && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleClearFilters}
                            >
                              Clear filter
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Pagination */}
            <div className="border-t bg-card px-3 md:px-6 py-2 md:py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs md:text-sm text-muted-foreground min-w-0">
                  <span className="hidden lg:inline mr-4">
                    {canEdit && "Double-click to edit • N: New row • D: Delete"}
                  </span>
                  <span className="hidden sm:inline">
                    Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalRows)} of{" "}
                    {totalRows.toLocaleString()} rows
                  </span>
                  <span className="sm:hidden">
                    {page}/{totalPages}
                  </span>
                </div>
                <div className="flex items-center gap-1 md:gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 hidden sm:flex"
                    onClick={() => handlePageChange(1)}
                    disabled={page === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs md:text-sm px-1 md:px-2 min-w-[60px] text-center hidden sm:inline">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 hidden sm:flex"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={page === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Schema Tab */}
          <TabsContent value="schema" className="flex-1 m-0 overflow-auto">
            {loadingSchema ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : schemaInfo ? (
              <div className="p-6 space-y-6">
                {/* DDL */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">DDL (CREATE TABLE)</h3>
                    <Button variant="ghost" size="sm" onClick={copyDDL}>
                      {copiedDDL ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                    {schemaInfo.ddl}
                  </pre>
                </div>

                {/* Columns */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Columns ({schemaInfo.columns.length})</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Nullable</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead>Constraints</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schemaInfo.columns.map((col) => (
                          <TableRow key={col.name}>
                            <TableCell className="font-mono">{col.name}</TableCell>
                            <TableCell className={cn("font-mono", getTypeColor(col.type))}>
                              {col.type}
                            </TableCell>
                            <TableCell>{col.nullable ? "Yes" : "No"}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {col.defaultValue || "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {col.isPrimaryKey && (
                                  <Badge variant="secondary" className="text-xs">
                                    <Key className="h-3 w-3 mr-1" />
                                    PK
                                  </Badge>
                                )}
                                {col.isForeignKey && (
                                  <Badge variant="secondary" className="text-xs">
                                    <LinkIcon className="h-3 w-3 mr-1" />
                                    FK
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Indexes */}
                {schemaInfo.indexes.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Indexes ({schemaInfo.indexes.length})</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Columns</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Unique</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schemaInfo.indexes.map((idx) => (
                            <TableRow key={idx.name}>
                              <TableCell className="font-mono">{idx.name}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {Array.isArray(idx.columns) ? idx.columns.join(", ") : String(idx.columns || '')}
                              </TableCell>
                              <TableCell>{idx.type}</TableCell>
                              <TableCell>{idx.unique ? "Yes" : "No"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Triggers */}
                {schemaInfo.triggers.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Triggers ({schemaInfo.triggers.length})</h3>
                    <div className="space-y-2">
                      {schemaInfo.triggers.map((trigger) => (
                        <div key={trigger.name} className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono font-medium">{trigger.name}</span>
                            <Badge variant="outline">{trigger.timing}</Badge>
                            <Badge variant="outline">{trigger.event}</Badge>
                          </div>
                          <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
                            {trigger.definition}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </TabsContent>

          {/* Query Tab */}
          <TabsContent value="query" className="flex-1 m-0 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              {/* SQL Editor */}
              <div className="flex-1 p-3 md:p-4 border-b min-h-0">
                <SqlEditor
                  value={sql}
                  onChange={setSql}
                  onExecute={executeQuery}
                  connectionId={connectionId}
                  database={database}
                  readOnly={queryLoading}
                  minHeight="200px"
                />
              </div>

              {/* Execute Button */}
              <div className="border-b bg-card p-3 md:p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground hidden lg:block">
                    Press <kbd className="rounded bg-muted px-1">Cmd</kbd> +{" "}
                    <kbd className="rounded bg-muted px-1">Enter</kbd> to execute
                  </p>
                  <Button
                    onClick={executeQuery}
                    disabled={queryLoading || !sql.trim()}
                    className="ml-auto"
                  >
                    {queryLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Execute Query
                  </Button>
                </div>
              </div>

              {/* Query Results */}
              <div className="flex-1 min-h-0 overflow-auto">
                {queryError && (
                  <div className="flex items-center gap-2 bg-destructive/10 p-3 md:p-4 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{queryError}</span>
                  </div>
                )}

                {queryResult && (
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between border-b bg-card px-3 md:px-4 py-2">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{queryResult.rowCount} rows</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {queryResult.executionTime}ms
                        </span>
                      </div>
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="min-w-max">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card">
                            <TableRow>
                              {queryResult.columns.map((column) => (
                                <TableHead key={column} className="whitespace-nowrap text-xs md:text-sm">
                                  {column}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {queryResult.rows.map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                {queryResult.columns.map((column) => {
                                  const value = row[column];
                                  const displayValue = value === null ? "NULL" :
                                    typeof value === "object" ? JSON.stringify(value) :
                                    String(value);

                                  return (
                                    <TableCell
                                      key={column}
                                      className={cn(
                                        "font-mono text-xs md:text-sm whitespace-nowrap max-w-[300px]",
                                        value === null && "text-muted-foreground italic"
                                      )}
                                    >
                                      <span className="truncate block">{displayValue}</span>
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                  </div>
                )}

                {!queryResult && !queryError && (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Execute a query to see results
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedRows.size} row(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. The selected rows will be permanently
                deleted from the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteSelectedRows}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
