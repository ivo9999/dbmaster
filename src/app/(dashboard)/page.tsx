import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Database, Plus, Users, GitBranch, Server, ArrowRight } from "lucide-react";
import { AddConnectionDialog } from "@/components/add-connection-dialog";

const environmentConfig = {
  DEVELOPMENT: { label: "Dev", class: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  STAGING: { label: "Stage", class: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  PRODUCTION: { label: "Prod", class: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
};

export default async function HomePage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  // Get connections the user has access to with additional stats
  let connections;

  if (session.user.role === "ADMIN") {
    connections = await prisma.connection.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        users: true,
        branches: {
          where: { status: "ACTIVE" },
        },
      },
    });
  } else {
    connections = await prisma.connection.findMany({
      where: {
        users: {
          some: {
            userId: session.user.id,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        users: true,
        branches: {
          where: { status: "ACTIVE" },
        },
      },
    });
  }

  const isAdmin = session.user.role === "ADMIN";

  // Get pending users count for admins
  const pendingUsersCount = isAdmin
    ? await prisma.user.count({ where: { role: "PENDING" } })
    : 0;

  // If only one connection, redirect directly to it
  if (connections.length === 1) {
    redirect(`/${connections[0].id}`);
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-muted/30 to-background">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Welcome back, {session.user.name?.split(" ")[0] || "User"}
          </h1>
          <p className="text-muted-foreground mt-2">
            Select a server to manage your databases
          </p>
        </div>

        {/* Admin alert */}
        {isAdmin && pendingUsersCount > 0 && (
          <Link href="/admin/users" className="block max-w-md mx-auto mb-8">
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Users className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">{pendingUsersCount} pending approval{pendingUsersCount > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">Review access requests</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        )}

        {/* Connections */}
        {connections.length > 0 ? (
          <div className="space-y-3">
            {connections.map((connection) => {
              const env = environmentConfig[connection.environment];
              return (
                <Link
                  key={connection.id}
                  href={`/${connection.id}`}
                  className="group flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/20 transition-all"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${connection.color}15` }}
                  >
                    <Database className="h-5 w-5" style={{ color: connection.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{connection.name}</span>
                      <Badge variant="outline" className={env.class}>
                        {env.label}
                      </Badge>
                      {connection.dbType === "clickhouse" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          CH
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {connection.host}:{connection.port}
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      <span>{connection.users.length}</span>
                    </div>
                    {connection.dbType !== "clickhouse" && (
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="h-4 w-4" />
                        <span>{connection.branches.length}</span>
                      </div>
                    )}
                  </div>

                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 px-4 rounded-xl border border-dashed bg-card/50">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-muted mb-4">
              <Database className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">No servers available</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              {isAdmin
                ? "Add your first database server to get started."
                : "Ask an admin to give you access to a server."}
            </p>
            {isAdmin && (
              <AddConnectionDialog
                trigger={
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Server
                  </Button>
                }
              />
            )}
          </div>
        )}

        {/* Add button for admins with existing connections */}
        {isAdmin && connections.length > 0 && (
          <div className="mt-6 text-center">
            <AddConnectionDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Server
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
