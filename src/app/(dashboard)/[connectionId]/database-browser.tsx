"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { Label } from "@/components/ui/label";
import {
  Database,
  Search,
  AlertCircle,
  Server,
  Copy,
  Check,
  Loader2,
  GitBranch,
  Trash2,
  Plus,
  Clock,
  User,
  ExternalLink,
  ChevronDown,
  Settings,
  Code,
  Download,
} from "lucide-react";
import { EditConnectionButton } from "@/components/edit-connection-button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface DatabaseInfo {
  name: string;
  size: string;
  owner: string;
}

interface BranchInfo {
  id: string;
  sourceDb: string;
  description: string | null;
  createdAt: Date;
  createdBy: { name: string | null; email: string };
}

interface ConnectionData {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  dbType: string;
  environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  color: string;
  description: string | null;
  pgbouncerUrl: string | null;
  publicHost: string | null;
  publicPort: number | null;
}

interface DatabaseBrowserProps {
  connectionId: string;
  connectionName: string;
  connectionData: ConnectionData;
  currentDatabase: string;
  databases: DatabaseInfo[];
  branches: Record<string, BranchInfo>;
  error: string | null;
  userRole: string;
  isAdmin: boolean;
}

export function DatabaseBrowser({
  connectionId,
  connectionName,
  connectionData,
  currentDatabase,
  databases,
  branches,
  error,
  userRole,
  isAdmin,
}: DatabaseBrowserProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expandedDb, setExpandedDb] = useState<string | null>(null);

  // Branch dialog state
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchSource, setBranchSource] = useState<string | null>(null);
  const [branchSuffix, setBranchSuffix] = useState("dev");
  const [branchMode, setBranchMode] = useState<"full" | "schema">("schema");
  const [creating, setCreating] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [sourceTables, setSourceTables] = useState<{
    schema: string;
    name: string;
    row_count: number;
    size: string;
  }[]>([]);
  const [tableOptions, setTableOptions] = useState<{
    [key: string]: { include: boolean; rowLimit: string };
  }>({});

  // Result dialog state
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [pgbouncerConnectionString, setPgbouncerConnectionString] = useState<string | null>(null);
  const [devConnectionString, setDevConnectionString] = useState<string | null>(null);
  const [copied, setCopied] = useState<"direct" | "pgbouncer" | "dev" | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<{ id: string; name: string; sourceDb: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Branch info modal state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [selectedDbForBranches, setSelectedDbForBranches] = useState<typeof databaseTree[0] | null>(null);

  // Create database dialog state
  const [createDbDialogOpen, setCreateDbDialogOpen] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [creatingDb, setCreatingDb] = useState(false);

  // Delete database dialog state
  const [deleteDbDialogOpen, setDeleteDbDialogOpen] = useState(false);
  const [dbToDelete, setDbToDelete] = useState<string | null>(null);
  const [deletingDb, setDeletingDb] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const isClickHouse = connectionData.dbType === "clickhouse";
  const canCreateBranch = !isClickHouse && (userRole === "ADMIN" || userRole === "DEVELOPER");
  const canManageDb = userRole === "ADMIN" || userRole === "DEVELOPER";

  // Build hierarchical structure: main databases with their branches
  const databaseTree = useMemo(() => {
    // Get all branch names from records
    const branchNames = new Set(Object.keys(branches));

    // Also detect branches by naming pattern: {parent}_{suffix}
    // Build a map of potential parent -> children based on naming
    const namingPatternChildren = new Map<string, string[]>();

    for (const db of databases) {
      // Check if this db name follows {parent}_{suffix} pattern
      const underscoreIdx = db.name.lastIndexOf('_');
      if (underscoreIdx > 0) {
        const potentialParent = db.name.substring(0, underscoreIdx);
        // Only consider it a child if the parent database exists
        if (databases.some(d => d.name === potentialParent)) {
          if (!namingPatternChildren.has(potentialParent)) {
            namingPatternChildren.set(potentialParent, []);
          }
          namingPatternChildren.get(potentialParent)!.push(db.name);
        }
      }
    }

    // Combine: a database is a branch if it has a branch record OR matches naming pattern
    const allBranchNames = new Set([
      ...branchNames,
      ...Array.from(namingPatternChildren.values()).flat()
    ]);

    // Main databases are those that are NOT branches themselves
    const mainDatabases = databases.filter(db => !allBranchNames.has(db.name));

    // Build tree structure
    return mainDatabases.map(db => {
      // Find branches from records
      const recordBranches = Object.entries(branches)
        .filter(([, info]) => info.sourceDb === db.name)
        .map(([name, info]) => {
          const dbInfo = databases.find(d => d.name === name);
          return {
            name,
            ...info,
            size: dbInfo?.size || "Unknown",
            hasRecord: true,
          };
        });

      // Find branches from naming pattern (that don't have records)
      const patternBranches = (namingPatternChildren.get(db.name) || [])
        .filter(name => !branchNames.has(name)) // Only those without records
        .map(name => {
          const dbInfo = databases.find(d => d.name === name);
          return {
            name,
            id: `pattern-${name}`,
            sourceDb: db.name,
            description: null,
            createdAt: new Date(),
            createdBy: { name: null, email: 'unknown' },
            size: dbInfo?.size || "Unknown",
            hasRecord: false,
          };
        });

      const dbBranches = [...recordBranches, ...patternBranches]
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        ...db,
        branches: dbBranches,
      };
    });
  }, [databases, branches]);

  // Get total branch count
  const totalBranches = useMemo(() => {
    return Object.keys(branches).length;
  }, [branches]);

  const openBranchDialog = async (dbName: string) => {
    setBranchSource(dbName);
    setBranchSuffix("dev");
    setBranchMode("full"); // Default to full copy with data
    setSourceTables([]);
    setTableOptions({});
    setBranchDialogOpen(true);
    // Load tables for full mode
    loadSourceTables(dbName);
  };

  // Compute full branch name
  const fullBranchName = branchSource && branchSuffix ? `${branchSource}_${branchSuffix}` : "";

  const loadSourceTables = async (dbName: string) => {
    setLoadingTables(true);
    try {
      const response = await fetch(
        `/api/connections/${connectionId}/databases/${dbName}/tables`
      );
      if (response.ok) {
        const data = await response.json();
        setSourceTables(data.tables);
        const options: { [key: string]: { include: boolean; rowLimit: string } } = {};
        for (const table of data.tables) {
          const key = `${table.schema}.${table.name}`;
          options[key] = { include: true, rowLimit: "" };
        }
        setTableOptions(options);
      }
    } catch {
      toast.error("Failed to load tables");
    } finally {
      setLoadingTables(false);
    }
  };

  const handleModeChange = (newMode: "full" | "schema") => {
    setBranchMode(newMode);
    if (newMode === "full" && branchSource && sourceTables.length === 0) {
      loadSourceTables(branchSource);
    }
  };

  const toggleAllTables = (include: boolean) => {
    const newOptions = { ...tableOptions };
    for (const key of Object.keys(newOptions)) {
      newOptions[key] = { ...newOptions[key], include };
    }
    setTableOptions(newOptions);
  };

  const handleCreateBranch = async () => {
    if (!branchSource || !branchSuffix || !fullBranchName) return;

    setCreating(true);
    try {
      // Only send tableOptions if user customized the selection (excluded tables or set row limits)
      const hasCustomOptions = Object.values(tableOptions).some(
        opt => !opt.include || opt.rowLimit !== ""
      );
      const apiTableOptions = branchMode === "full" && hasCustomOptions
        ? Object.entries(tableOptions).map(([key, value]) => {
            const [schema, table] = key.split(".");
            return {
              schema,
              table,
              include: value.include,
              rowLimit: value.rowLimit ? parseInt(value.rowLimit) : null,
            };
          })
        : undefined;

      const response = await fetch(`/api/connections/${connectionId}/databases/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDatabase: branchSource,
          newDatabaseName: fullBranchName,
          mode: branchMode,
          tableOptions: apiTableOptions,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to create branch");
        return;
      }

      toast.success(`Branch "${fullBranchName}" created`);
      setBranchDialogOpen(false);
      setNewBranchName(fullBranchName);
      setConnectionString(result.connectionString);
      setPgbouncerConnectionString(result.pgbouncerConnectionString || null);
      setDevConnectionString(result.devConnectionString || null);
      setResultDialogOpen(true);
      // Auto-expand the source database to show the new branch
      setExpandedDb(branchSource);
      router.refresh();
    } catch {
      toast.error("Failed to create branch");
    } finally {
      setCreating(false);
    }
  };

  const copyConnectionString = async (type: "direct" | "pgbouncer" | "dev") => {
    let str: string | null = null;
    if (type === "pgbouncer") {
      str = pgbouncerConnectionString;
    } else if (type === "dev") {
      str = devConnectionString;
    } else {
      str = connectionString;
    }
    if (!str) return;
    await navigator.clipboard.writeText(str);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
    const labels = { pgbouncer: "PgBouncer", dev: "Dev", direct: "Direct" };
    toast.success(`${labels[type]} URL copied!`);
  };

  const copyBranchConnectionString = async (branchId: string, dbName: string) => {
    try {
      const response = await fetch(`/api/connections/${connectionId}/branches/${branchId}/connection-string`);
      if (!response.ok) {
        throw new Error("Failed to get connection string");
      }
      const data = await response.json();
      await navigator.clipboard.writeText(data.connectionString);
      toast.success("Connection string copied!");
    } catch {
      toast.error("Failed to copy connection string");
    }
  };

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return;

    setDeleting(true);
    try {
      // Use different API based on whether branch has a record
      const isPatternBranch = branchToDelete.id.startsWith('pattern-');
      const url = isPatternBranch
        ? `/api/connections/${connectionId}/databases/${branchToDelete.name}`
        : `/api/connections/${connectionId}/branches/${branchToDelete.id}`;

      const response = await fetch(url, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to delete branch");
        return;
      }

      toast.success(result.message);
      setDeleteDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("Failed to delete branch");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateDatabase = async () => {
    if (!newDbName) return;

    setCreatingDb(true);
    try {
      const response = await fetch(`/api/connections/${connectionId}/databases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDbName }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to create database");
        return;
      }

      toast.success(result.message);
      setCreateDbDialogOpen(false);
      setNewDbName("");
      router.refresh();
    } catch {
      toast.error("Failed to create database");
    } finally {
      setCreatingDb(false);
    }
  };

  const handleDeleteDatabase = async () => {
    if (!dbToDelete) return;

    setDeletingDb(true);
    try {
      const response = await fetch(`/api/connections/${connectionId}/databases/${dbToDelete}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || "Failed to delete database");
        return;
      }

      toast.success(result.message);
      setDeleteDbDialogOpen(false);
      setDbToDelete(null);
      router.refresh();
    } catch {
      toast.error("Failed to delete database");
    } finally {
      setDeletingDb(false);
    }
  };

  const filteredTree = useMemo(() => {
    if (!search) return databaseTree;

    const searchLower = search.toLowerCase();
    return databaseTree
      .map(db => {
        // Filter branches by search
        const matchingBranches = db.branches.filter(b =>
          b.name.toLowerCase().includes(searchLower)
        );
        // Include if db matches or has matching branches
        const dbMatches = db.name.toLowerCase().includes(searchLower);
        if (dbMatches || matchingBranches.length > 0) {
          return {
            ...db,
            branches: dbMatches ? db.branches : matchingBranches,
          };
        }
        return null;
      })
      .filter(Boolean) as typeof databaseTree;
  }, [databaseTree, search]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Connection Error</h2>
          <p className="text-sm text-muted-foreground max-w-md mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-card px-3 md:px-6 py-3 md:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div className="p-2 md:p-2.5 rounded-lg bg-primary/10 shrink-0">
              <Server className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-semibold truncate">{connectionName}</h1>
              <div className="flex items-center gap-2 md:gap-3 mt-0.5 md:mt-1">
                <span className="text-xs md:text-sm text-muted-foreground">{databaseTree.length} databases</span>
                {totalBranches > 0 && (
                  <span className="text-xs md:text-sm text-purple-500">{totalBranches} branches</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <Badge variant="outline" className="hidden sm:inline-flex">{userRole}</Badge>
            {isAdmin && (
              <EditConnectionButton
                connection={connectionData}
                trigger={
                  <Button variant="outline" size="sm" className="h-8 md:h-9">
                    <Settings className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Settings</span>
                  </Button>
                }
              />
            )}
            {canManageDb && (
              <Button size="sm" className="h-8 md:h-9" onClick={() => setCreateDbDialogOpen(true)}>
                <Plus className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">New Database</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="border-b bg-card px-3 md:px-6 py-2 md:py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search databases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Database grid with branches */}
      <div className="flex-1 min-h-0 overflow-auto p-3 md:p-4">
        {filteredTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              {search ? "No databases match your search" : "No databases found"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredTree.map((db) => (
              <div key={db.name} className="border bg-card overflow-hidden">
                {/* Main database card */}
                <Link href={`/${connectionId}/db/${db.name}/tables`} className="block">
                  <div className="p-3 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-medium text-sm truncate">{db.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">{db.size}</p>
                  </div>
                </Link>

                {/* Actions row */}
                <div className="border-t flex items-center justify-between px-2 py-1.5 bg-muted/20">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      asChild
                    >
                      <Link href={`/${connectionId}/db/${db.name}/query`}>
                        <Code className="h-3 w-3 mr-1" />
                        SQL
                      </Link>
                    </Button>
                    {canCreateBranch && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => openBranchDialog(db.name)}
                      >
                        <GitBranch className="h-3 w-3 mr-1" />
                        Branch
                      </Button>
                    )}
                    {db.branches.length > 0 && (
                      <button
                        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 px-2 py-1 hover:bg-purple-500/10"
                        onClick={() => {
                          setSelectedDbForBranches(db);
                          setBranchModalOpen(true);
                        }}
                      >
                        <GitBranch className="h-3 w-3" />
                        {db.branches.length}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          title="Copy connection string"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {db.branches.length > 0 && (
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            {db.name} (main)
                          </DropdownMenuLabel>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            window.open(`/api/connections/${connectionId}/databases/${db.name}/export`, "_blank");
                            toast.success("Database export started");
                          }}
                        >
                          <Download className="h-3 w-3 mr-2" />
                          Export Backup
                        </DropdownMenuItem>
                        {!isClickHouse && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/connections/${connectionId}/databases/${db.name}/connection-string`);
                                if (res.ok) {
                                  const data = await res.json();
                                  if (data.pgbouncerConnectionString) {
                                    await navigator.clipboard.writeText(data.pgbouncerConnectionString);
                                    toast.success("PgBouncer URL copied!");
                                  } else {
                                    toast.error("PgBouncer not configured for this connection");
                                  }
                                } else {
                                  toast.error("Failed to get connection string");
                                }
                              } catch {
                                toast.error("Failed to copy connection string");
                              }
                            }}
                          >
                            <Copy className="h-3 w-3 mr-2" />
                            Copy for App
                          </DropdownMenuItem>
                        )}
                        {!isClickHouse && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/connections/${connectionId}/databases/${db.name}/connection-string`);
                                if (res.ok) {
                                  const data = await res.json();
                                  if (data.devConnectionString) {
                                    await navigator.clipboard.writeText(data.devConnectionString);
                                    toast.success("Dev URL copied!");
                                  } else {
                                    toast.error("Public host not configured for this connection");
                                  }
                                } else {
                                  toast.error("Failed to get connection string");
                                }
                              } catch {
                                toast.error("Failed to copy connection string");
                              }
                            }}
                          >
                            <Database className="h-3 w-3 mr-2" />
                            Copy Dev URL
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/connections/${connectionId}/databases/${db.name}/connection-string`);
                              if (res.ok) {
                                const data = await res.json();
                                await navigator.clipboard.writeText(data.connectionString);
                                toast.success("Direct connection string copied!");
                              } else {
                                toast.error("Failed to get connection string");
                              }
                            } catch {
                              toast.error("Failed to copy connection string");
                            }
                          }}
                        >
                          <Database className="h-3 w-3 mr-2" />
                          Copy Direct URL
                        </DropdownMenuItem>
                        {db.branches.filter(b => b.hasRecord).map((branch) => {
                          const branchSuffix = branch.name.substring(db.name.length + 1);
                          return (
                            <div key={branch.id}>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1">
                                <GitBranch className="h-3 w-3" />
                                {branchSuffix}
                              </DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/connections/${connectionId}/branches/${branch.id}/connection-string`);
                                    if (!res.ok) throw new Error();
                                    const data = await res.json();
                                    if (data.pgbouncerConnectionString) {
                                      await navigator.clipboard.writeText(data.pgbouncerConnectionString);
                                      toast.success(`PgBouncer URL copied for ${branchSuffix}!`);
                                    } else {
                                      toast.error("PgBouncer not configured for this connection");
                                    }
                                  } catch {
                                    toast.error("Failed to copy connection string");
                                  }
                                }}
                              >
                                <Copy className="h-3 w-3 mr-2" />
                                Copy for App
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/connections/${connectionId}/branches/${branch.id}/connection-string`);
                                    if (!res.ok) throw new Error();
                                    const data = await res.json();
                                    if (data.devConnectionString) {
                                      await navigator.clipboard.writeText(data.devConnectionString);
                                      toast.success(`Dev URL copied for ${branchSuffix}!`);
                                    } else {
                                      toast.error("Public host not configured for this connection");
                                    }
                                  } catch {
                                    toast.error("Failed to copy connection string");
                                  }
                                }}
                              >
                                <Database className="h-3 w-3 mr-2" />
                                Copy Dev URL
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/connections/${connectionId}/branches/${branch.id}/connection-string`);
                                    if (!res.ok) throw new Error();
                                    const data = await res.json();
                                    await navigator.clipboard.writeText(data.connectionString);
                                    toast.success(`Direct URL copied for ${branchSuffix}!`);
                                  } catch {
                                    toast.error("Failed to copy connection string");
                                  }
                                }}
                              >
                                <Database className="h-3 w-3 mr-2" />
                                Copy Direct URL
                              </DropdownMenuItem>
                            </div>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {canManageDb && db.name !== currentDatabase && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setDbToDelete(db.name);
                          setDeleteDbDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Branch Dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-purple-500" />
              Create Branch
            </DialogTitle>
            <DialogDescription>
              Create an isolated copy of a database for development or testing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Source database selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Source Database</Label>
              <Select value={branchSource || ""} onValueChange={setBranchSource}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select a database to branch from" />
                </SelectTrigger>
                <SelectContent className="py-2">
                  {databases.map((db) => (
                    <SelectItem key={db.name} value={db.name} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {branches[db.name] ? (
                          <GitBranch className="h-4 w-4 text-purple-500" />
                        ) : (
                          <Database className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{db.name}</span>
                        <span className="text-muted-foreground text-xs ml-auto">({db.size})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch name */}
            <div className="space-y-2">
              <Label htmlFor="branch-suffix" className="text-sm font-medium">Branch Name</Label>
              <div className="flex items-center gap-0">
                <div className="flex h-10 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                  {branchSource || "database"}_
                </div>
                <Input
                  id="branch-suffix"
                  value={branchSuffix}
                  onChange={(e) => setBranchSuffix(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="dev"
                  className="rounded-l-none h-10"
                />
              </div>
              {fullBranchName && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Database will be created as: <code className="font-mono font-medium text-foreground bg-muted px-1.5 py-0.5 rounded">{fullBranchName}</code>
                </p>
              )}
            </div>

            {/* Branch type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Clone Mode</Label>
              <Select value={branchMode} onValueChange={(v) => handleModeChange(v as "full" | "schema")}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="py-2">
                  <SelectItem value="schema" className="py-3 px-3">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">Schema Only</span>
                      <span className="text-xs text-muted-foreground">
                        Empty tables, faster to create
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full" className="py-3 px-3">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-medium">Full Clone</span>
                      <span className="text-xs text-muted-foreground">
                        Copy all data from source
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {branchMode === "full" && (
              <>
                <div className="rounded-lg bg-muted/50 border p-3 text-sm text-muted-foreground">
                  <p>Data will be copied table by table. Large databases may take a few minutes.</p>
                </div>

                {/* Table selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Tables to Include</Label>
                    {sourceTables.length > 0 && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => toggleAllTables(true)}
                        >
                          All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => toggleAllTables(false)}
                        >
                          None
                        </Button>
                      </div>
                    )}
                  </div>

                  {loadingTables ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : sourceTables.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg">
                      {branchSource ? "No tables found" : "Select a source database"}
                    </div>
                  ) : (
                    <div className="border rounded-lg max-h-[200px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left p-2 font-medium">Table</th>
                            <th className="text-right p-2 font-medium w-20">Rows</th>
                            <th className="text-center p-2 font-medium w-24">Limit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceTables.map((table) => {
                            const key = `${table.schema}.${table.name}`;
                            const option = tableOptions[key] || { include: true, rowLimit: "" };
                            return (
                              <tr
                                key={key}
                                className={cn(
                                  "border-t cursor-pointer hover:bg-muted/30",
                                  !option.include && "opacity-50"
                                )}
                                onClick={() => {
                                  setTableOptions((prev) => ({
                                    ...prev,
                                    [key]: { ...option, include: !option.include },
                                  }));
                                }}
                              >
                                <td className="p-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={option.include}
                                      onChange={() => {}}
                                      className="rounded"
                                    />
                                    <span className="truncate">{table.name}</span>
                                  </div>
                                </td>
                                <td className="p-2 text-right text-muted-foreground">
                                  {table.row_count.toLocaleString()}
                                </td>
                                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    type="number"
                                    placeholder="All"
                                    value={option.rowLimit}
                                    onChange={(e) => {
                                      setTableOptions((prev) => ({
                                        ...prev,
                                        [key]: { ...option, rowLimit: e.target.value },
                                      }));
                                    }}
                                    disabled={!option.include}
                                    className="h-7 text-xs text-center"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateBranch} disabled={creating || !branchSuffix || !branchSource}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <GitBranch className="mr-2 h-4 w-4" />
                  Create Branch
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Created Dialog */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              Branch Created
            </DialogTitle>
            <DialogDescription>
              Your branch &quot;{newBranchName}&quot; is ready to use.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* PgBouncer URL (for apps) - shown first if available */}
            {pgbouncerConnectionString && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                    For Apps
                  </span>
                  PgBouncer Connection
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={pgbouncerConnectionString}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyConnectionString("pgbouncer")}>
                    {copied === "pgbouncer" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this URL in your application&apos;s DATABASE_URL.
                </p>
              </div>
            )}

            {/* Dev URL (for local development) - only shown if publicHost is configured */}
            {devConnectionString && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600">
                    Local Dev
                  </span>
                  Dev Connection
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={devConnectionString}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" size="icon" onClick={() => copyConnectionString("dev")}>
                    {copied === "dev" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this for local development (public IP, SSL disabled).
                </p>
              </div>
            )}

            {/* Direct URL (for admin/migrations) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                  Admin
                </span>
                Direct Connection
              </Label>
              <div className="flex gap-2">
                <Input
                  value={connectionString}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button variant="outline" size="icon" onClick={() => copyConnectionString("direct")}>
                  {copied === "direct" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this for migrations and admin tasks.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResultDialogOpen(false)}>
              Close
            </Button>
            <Link href={`/${connectionId}/db/${newBranchName}/tables`}>
              <Button>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Branch
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Branch
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the branch and all its data.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm text-destructive font-medium mb-2">
                You are about to delete:
              </p>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-destructive" />
                <span className="font-mono text-sm">{branchToDelete?.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Branched from {branchToDelete?.sourceDb}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteBranch} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Branch
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Info Modal */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              {selectedDbForBranches?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedDbForBranches?.branches.length} branch{selectedDbForBranches?.branches.length !== 1 ? 'es' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[300px] overflow-auto">
            {selectedDbForBranches?.branches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-accent/30"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <GitBranch className="h-4 w-4 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <Link
                      href={`/${connectionId}/db/${branch.name}/tables`}
                      className="font-medium text-sm hover:underline block truncate"
                      onClick={() => setBranchModalOpen(false)}
                    >
                      {branch.name}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{branch.size}</span>
                      {branch.hasRecord && (
                        <>
                          <span>•</span>
                          <span>{formatDistanceToNow(new Date(branch.createdAt), { addSuffix: true })}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {branch.hasRecord && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copy connection URL"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/connections/${connectionId}/branches/${branch.id}/connection-string`);
                              if (!response.ok) throw new Error("Failed to get connection string");
                              const data = await response.json();
                              if (data.pgbouncerConnectionString) {
                                await navigator.clipboard.writeText(data.pgbouncerConnectionString);
                                toast.success("PgBouncer URL copied!");
                              } else {
                                toast.error("PgBouncer not configured for this connection");
                              }
                            } catch {
                              toast.error("Failed to copy connection string");
                            }
                          }}
                        >
                          <Copy className="h-3 w-3 mr-2" />
                          Copy for App
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/connections/${connectionId}/branches/${branch.id}/connection-string`);
                              if (!response.ok) throw new Error("Failed to get connection string");
                              const data = await response.json();
                              if (data.devConnectionString) {
                                await navigator.clipboard.writeText(data.devConnectionString);
                                toast.success("Dev URL copied!");
                              } else {
                                toast.error("Public host not configured for this connection");
                              }
                            } catch {
                              toast.error("Failed to copy connection string");
                            }
                          }}
                        >
                          <Database className="h-3 w-3 mr-2" />
                          Copy Dev URL
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const response = await fetch(`/api/connections/${connectionId}/branches/${branch.id}/connection-string`);
                              if (!response.ok) throw new Error("Failed to get connection string");
                              const data = await response.json();
                              await navigator.clipboard.writeText(data.connectionString);
                              toast.success("Direct connection string copied!");
                            } catch {
                              toast.error("Failed to copy connection string");
                            }
                          }}
                        >
                          <Database className="h-3 w-3 mr-2" />
                          Copy Direct URL
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Link href={`/${connectionId}/db/${branch.name}/query`} onClick={() => setBranchModalOpen(false)}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="SQL Query">
                      <Code className="h-3 w-3" />
                    </Button>
                  </Link>
                  <Link href={`/${connectionId}/db/${branch.name}/tables`} onClick={() => setBranchModalOpen(false)}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Open branch">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      setBranchToDelete({ id: branch.id, name: branch.name, sourceDb: branch.sourceDb });
                      setBranchModalOpen(false);
                      setDeleteDialogOpen(true);
                    }}
                    title="Delete branch"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setBranchModalOpen(false)}>
              Close
            </Button>
            {canCreateBranch && selectedDbForBranches && (
              <Button size="sm" onClick={() => {
                setBranchModalOpen(false);
                openBranchDialog(selectedDbForBranches.name);
              }}>
                <Plus className="h-4 w-4 mr-1" />
                New Branch
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Database Dialog */}
      <Dialog open={createDbDialogOpen} onOpenChange={setCreateDbDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-500" />
              Create Database
            </DialogTitle>
            <DialogDescription>
              Create a new empty database on this server.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="db-name">Database Name</Label>
              <Input
                id="db-name"
                value={newDbName}
                onChange={(e) => setNewDbName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="my_database"
              />
              <p className="text-xs text-muted-foreground">
                Use only letters, numbers, underscores, and hyphens.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDbDialogOpen(false)} disabled={creatingDb}>
              Cancel
            </Button>
            <Button onClick={handleCreateDatabase} disabled={creatingDb || !newDbName}>
              {creatingDb ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Database
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Database Dialog */}
      <Dialog open={deleteDbDialogOpen} onOpenChange={(open) => {
        setDeleteDbDialogOpen(open);
        if (!open) setDeleteConfirmation("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Database
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the database and all its data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm text-destructive font-medium mb-2">
                You are about to delete:
              </p>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-destructive" />
                <span className="font-mono text-sm font-semibold">{dbToDelete}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This action cannot be undone. All tables and data will be permanently lost.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete-confirm" className="text-sm">
                Type <code className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded">{dbToDelete}</code> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Enter database name"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDbDialogOpen(false)} disabled={deletingDb}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteDatabase}
              disabled={deletingDb || deleteConfirmation !== dbToDelete}
            >
              {deletingDb ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Database
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
