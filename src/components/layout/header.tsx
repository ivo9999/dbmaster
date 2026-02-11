"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  LogOut,
  Settings,
  Database,
  Users,
  ChevronDown,
  GitBranch,
  Loader2,
  Menu,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DbmasterIcon } from "@/components/icons/dbmaster-icon";
import { AddConnectionDialog } from "@/components/add-connection-dialog";

interface Connection {
  id: string;
  name: string;
  environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  color: string;
}

interface DatabaseInfo {
  name: string;
  size: string;
  isMain: boolean;
  branches: string[];
}

interface HeaderProps {
  connections?: Connection[];
  isAdmin?: boolean;
}

const environmentColors = {
  DEVELOPMENT: "bg-green-500/10 text-green-500 border-green-500/20",
  STAGING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  PRODUCTION: "bg-red-500/10 text-red-500 border-red-500/20",
};

const environmentLabels = {
  DEVELOPMENT: "dev",
  STAGING: "stage",
  PRODUCTION: "prod",
};

export function Header({ connections = [], isAdmin }: HeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();

  // State for databases dropdown
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [databasesLoaded, setDatabasesLoaded] = useState(false);

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  // Parse pathname for breadcrumbs
  // Format: /[connectionId]/db/[database]/tables/[tableName]
  const pathParts = pathname.split("/").filter(Boolean);
  const connectionId = pathParts[0];
  const dbIndex = pathParts.indexOf("db");
  const fullDatabase = dbIndex !== -1 ? pathParts[dbIndex + 1] : null;
  const tablesIndex = pathParts.indexOf("tables");
  const tableName = tablesIndex !== -1 ? decodeURIComponent(pathParts[tablesIndex + 1] || "") : null;

  // Find current connection from pathname
  const currentConnection = connections.find((c) => c.id === connectionId);

  // Parse database and branch from full database name
  // Format: {database}_{branch} or just {database} (which means "main" branch)
  const underscoreIdx = fullDatabase?.lastIndexOf("_") ?? -1;
  const hasUnderscore = underscoreIdx > 0;
  const database = hasUnderscore ? fullDatabase!.substring(0, underscoreIdx) : fullDatabase;
  const branch = hasUnderscore ? fullDatabase!.substring(underscoreIdx + 1) : "main";

  // Extract just the table name (without schema) from tableName (format: schema.table)
  const table = tableName?.includes(".")
    ? tableName.split(".")[1]
    : tableName;

  // Get branches for current database
  const currentDbInfo = databases.find(d => d.name === database);
  const availableBranches = currentDbInfo?.branches || [];

  // Fetch databases when dropdown opens
  const handleDatabaseDropdownOpen = async (open: boolean) => {
    if (open && !databasesLoaded && connectionId) {
      setLoadingDatabases(true);
      try {
        const response = await fetch(`/api/connections/${connectionId}/databases/list`);
        if (response.ok) {
          const data = await response.json();
          setDatabases(data.databases);
          setDatabasesLoaded(true);
        }
      } catch (error) {
        console.error("Failed to fetch databases:", error);
      } finally {
        setLoadingDatabases(false);
      }
    }
  };

  // Add connection dialog state
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);

  // Mobile navigation sheet state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Mobile navigation content
  const MobileNavContent = () => (
    <div className="flex flex-col gap-4 py-4">
      {/* Current location breadcrumb */}
      <div className="space-y-3">
        {/* Connection */}
        {currentConnection && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Server</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-10">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: currentConnection.color }}
                    />
                    <span className="truncate">{currentConnection.name}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[calc(100vw-3rem)]" align="start">
                {connections.map((connection) => (
                  <DropdownMenuItem key={connection.id} asChild>
                    <Link
                      href={`/${connection.id}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2"
                    >
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: connection.color }}
                      />
                      <span className="flex-1 truncate">{connection.name}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", environmentColors[connection.environment])}
                      >
                        {environmentLabels[connection.environment]}
                      </Badge>
                    </Link>
                  </DropdownMenuItem>
                ))}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => {
                      setMobileMenuOpen(false);
                      setAddConnectionOpen(true);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Server
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Database */}
        {fullDatabase && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Database</p>
            <DropdownMenu onOpenChange={handleDatabaseDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-10">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{database}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[calc(100vw-3rem)]" align="start">
                {loadingDatabases ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : databases.length > 0 ? (
                  databases.map((db) => (
                    <DropdownMenuItem key={db.name} asChild>
                      <Link
                        href={`/${connectionId}/db/${db.name}/tables`}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2"
                      >
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{db.name}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No databases found
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Branch */}
        {fullDatabase && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Branch</p>
            <DropdownMenu onOpenChange={handleDatabaseDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-10">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span>{branch}</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[calc(100vw-3rem)]" align="start">
                {loadingDatabases ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/${connectionId}/db/${database}/tables`}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn("flex items-center gap-2", branch === "main" && "bg-accent")}
                      >
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                        <span>main</span>
                        {branch === "main" && (
                          <Badge variant="secondary" className="text-[10px] ml-auto">current</Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                    {availableBranches.map((branchDb) => {
                      const branchName = branchDb.substring(database!.length + 1);
                      return (
                        <DropdownMenuItem key={branchDb} asChild>
                          <Link
                            href={`/${connectionId}/db/${branchDb}/tables`}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn("flex items-center gap-2", fullDatabase === branchDb && "bg-accent")}
                          >
                            <GitBranch className="h-4 w-4 text-purple-500" />
                            <span>{branchName}</span>
                            {fullDatabase === branchDb && (
                              <Badge variant="secondary" className="text-[10px] ml-auto">current</Badge>
                            )}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Table (non-interactive) */}
        {table && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Table</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
              <span className="font-medium">{table}</span>
            </div>
          </div>
        )}
      </div>

      {/* Admin links */}
      {isAdmin && (
        <div className="border-t pt-4 space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Admin</p>
          <Link
            href="/admin/users"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between p-3 rounded-md hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4" />
              <span>Users</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      )}

      {/* User info & settings */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
          <Avatar className="h-10 w-10">
            <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || ""} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{session?.user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
          </div>
          <Badge variant="outline" className="text-xs">{session?.user?.role}</Badge>
        </div>
        <Link
          href="/settings"
          onClick={() => setMobileMenuOpen(false)}
          className="flex items-center justify-between p-3 rounded-md hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          className="flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors w-full text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-3 md:px-4">
      <div className="flex items-center gap-1">
        {/* Mobile Menu Button */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[350px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <DbmasterIcon size={20} />
                <span>dbmaster</span>
              </SheetTitle>
            </SheetHeader>
            <MobileNavContent />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent transition-colors">
          <DbmasterIcon size={20} />
          <span className="font-semibold text-sm hidden sm:inline">dbmaster</span>
        </Link>

        {/* Desktop Breadcrumbs - hidden on mobile */}
        <nav className="hidden md:flex items-center text-sm">
          {/* Connection Selector */}
          {connections.length > 0 && (
            <>
              <span className="text-muted-foreground mx-1">/</span>
              <div className="flex items-center">
                {currentConnection ? (
                  <Link
                    href={`/${currentConnection.id}`}
                    className="text-sm px-2 py-1 rounded-l hover:bg-accent transition-colors font-medium"
                  >
                    {currentConnection.name}
                  </Link>
                ) : (
                  <span className="text-sm px-2 py-1 text-muted-foreground">Select server</span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1 rounded-l-none"
                    >
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Servers
                    </DropdownMenuLabel>
                    {connections.map((connection) => (
                      <DropdownMenuItem key={connection.id} asChild>
                        <Link
                          href={`/${connection.id}`}
                          className="flex items-center gap-2"
                        >
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: connection.color }}
                          />
                          <span className="flex-1 truncate">{connection.name}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              environmentColors[connection.environment]
                            )}
                          >
                            {environmentLabels[connection.environment]}
                          </Badge>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setAddConnectionOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Server
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}

          {/* Database Selector */}
          {fullDatabase && currentConnection && (
            <>
              <span className="text-muted-foreground mx-1">/</span>
              <div className="flex items-center">
                <Link
                  href={`/${connectionId}/db/${fullDatabase}/tables`}
                  className="text-sm px-2 py-1 rounded-l hover:bg-accent transition-colors font-medium"
                >
                  {database}
                </Link>
                <DropdownMenu onOpenChange={handleDatabaseDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-1 rounded-l-none"
                    >
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Databases
                    </DropdownMenuLabel>
                    {loadingDatabases ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : databases.length > 0 ? (
                      databases.map((db) => (
                        <DropdownMenuItem key={db.name} asChild>
                          <Link
                            href={`/${connectionId}/db/${db.name}/tables`}
                            className="flex items-center gap-2"
                          >
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <span className="flex-1 truncate">{db.name}</span>
                            {db.branches.length > 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                {db.branches.length} branches
                              </Badge>
                            )}
                          </Link>
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        No databases found
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}

          {/* Branch Selector */}
          {fullDatabase && (
            <>
              <span className="text-muted-foreground mx-1">/</span>
              <div className="flex items-center">
                <Link
                  href={`/${connectionId}/db/${fullDatabase}/tables`}
                  className="text-sm px-2 py-1 rounded-l hover:bg-accent transition-colors font-medium flex items-center gap-1"
                >
                  <GitBranch className="h-3 w-3 text-muted-foreground" />
                  <span>{branch}</span>
                </Link>
              <DropdownMenu onOpenChange={handleDatabaseDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1 rounded-l-none"
                  >
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Branches
                  </DropdownMenuLabel>
                  {loadingDatabases ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      {/* Main branch */}
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/${connectionId}/db/${database}/tables`}
                          className={cn(
                            "flex items-center gap-2",
                            branch === "main" && "bg-accent"
                          )}
                        >
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <span>main</span>
                          {branch === "main" && (
                            <Badge variant="secondary" className="text-[10px] ml-auto">
                              current
                            </Badge>
                          )}
                        </Link>
                      </DropdownMenuItem>
                      {/* Other branches */}
                      {availableBranches.map((branchDb) => {
                        const branchName = branchDb.substring(database!.length + 1);
                        return (
                          <DropdownMenuItem key={branchDb} asChild>
                            <Link
                              href={`/${connectionId}/db/${branchDb}/tables`}
                              className={cn(
                                "flex items-center gap-2",
                                fullDatabase === branchDb && "bg-accent"
                              )}
                            >
                              <GitBranch className="h-4 w-4 text-purple-500" />
                              <span>{branchName}</span>
                              {fullDatabase === branchDb && (
                                <Badge variant="secondary" className="text-[10px] ml-auto">
                                  current
                                </Badge>
                              )}
                            </Link>
                          </DropdownMenuItem>
                        );
                      })}
                      {availableBranches.length === 0 && branch === "main" && (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No other branches
                        </div>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </>
          )}

          {/* Table */}
          {table && (
            <>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-foreground font-medium px-2 py-1">{table}</span>
            </>
          )}
        </nav>

        {/* Mobile compact breadcrumb - show current context */}
        <div className="flex md:hidden items-center text-sm ml-1">
          {currentConnection && (
            <span className="text-muted-foreground truncate max-w-[120px]">
              {table || database || currentConnection.name}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Admin Links - desktop only */}
        {isAdmin && (
          <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1" asChild>
            <Link href="/admin/users">
              <Users className="h-4 w-4" />
              <span className="hidden lg:inline ml-1">Users</span>
            </Link>
          </Button>
        )}

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={session?.user?.image || undefined}
                  alt={session?.user?.name || ""}
                />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {session?.user?.name}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {session?.user?.email}
                </p>
                <Badge variant="outline" className="mt-1 w-fit text-xs">
                  {session?.user?.role}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Add Connection Dialog (controlled from dropdown) */}
      {isAdmin && (
        <AddConnectionDialog
          open={addConnectionOpen}
          onOpenChange={setAddConnectionOpen}
        />
      )}
    </header>
  );
}
