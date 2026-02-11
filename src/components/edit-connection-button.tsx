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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Edit,
  TestTube,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  Settings2,
  Globe,
  Zap,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Environment } from "@prisma/client";

const editConnectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.number().min(1).max(65535),
  database: z.string().min(1, "Database name is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string(),
  ssl: z.boolean(),
  environment: z.nativeEnum(Environment),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
  description: z.string().optional(),
  pgbouncerUrl: z.string().optional(),
  publicHost: z.string().optional(),
  publicPort: z.number().min(1).max(65535).optional(),
});

type EditConnectionFormData = z.infer<typeof editConnectionSchema>;

interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  dbType: string;
  environment: Environment;
  color: string;
  description: string | null;
  pgbouncerUrl: string | null;
  publicHost: string | null;
  publicPort: number | null;
}

const defaultColors = {
  DEVELOPMENT: "#22c55e",
  STAGING: "#eab308",
  PRODUCTION: "#ef4444",
};

function parseConnectionString(url: string) {
  try {
    const normalized = url.replace(/^postgres:\/\//, "postgresql://");
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
    };
  } catch {
    return null;
  }
}

interface EditConnectionButtonProps {
  connection: Connection;
  trigger?: React.ReactNode;
}

export function EditConnectionButton({ connection, trigger }: EditConnectionButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const editForm = useForm<EditConnectionFormData>({
    resolver: zodResolver(editConnectionSchema),
    defaultValues: {
      name: connection.name,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password: "",
      ssl: connection.ssl,
      environment: connection.environment,
      color: connection.color,
      description: connection.description || "",
      pgbouncerUrl: connection.pgbouncerUrl || "",
      publicHost: connection.publicHost || "",
      publicPort: connection.publicPort || undefined,
    },
  });

  const handleEnvironmentChange = (env: Environment) => {
    editForm.setValue("environment", env);
    editForm.setValue("color", defaultColors[env]);
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    const values = editForm.getValues();

    if (!values.password) {
      setTestResult({
        success: false,
        message: "Enter password to test connection",
      });
      setTestingConnection(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: values.host,
          port: values.port,
          database: values.database,
          username: values.username,
          password: values.password,
          ssl: values.ssl,
          dbType: connection.dbType,
        }),
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

  const onSubmit = async (data: EditConnectionFormData) => {
    setLoading(true);
    try {
      const payload = data.password
        ? data
        : { ...data, password: undefined };

      const response = await fetch(`/api/admin/connections/${connection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save connection");
      }

      toast.success("Connection updated");
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save connection");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit Connection</DialogTitle>
          <DialogDescription>
            Update database connection settings
          </DialogDescription>
        </DialogHeader>

        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Name</FormLabel>
                    <FormControl>
                      <Input className="h-8" placeholder="Production DB" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Environment</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => handleEnvironmentChange(v as Environment)}
                    >
                      <FormControl>
                        <SelectTrigger className="h-8">
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

            <div className="grid grid-cols-4 gap-3">
              <FormField
                control={editForm.control}
                name="host"
                render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel className="text-xs">Host</FormLabel>
                    <FormControl>
                      <Input className="h-8" placeholder="localhost" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Port</FormLabel>
                    <FormControl>
                      <Input
                        className="h-8"
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
              control={editForm.control}
              name="database"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Database</FormLabel>
                  <FormControl>
                    <Input className="h-8" placeholder="postgres" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={editForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Username</FormLabel>
                    <FormControl>
                      <Input className="h-8" placeholder="postgres" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Password</FormLabel>
                    <FormControl>
                      <Input
                        className="h-8"
                        type="password"
                        placeholder="Leave empty to keep current"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center gap-4">
              <FormField
                control={editForm.control}
                name="ssl"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 text-xs">Use SSL</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormLabel className="!mt-0 text-xs">Color</FormLabel>
                    <FormControl>
                      <Input type="color" className="h-6 w-10 p-0.5" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={editForm.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[60px]"
                      placeholder="Main production database"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Optional Connection URLs Section - not applicable for ClickHouse */}
            {connection.dbType !== "clickhouse" && (
              <Collapsible defaultOpen={!!editForm.watch("pgbouncerUrl") || !!editForm.watch("publicHost")}>
                <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors [&[data-state=open]>svg]:rotate-180">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">Additional URLs</span>
                    {(editForm.watch("pgbouncerUrl") || editForm.watch("publicHost")) && (
                      <span className="text-xs text-muted-foreground">
                        ({[editForm.watch("pgbouncerUrl") && "PgBouncer", editForm.watch("publicHost") && "Public"].filter(Boolean).join(", ")})
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-green-500" />
                      <label className="text-xs font-medium">PgBouncer Base URL</label>
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
                            editForm.setValue("pgbouncerUrl", baseUrl);
                          } catch {
                            // If not a valid URL, store as-is
                            editForm.setValue("pgbouncerUrl", value);
                          }
                        } else {
                          editForm.setValue("pgbouncerUrl", "");
                        }
                      }}
                    />
                    {editForm.watch("pgbouncerUrl") && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Base URL configured (database name will be appended)
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-yellow-500" />
                      <label className="text-xs font-medium">Public URL</label>
                    </div>
                    <Input
                      placeholder="postgres://user:pass@91.98.200.83:5432/db"
                      type="password"
                      className="h-8 text-sm"
                      onChange={(e) => {
                        const parsed = parseConnectionString(e.target.value);
                        if (parsed) {
                          editForm.setValue("publicHost", parsed.host);
                          editForm.setValue("publicPort", parsed.port);
                        }
                      }}
                    />
                    {editForm.watch("publicHost") && (
                      <p className="text-xs text-yellow-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {editForm.watch("publicHost")}:{editForm.watch("publicPort") || 5432}
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-md p-2 text-xs overflow-hidden ${
                  testResult.success
                    ? "bg-green-500/10 text-green-500"
                    : "bg-red-500/10 text-red-500"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <span className="break-words min-w-0">{testResult.message}</span>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={testingConnection || loading}
              >
                {testingConnection ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-3.5 w-3.5" />
                )}
                Test
              </Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Update
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
