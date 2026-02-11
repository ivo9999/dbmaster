"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus,
  Server,
  TestTube,
  Loader2,
  CheckCircle,
  XCircle,
  Settings2,
  Database,
  ChevronDown,
  Globe,
  Zap,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Environment } from "@prisma/client";

// Schema for server details form
const serverDetailsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  environment: z.nativeEnum(Environment),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
  description: z.string().optional(),
  pgbouncerUrl: z.string().optional(),
  publicHost: z.string().optional(),
  publicPort: z.number().min(1).max(65535).optional(),
});

// Schema for manual mode
const manualConnectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.number().min(1).max(65535),
  database: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  ssl: z.boolean(),
  dbType: z.enum(["postgres", "clickhouse"]),
  environment: z.nativeEnum(Environment),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
  description: z.string().optional(),
  pgbouncerUrl: z.string().optional(),
  publicHost: z.string().optional(),
  publicPort: z.number().min(1).max(65535).optional(),
});

type ServerDetailsFormData = z.infer<typeof serverDetailsSchema>;
type ManualConnectionFormData = z.infer<typeof manualConnectionSchema>;

interface ServerInfo {
  host: string;
  port: number;
  username: string;
  databaseCount: number;
}

const defaultColors = {
  DEVELOPMENT: "#22c55e",
  STAGING: "#eab308",
  PRODUCTION: "#ef4444",
};

// Parse PostgreSQL or ClickHouse connection string
function parseConnectionString(connStr: string): {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  dbType?: "postgres" | "clickhouse";
} | null {
  try {
    const isClickHouse = connStr.startsWith("clickhouse://");
    const normalized = connStr
      .replace(/^postgresql:/, "postgres:")
      .replace(/^clickhouse:/, "postgres:");
    const url = new URL(normalized);
    const host = url.hostname;
    const defaultPort = isClickHouse ? 8123 : 5432;
    const port = parseInt(url.port) || defaultPort;
    const defaultDb = isClickHouse ? "default" : "postgres";
    const database = url.pathname.slice(1) || defaultDb;
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
      ...(isClickHouse ? { dbType: "clickhouse" as const } : {}),
    };
  } catch {
    return null;
  }
}

interface AddConnectionDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddConnectionDialog({ trigger, open, onOpenChange, onSuccess }: AddConnectionDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = open !== undefined ? open : internalOpen;
  const setDialogOpen = onOpenChange || setInternalOpen;
  const [connectionMode, setConnectionMode] = useState<"server" | "manual">("server");
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Server browser state
  const [serverConnectionString, setServerConnectionString] = useState("");
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [parsedConnection, setParsedConnection] = useState<ReturnType<typeof parseConnectionString>>(null);
  const [loadingServer, setLoadingServer] = useState(false);

  // Form for server details (after connecting)
  const serverForm = useForm<ServerDetailsFormData>({
    resolver: zodResolver(serverDetailsSchema),
    defaultValues: {
      name: "",
      environment: "DEVELOPMENT",
      color: "#22c55e",
      description: "",
      pgbouncerUrl: "",
      publicHost: "",
      publicPort: undefined,
    },
  });

  // Form for manual mode
  const manualForm = useForm<ManualConnectionFormData>({
    resolver: zodResolver(manualConnectionSchema),
    defaultValues: {
      name: "",
      host: "",
      port: 5432,
      database: "postgres",
      username: "",
      password: "",
      ssl: true,
      dbType: "postgres",
      environment: "DEVELOPMENT",
      color: "#22c55e",
      description: "",
      pgbouncerUrl: "",
      publicHost: "",
      publicPort: undefined,
    },
  });

  const resetDialog = () => {
    setConnectionMode("server");
    setServerConnectionString("");
    setServerInfo(null);
    setParsedConnection(null);
    setTestResult(null);
    serverForm.reset();
    manualForm.reset();
  };

  const connectToServer = async (connString: string) => {
    const parsed = parseConnectionString(connString);
    if (!parsed) {
      toast.error("Invalid connection string format");
      return;
    }

    setLoadingServer(true);
    setParsedConnection(null);
    setServerInfo(null);

    try {
      const response = await fetch(
        `/api/admin/databases?connectionString=${encodeURIComponent(connString)}`
      );
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || "Failed to connect to server");
        return;
      }

      setParsedConnection(parsed);
      setServerInfo({
        host: data.server.host,
        port: data.server.port,
        username: data.server.username,
        databaseCount: data.databases.length,
      });

      // Pre-fill the name with host
      serverForm.setValue("name", `${parsed.host}`);
      toast.success(`Connected! Found ${data.databases.length} databases`);
    } catch {
      toast.error("Failed to connect to server");
    } finally {
      setLoadingServer(false);
    }
  };

  const handleEnvironmentChange = (env: Environment, form: "server" | "manual") => {
    if (form === "server") {
      serverForm.setValue("environment", env);
      serverForm.setValue("color", defaultColors[env]);
    } else {
      manualForm.setValue("environment", env);
      manualForm.setValue("color", defaultColors[env]);
    }
  };

  const addServerConnection = async (data: ServerDetailsFormData) => {
    if (!parsedConnection) return;

    const isClickHouseConn = parsedConnection.dbType === "clickhouse";
    setLoading(true);
    try {
      const response = await fetch("/api/admin/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          host: parsedConnection.host,
          port: parsedConnection.port,
          database: parsedConnection.database || (isClickHouseConn ? "default" : "postgres"),
          username: parsedConnection.username,
          password: parsedConnection.password,
          ssl: parsedConnection.ssl,
          dbType: isClickHouseConn ? "clickhouse" : "postgres",
          environment: data.environment,
          color: data.color,
          description: data.description,
          pgbouncerUrl: isClickHouseConn ? undefined : (data.pgbouncerUrl || undefined),
          publicHost: isClickHouseConn ? undefined : (data.publicHost || undefined),
          publicPort: isClickHouseConn ? undefined : (data.publicPort || undefined),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add server");
      }

      toast.success(`Server "${data.name}" added with ${serverInfo?.databaseCount} databases`);
      setDialogOpen(false);
      resetDialog();
      router.refresh();
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add server");
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    const values = manualForm.getValues();
    const testData = {
      host: values.host,
      port: values.port,
      database: values.database,
      username: values.username,
      password: values.password,
      ssl: values.ssl,
      dbType: values.dbType,
    };

    try {
      const response = await fetch("/api/admin/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testData),
      });

      const data = await response.json();
      setTestResult({
        success: data.success,
        message: data.success ? `Connected! ${data.version}` : data.error,
      });
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTestingConnection(false);
    }
  };

  const onSubmitManual = async (data: ManualConnectionFormData) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save connection");
      }

      toast.success("Server added");
      setDialogOpen(false);
      resetDialog();
      router.refresh();
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save connection");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => {
      setDialogOpen(open);
      if (!open) resetDialog();
    }}>
      {open === undefined && (
        <DialogTrigger asChild>
          {trigger || (
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle>Add Database Server</DialogTitle>
          <DialogDescription>
            Connect to a PostgreSQL or ClickHouse server to access all its databases
          </DialogDescription>
        </DialogHeader>

        <Tabs value={connectionMode} onValueChange={(v) => setConnectionMode(v as "server" | "manual")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="server" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Connection String
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="server" className="mt-4 space-y-4">
            {/* Step 1: Enter connection strings */}
            {!serverInfo && (
              <div className="space-y-3">
                {/* Main Connection String */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-blue-500" />
                    <label className="text-xs font-medium">Direct Connection (required)</label>
                  </div>
                  <Input
                    placeholder="postgresql://user:password@host:5432/postgres  or  clickhouse://..."
                    type="password"
                    value={serverConnectionString}
                    onChange={(e) => setServerConnectionString(e.target.value)}
                    className="h-9"
                  />
                </div>

                {/* PgBouncer URL - not applicable for ClickHouse */}
                {!serverConnectionString.startsWith("clickhouse://") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-green-500" />
                      <label className="text-xs font-medium">PgBouncer Base URL (optional, for apps)</label>
                    </div>
                    <Input
                      placeholder="postgresql://user:password@pgbouncer:5432"
                      type="password"
                      className="h-9"
                      onChange={(e) => {
                        // Store the base URL (remove database path if present)
                        const value = e.target.value.trim();
                        if (value) {
                          try {
                            const url = new URL(value.replace(/^postgresql:/, "postgres:"));
                            // Remove the database path to get base URL
                            url.pathname = "";
                            const baseUrl = url.toString().replace(/^postgres:/, "postgresql:");
                            serverForm.setValue("pgbouncerUrl", baseUrl);
                          } catch {
                            // If not a valid URL, store as-is
                            serverForm.setValue("pgbouncerUrl", value);
                          }
                        } else {
                          serverForm.setValue("pgbouncerUrl", "");
                        }
                      }}
                    />
                    {serverForm.watch("pgbouncerUrl") && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Base URL configured (database name will be appended)
                      </p>
                    )}
                  </div>
                )}

                {/* Public URL - not applicable for ClickHouse */}
                {!serverConnectionString.startsWith("clickhouse://") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-yellow-500" />
                      <label className="text-xs font-medium">Public URL (optional, for local dev)</label>
                    </div>
                    <Input
                      placeholder="postgresql://user:password@91.98.200.83:5432/db"
                      type="password"
                      className="h-9"
                      onChange={(e) => {
                        const parsed = parseConnectionString(e.target.value);
                        if (parsed) {
                          serverForm.setValue("publicHost", parsed.host);
                          serverForm.setValue("publicPort", parsed.port);
                        }
                      }}
                    />
                    {serverForm.watch("publicHost") && (
                      <p className="text-xs text-yellow-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {serverForm.watch("publicHost")}:{serverForm.watch("publicPort") || 5432}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => connectToServer(serverConnectionString)}
                  disabled={loadingServer || !serverConnectionString}
                >
                  {loadingServer ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="mr-2 h-4 w-4" />
                  )}
                  Connect
                </Button>
              </div>
            )}

            {/* Step 2: Server connected - fill in details */}
            {serverInfo && (
              <div className="space-y-4">
                {/* Server info header */}
                <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">
                        {serverInfo.host}:{serverInfo.port}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {serverInfo.databaseCount} databases available · Connected as {serverInfo.username}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setServerInfo(null);
                      setParsedConnection(null);
                      setServerConnectionString("");
                    }}
                  >
                    Disconnect
                  </Button>
                </div>

                {/* Server details form */}
                <Form {...serverForm}>
                  <form onSubmit={serverForm.handleSubmit(addServerConnection)} className="space-y-4">
                    <FormField
                      control={serverForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Server Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Production Server" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={serverForm.control}
                        name="environment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Environment</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(v) => handleEnvironmentChange(v as Environment, "server")}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="DEVELOPMENT">Development</SelectItem>
                                <SelectItem value="STAGING">Staging</SelectItem>
                                <SelectItem value="PRODUCTION">Production</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={serverForm.control}
                        name="color"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Color</FormLabel>
                            <FormControl>
                              <Input type="color" className="h-10 w-full" {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={serverForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (optional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Main production server" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Show configured URLs summary */}
                    {(serverForm.watch("pgbouncerUrl") || serverForm.watch("publicHost")) && (
                      <div className="rounded-lg border p-3 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Configured URLs:</p>
                        {serverForm.watch("pgbouncerUrl") && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            PgBouncer: base URL configured
                          </p>
                        )}
                        {serverForm.watch("publicHost") && (
                          <p className="text-xs text-yellow-600 flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Public: {serverForm.watch("publicHost")}:{serverForm.watch("publicPort") || 5432}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
                      <div className="flex items-start gap-2">
                        <Database className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div className="text-sm text-blue-600 dark:text-blue-400">
                          <strong>{serverInfo.databaseCount} databases</strong> will be accessible from this server connection.
                          You can browse and query any of them{parsedConnection?.dbType !== "clickhouse" ? ", and create branches" : ""}.
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button type="submit" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add Server
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <Form {...manualForm}>
              <form onSubmit={manualForm.handleSubmit(onSubmitManual)} className="space-y-4">
                <FormField
                  control={manualForm.control}
                  name="dbType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Database Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v === "clickhouse") {
                            manualForm.setValue("port", 8123);
                            manualForm.setValue("database", "default");
                            manualForm.setValue("ssl", false);
                          } else {
                            manualForm.setValue("port", 5432);
                            manualForm.setValue("database", "postgres");
                            manualForm.setValue("ssl", true);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="postgres">PostgreSQL</SelectItem>
                          <SelectItem value="clickhouse">ClickHouse</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={manualForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Server Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Production Server" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={manualForm.control}
                    name="environment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Environment</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => handleEnvironmentChange(v as Environment, "manual")}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="DEVELOPMENT">Development</SelectItem>
                            <SelectItem value="STAGING">Staging</SelectItem>
                            <SelectItem value="PRODUCTION">Production</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={manualForm.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="localhost" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={manualForm.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="5432"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 5432)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={manualForm.control}
                  name="database"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Database</FormLabel>
                      <FormControl>
                        <Input placeholder="postgres" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Usually &quot;{manualForm.watch("dbType") === "clickhouse" ? "default" : "postgres"}&quot;. This is used for the initial connection - all databases will be accessible.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={manualForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="postgres" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={manualForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <FormField
                    control={manualForm.control}
                    name="ssl"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Use SSL</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={manualForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormLabel className="!mt-0">Color</FormLabel>
                        <FormControl>
                          <Input type="color" className="h-8 w-12 p-1" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={manualForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Main production server"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Optional Connection URLs Section - not applicable for ClickHouse */}
                {manualForm.watch("dbType") !== "clickhouse" && (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors [&[data-state=open]>svg]:rotate-180">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                        <span>Additional Connection URLs</span>
                        {(manualForm.watch("pgbouncerUrl") || manualForm.watch("publicHost")) && (
                          <span className="text-xs text-muted-foreground">
                            ({[manualForm.watch("pgbouncerUrl") && "PgBouncer", manualForm.watch("publicHost") && "Public"].filter(Boolean).join(", ")})
                          </span>
                        )}
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                      {/* PgBouncer URL */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-green-500" />
                          <label className="text-xs font-medium">PgBouncer Base URL (for apps)</label>
                        </div>
                        <Input
                          placeholder="postgres://user:pass@pgbouncer:5432"
                          type="password"
                          className="h-8 text-sm"
                          onChange={(e) => {
                            // Store the base URL (remove database path if present)
                            const value = e.target.value.trim();
                            if (value) {
                              try {
                                const url = new URL(value.replace(/^postgresql:/, "postgres:"));
                                // Remove the database path to get base URL
                                url.pathname = "";
                                const baseUrl = url.toString().replace(/^postgres:/, "postgresql:");
                                manualForm.setValue("pgbouncerUrl", baseUrl);
                              } catch {
                                // If not a valid URL, store as-is
                                manualForm.setValue("pgbouncerUrl", value);
                              }
                            } else {
                              manualForm.setValue("pgbouncerUrl", "");
                            }
                          }}
                        />
                        {manualForm.watch("pgbouncerUrl") && (
                          <p className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Base URL configured (database name will be appended)
                          </p>
                        )}
                      </div>

                      {/* Public URL */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-yellow-500" />
                          <label className="text-xs font-medium">Public URL (for local dev)</label>
                        </div>
                        <Input
                          placeholder="postgres://user:pass@91.98.200.83:5432/db"
                          type="password"
                          className="h-8 text-sm"
                          onChange={(e) => {
                            const parsed = parseConnectionString(e.target.value);
                            if (parsed) {
                              manualForm.setValue("publicHost", parsed.host);
                              manualForm.setValue("publicPort", parsed.port);
                            }
                          }}
                        />
                        {manualForm.watch("publicHost") && (
                          <p className="text-xs text-yellow-600 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {manualForm.watch("publicHost")}:{manualForm.watch("publicPort") || 5432}
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-md p-3 text-sm overflow-hidden ${
                      testResult.success
                        ? "bg-green-500/10 text-green-500"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <span className="break-words min-w-0">{testResult.message}</span>
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testConnection}
                    disabled={testingConnection || loading}
                  >
                    {testingConnection ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="mr-2 h-4 w-4" />
                    )}
                    Test Connection
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Server
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
