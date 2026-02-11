"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { SqlEditor } from "@/components/sql-editor/sql-editor";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Play,
  Loader2,
  Clock,
  Database,
  AlertCircle,
  History,
  Copy,
  Check,
  Star,
  ChevronDown,
  Trash2,
  BookmarkPlus,
  Zap,
  PanelRightClose,
  PanelRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Query {
  id: string;
  sql: string;
  name?: string | null;
  executionTime: number | null;
  rowCount: number | null;
  isFavorite?: boolean;
  createdAt: Date;
}

interface QueryRunnerProps {
  connectionId: string;
  connectionName: string;
  database?: string;
  canExecuteWrite: boolean;
  userRole: string;
  recentQueries: Query[];
}

interface QueryResult {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  executionTime: number;
}

interface ExplainResult {
  plan: string;
  executionTime?: number;
}

export function QueryRunner({
  connectionId,
  connectionName,
  database,
  canExecuteWrite,
  userRole,
  recentQueries,
}: QueryRunnerProps) {
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"history" | "favorites">("history");
  const [favorites, setFavorites] = useState<Query[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [resultView, setResultView] = useState<"data" | "explain">("data");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load favorites on mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const response = await fetch(`/api/queries/favorites?connectionId=${connectionId}`);
        if (response.ok) {
          const data = await response.json();
          setFavorites(data.favorites);
        }
      } catch {
        // Silently fail - favorites are optional
      }
    };
    loadFavorites();
  }, [connectionId]);

  const executeQuery = useCallback(async (mode: "execute" | "explain" | "analyze" = "execute") => {
    if (!sql.trim()) {
      toast.error("Please enter a SQL query");
      return;
    }

    // Check if viewer is trying to execute non-SELECT query
    if (!canExecuteWrite && mode === "execute") {
      const trimmedSql = sql.trim().toLowerCase();
      const isSelect = trimmedSql.startsWith("select") || trimmedSql.startsWith("with");
      if (!isSelect) {
        toast.error("You can only execute SELECT queries");
        return;
      }
    }

    setLoading(true);
    setError(null);

    // Clear appropriate result based on mode
    if (mode === "execute") {
      setResult(null);
      setResultView("data");
    } else {
      setExplainResult(null);
      setResultView("explain");
    }

    try {
      // Prepare the SQL based on mode
      let queryToExecute = sql.trim();
      if (mode === "explain") {
        queryToExecute = `EXPLAIN ${queryToExecute}`;
      } else if (mode === "analyze") {
        queryToExecute = `EXPLAIN ANALYZE ${queryToExecute}`;
      }

      const response = await fetch(`/api/connections/${connectionId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: queryToExecute, database }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Query failed");
        return;
      }

      if (mode === "execute") {
        setResult(data);
        toast.success(`Query completed in ${data.executionTime}ms`);
      } else {
        // Format EXPLAIN output
        const planText = data.rows
          .map((row: Record<string, unknown>) => row["QUERY PLAN"] || Object.values(row)[0])
          .join("\n");
        setExplainResult({
          plan: planText,
          executionTime: data.executionTime,
        });
        toast.success(`${mode === "analyze" ? "EXPLAIN ANALYZE" : "EXPLAIN"} completed`);
      }
    } catch {
      setError("Failed to execute query");
    } finally {
      setLoading(false);
    }
  }, [sql, connectionId, database, canExecuteWrite]);

  const saveFavorite = async () => {
    if (!sql.trim()) {
      toast.error("Please enter a SQL query to save");
      return;
    }

    try {
      const response = await fetch("/api/queries/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: sql.trim(),
          connectionId,
          name: saveName || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to save");
      }

      setFavorites((prev) => [data.query, ...prev]);
      toast.success("Query saved to favorites");
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save favorite");
    }
  };

  const removeFavorite = async (queryId: string) => {
    try {
      const response = await fetch("/api/queries/favorites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryId }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove");
      }

      setFavorites((prev) => prev.filter((q) => q.id !== queryId));
      toast.success("Removed from favorites");
    } catch {
      toast.error("Failed to remove from favorites");
    }
  };

  const copyToClipboard = async (value: string, cellId: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 2000);
  };

  const formatCellValue = (value: unknown): string => {
    if (value === null) return "NULL";
    if (value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const loadQuery = (query: Query) => {
    setSql(query.sql);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-card px-3 md:px-6 py-3 md:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <Database className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-base md:text-lg font-semibold truncate">Query Runner</h1>
            <Badge variant="outline" className="hidden sm:inline-flex shrink-0">{connectionName}</Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile toggle for history/favorites panel */}
            <Button
              variant="outline"
              size="sm"
              className="md:hidden h-8"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <History className="h-4 w-4" />
              )}
            </Button>
            <Badge variant="outline" className="hidden sm:inline-flex">{userRole}</Badge>
            {!canExecuteWrite && (
              <Badge variant="outline" className="text-yellow-500 text-xs">
                <span className="hidden sm:inline">SELECT only</span>
                <span className="sm:hidden">Read</span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Editor Panel */}
        <div className="flex flex-1 flex-col md:border-r min-w-0">
          {/* SQL Editor */}
          <div className="flex-1 p-3 md:p-4 min-h-0">
            <SqlEditor
              value={sql}
              onChange={setSql}
              onExecute={() => executeQuery("execute")}
              connectionId={connectionId}
              database={database}
              readOnly={loading}
              placeholder="Enter your SQL query... (Cmd+Enter to execute)"
              minHeight="120px"
            />
          </div>

          {/* Execute Button */}
          <div className="border-t bg-card p-3 md:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground hidden lg:block">
                Press <kbd className="rounded bg-muted px-1">Cmd</kbd> +{" "}
                <kbd className="rounded bg-muted px-1">Enter</kbd> to execute
              </p>
              <div className="flex items-center gap-1 md:gap-2 flex-1 md:flex-initial justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setSaveDialogOpen(true)}
                  disabled={!sql.trim()}
                >
                  <BookmarkPlus className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Save</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8" disabled={loading || !sql.trim()}>
                      <Zap className="h-4 w-4 md:mr-2" />
                      <span className="hidden sm:inline">EXPLAIN</span>
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => executeQuery("explain")}>
                      EXPLAIN (plan only)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => executeQuery("analyze")}>
                      EXPLAIN ANALYZE (with timing)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button className="h-8" onClick={() => executeQuery("execute")} disabled={loading || !sql.trim()}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 md:mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 md:mr-2" />
                  )}
                  <span className="hidden sm:inline">Execute</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 border-t min-h-0 flex flex-col">
            {error && (
              <div className="flex items-center gap-2 bg-destructive/10 p-3 md:p-4 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="break-all">{error}</span>
              </div>
            )}

            {(result || explainResult) && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between border-b bg-card px-3 md:px-4 py-2">
                  <div className="flex items-center gap-2 md:gap-4 text-xs md:text-sm text-muted-foreground">
                    {resultView === "data" && result && (
                      <>
                        <span>{result.rowCount} rows</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {result.executionTime}ms
                        </span>
                      </>
                    )}
                    {resultView === "explain" && explainResult && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        Query Plan
                        {explainResult.executionTime && (
                          <span className="ml-2">({explainResult.executionTime}ms)</span>
                        )}
                      </span>
                    )}
                  </div>
                  {result && explainResult && (
                    <div className="flex gap-1">
                      <Button
                        variant={resultView === "data" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7"
                        onClick={() => setResultView("data")}
                      >
                        Data
                      </Button>
                      <Button
                        variant={resultView === "explain" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7"
                        onClick={() => setResultView("explain")}
                      >
                        Plan
                      </Button>
                    </div>
                  )}
                </div>

                {resultView === "data" && result && (
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="min-w-max">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card">
                          <TableRow>
                            {result.columns.map((column) => (
                              <TableHead key={column} className="whitespace-nowrap text-xs md:text-sm">
                                {column}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.rows.map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {result.columns.map((column) => {
                                const value = row[column];
                                const displayValue = formatCellValue(value);
                                const cellId = `${rowIndex}-${column}`;
                                const isNull = value === null;

                                return (
                                  <TableCell
                                    key={column}
                                    className={cn(
                                      "font-mono text-xs md:text-sm whitespace-nowrap max-w-[200px] md:max-w-[300px] group",
                                      isNull && "text-muted-foreground italic"
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="truncate">{displayValue}</span>
                                      <button
                                        onClick={() => copyToClipboard(displayValue, cellId)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                      >
                                        {copiedCell === cellId ? (
                                          <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                        )}
                                      </button>
                                    </div>
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
                )}

                {resultView === "explain" && explainResult && (
                  <ScrollArea className="flex-1 min-h-0">
                    <pre className="p-3 md:p-4 font-mono text-xs md:text-sm whitespace-pre-wrap">
                      {explainResult.plan}
                    </pre>
                  </ScrollArea>
                )}
              </div>
            )}

            {!result && !explainResult && !error && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-4">
                Execute a query to see results
              </div>
            )}
          </div>
        </div>

        {/* Mobile backdrop for sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-background/80 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Queries Panel - collapsible on mobile */}
        <div className={cn(
          "bg-card flex flex-col transition-all duration-200",
          "md:w-80 md:relative md:z-auto",
          "max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20 max-md:border-l max-md:shadow-lg",
          sidebarOpen ? "max-md:w-[280px]" : "max-md:w-0 max-md:overflow-hidden"
        )}>
          <div className="flex items-center justify-between p-2 border-b md:hidden">
            <span className="text-sm font-medium">Query History</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "history" | "favorites")} className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-2 m-2 mb-0 shrink-0">
              <TabsTrigger value="history" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                <History className="h-3 w-3 md:h-4 md:w-4" />
                History
              </TabsTrigger>
              <TabsTrigger value="favorites" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                <Star className="h-3 w-3 md:h-4 md:w-4" />
                Favorites
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="flex-1 m-0 min-h-0">
              <ScrollArea className="h-full">
                <div className="p-2">
                  {recentQueries.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      No recent queries
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {recentQueries.map((query) => (
                        <button
                          key={query.id}
                          onClick={() => {
                            loadQuery(query);
                            setSidebarOpen(false);
                          }}
                          className="w-full rounded-md p-2 text-left hover:bg-accent transition-colors"
                        >
                          <p className="font-mono text-xs truncate">{query.sql}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {query.executionTime && (
                              <span>{query.executionTime}ms</span>
                            )}
                            {query.rowCount !== null && (
                              <span>{query.rowCount} rows</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="favorites" className="flex-1 m-0 min-h-0">
              <ScrollArea className="h-full">
                <div className="p-2">
                  {favorites.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">
                      No saved queries yet
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {favorites.map((query) => (
                        <div
                          key={query.id}
                          className="group rounded-md p-2 hover:bg-accent transition-colors"
                        >
                          <button
                            onClick={() => {
                              loadQuery(query);
                              setSidebarOpen(false);
                            }}
                            className="w-full text-left"
                          >
                            {query.name && (
                              <p className="text-sm font-medium truncate flex items-center gap-1">
                                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" />
                                {query.name}
                              </p>
                            )}
                            <p className="font-mono text-xs truncate text-muted-foreground">
                              {query.sql}
                            </p>
                          </button>
                          <div className="mt-1 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {query.executionTime && (
                                <span>{query.executionTime}ms</span>
                              )}
                            </div>
                            <button
                              onClick={() => removeFavorite(query.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Save Query Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Query to Favorites</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name (optional)</label>
              <Input
                placeholder="My useful query"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Query</label>
              <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-32">
                {sql}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveFavorite}>
              <Star className="mr-2 h-4 w-4" />
              Save to Favorites
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
