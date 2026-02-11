"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";

export default function RejectedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-[400px]">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            Your access request has been rejected
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Unfortunately, an administrator has rejected your access request.
            If you believe this is a mistake, please contact the team
            administrator.
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
