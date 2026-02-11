"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Database,
  Table2,
  Terminal,
  Settings,
  Users,
  LogOut,
  Sun,
  Moon,
  Home,
  Search,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";

interface Connection {
  id: string;
  name: string;
  environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  color: string;
}

interface CommandPaletteProps {
  connections: Connection[];
  isAdmin: boolean;
}

export function CommandPalette({ connections, isAdmin }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const { theme, setTheme } = useTheme();
  const connectionId = params?.connectionId as string | undefined;

  // Global keyboard shortcut for opening command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }

      // Escape to close
      if (e.key === "Escape" && open) {
        setOpen(false);
      }

      // Only handle shortcuts when command palette is NOT open
      if (!open) {
        // Cmd+T / Ctrl+T - Go to tables (if in a connection)
        if ((e.metaKey || e.ctrlKey) && e.key === "t" && connectionId) {
          e.preventDefault();
          router.push(`/${connectionId}/tables`);
        }

        // Cmd+Q / Ctrl+Shift+Q - Go to query runner (if in a connection)
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "q" && connectionId) {
          e.preventDefault();
          router.push(`/${connectionId}/query`);
        }

        // Cmd+/ - Show keyboard shortcuts help
        if ((e.metaKey || e.ctrlKey) && e.key === "/") {
          e.preventDefault();
          setOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, connectionId, router]);

  const runCommand = useCallback((callback: () => void) => {
    setOpen(false);
    callback();
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <Home className="mr-2 h-4 w-4" />
            Go to Dashboard
            <CommandShortcut>Home</CommandShortcut>
          </CommandItem>
          {connectionId && (
            <>
              <CommandItem
                onSelect={() => runCommand(() => router.push(`/${connectionId}/tables`))}
              >
                <Table2 className="mr-2 h-4 w-4" />
                Browse Tables
                <CommandShortcut>Cmd+T</CommandShortcut>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push(`/${connectionId}/query`))}
              >
                <Terminal className="mr-2 h-4 w-4" />
                Query Runner
                <CommandShortcut>Cmd+Shift+Q</CommandShortcut>
              </CommandItem>
            </>
          )}
        </CommandGroup>

        {/* Connections */}
        {connections.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Connections">
              {connections.map((conn) => (
                <CommandItem
                  key={conn.id}
                  onSelect={() => runCommand(() => router.push(`/${conn.id}/tables`))}
                >
                  <div
                    className="mr-2 h-3 w-3 rounded-full"
                    style={{ backgroundColor: conn.color }}
                  />
                  <span>{conn.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {conn.environment.toLowerCase()}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Admin */}
        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Admin">
              <CommandItem
                onSelect={() => runCommand(() => router.push("/admin/users"))}
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => router.push("/admin/connections"))}
              >
                <Database className="mr-2 h-4 w-4" />
                Manage Connections
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* Actions */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => runCommand(() => router.refresh())}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Page
            <CommandShortcut>Cmd+R</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runCommand(() => setTheme(theme === "dark" ? "light" : "dark"))
            }
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle Theme
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => signOut())}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </CommandItem>
        </CommandGroup>

        {/* Help */}
        <CommandSeparator />
        <CommandGroup heading="Help">
          <CommandItem disabled>
            <span className="text-muted-foreground">
              Press <kbd className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">Cmd+K</kbd> to open this menu
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
