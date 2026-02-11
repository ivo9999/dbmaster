"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[400px]">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-yellow-500/10">
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </div>
          <CardTitle className="text-2xl">Waiting for Approval</CardTitle>
          <CardDescription>
            Your access request has been sent to the admin team
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ll be able to access the application once an administrator
            approves your request. This typically happens within a few hours.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
