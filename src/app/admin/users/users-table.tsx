"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, X, MoreHorizontal, Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { UserRole } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";

interface User {
  id: string;
  githubId: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: UserRole;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
}

interface UsersTableProps {
  users: User[];
  currentUserId: string;
}

const roleBadgeVariants: Record<UserRole, string> = {
  ADMIN: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  APPROVED: "bg-green-500/10 text-green-500 border-green-500/20",
  PENDING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  REJECTED: "bg-red-500/10 text-red-500 border-red-500/20",
};

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    userId: string;
    action: "approve" | "reject" | "promote" | "demote";
    userName: string;
  }>({ open: false, userId: "", action: "approve", userName: "" });

  const handleAction = async (userId: string, action: "approve" | "reject" | "promote" | "demote") => {
    setLoading(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update user");
      }

      toast.success(
        action === "approve"
          ? "User approved successfully"
          : action === "reject"
          ? "User rejected"
          : action === "promote"
          ? "User promoted to admin"
          : "Admin privileges removed"
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user");
    } finally {
      setLoading(null);
      setConfirmDialog({ open: false, userId: "", action: "approve", userName: "" });
    }
  };

  const openConfirmDialog = (userId: string, action: "approve" | "reject" | "promote" | "demote", userName: string) => {
    setConfirmDialog({ open: true, userId, action, userName });
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const initials = user.name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase() || "?";

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar || undefined} />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">@{user.githubId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleBadgeVariants[user.role]}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {user.id === currentUserId ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : user.role === "PENDING" ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-green-500 hover:bg-green-500/10 hover:text-green-500"
                          onClick={() => openConfirmDialog(user.id, "approve", user.name || "this user")}
                          disabled={loading === user.id}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                          onClick={() => openConfirmDialog(user.id, "reject", user.name || "this user")}
                          disabled={loading === user.id}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" disabled={loading === user.id}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {user.role === "APPROVED" && (
                            <DropdownMenuItem
                              onClick={() => openConfirmDialog(user.id, "promote", user.name || "this user")}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Promote to Admin
                            </DropdownMenuItem>
                          )}
                          {user.role === "ADMIN" && (
                            <DropdownMenuItem
                              onClick={() => openConfirmDialog(user.id, "demote", user.name || "this user")}
                            >
                              <ShieldOff className="mr-2 h-4 w-4" />
                              Remove Admin
                            </DropdownMenuItem>
                          )}
                          {user.role !== "REJECTED" && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openConfirmDialog(user.id, "reject", user.name || "this user")}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Reject User
                            </DropdownMenuItem>
                          )}
                          {user.role === "REJECTED" && (
                            <DropdownMenuItem
                              onClick={() => openConfirmDialog(user.id, "approve", user.name || "this user")}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Approve User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === "approve"
                ? "Approve User"
                : confirmDialog.action === "reject"
                ? "Reject User"
                : confirmDialog.action === "promote"
                ? "Promote to Admin"
                : "Remove Admin Privileges"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === "approve"
                ? `Are you sure you want to approve ${confirmDialog.userName}? They will be able to access the application.`
                : confirmDialog.action === "reject"
                ? `Are you sure you want to reject ${confirmDialog.userName}? They will no longer be able to access the application.`
                : confirmDialog.action === "promote"
                ? `Are you sure you want to promote ${confirmDialog.userName} to admin? They will have full access to all features.`
                : `Are you sure you want to remove admin privileges from ${confirmDialog.userName}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction(confirmDialog.userId, confirmDialog.action)}
              className={
                confirmDialog.action === "reject"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirmDialog.action === "approve"
                ? "Approve"
                : confirmDialog.action === "reject"
                ? "Reject"
                : confirmDialog.action === "promote"
                ? "Promote"
                : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
