"use client";

import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/command-palette";

interface Connection {
  id: string;
  name: string;
  environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  color: string;
}

interface DashboardShellProps {
  children: React.ReactNode;
  connections: Connection[];
  isAdmin: boolean;
}

export function DashboardShell({
  children,
  connections,
  isAdmin,
}: DashboardShellProps) {
  return (
    <>
      <div className="flex h-screen flex-col">
        <Header
          connections={connections}
          isAdmin={isAdmin}
        />
        <main className="flex-1 overflow-hidden bg-background">{children}</main>
      </div>
      <CommandPalette connections={connections} isAdmin={isAdmin} />
    </>
  );
}
