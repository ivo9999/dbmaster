import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "./sign-out-button";

export default async function SettingsPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  const initials = session.user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="container mx-auto max-w-2xl py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your GitHub profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-semibold">{session.user.name}</h2>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
                <Badge variant="outline" className="mt-1">
                  {session.user.role}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Session Card */}
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Manage your session</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Session expires</p>
                <p className="text-sm text-muted-foreground">
                  Your session will expire after 30 days of inactivity
                </p>
              </div>
              <Separator />
              <SignOutButton />
            </div>
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card>
          <CardHeader>
            <CardTitle>Keyboard Shortcuts</CardTitle>
            <CardDescription>Available keyboard shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Navigate tables</span>
                <span><kbd className="rounded bg-muted px-1.5 py-0.5">j</kbd> / <kbd className="rounded bg-muted px-1.5 py-0.5">k</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Execute query</span>
                <span><kbd className="rounded bg-muted px-1.5 py-0.5">Cmd</kbd> + <kbd className="rounded bg-muted px-1.5 py-0.5">Enter</kbd></span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open table</span>
                <span><kbd className="rounded bg-muted px-1.5 py-0.5">Enter</kbd></span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
