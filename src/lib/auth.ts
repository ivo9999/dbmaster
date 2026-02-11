import NextAuth from "next-auth";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import type { UserRole } from "@prisma/client";

// Type augmentations are in auth.config.ts

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "github" && profile) {
        const githubId = String(profile.id);
        const email = user.email || (profile.email as string | undefined);

        if (!email) {
          return false;
        }

        // Check if user exists by githubId
        const dbUser = await prisma.user.findUnique({
          where: { githubId },
        });

        if (dbUser) {
          // User exists, check if rejected
          if (dbUser.role === "REJECTED") {
            return "/auth/rejected";
          }

          // Update user info from GitHub
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              name: user.name || (profile.name as string | undefined) || (profile.login as string | undefined),
              avatar: user.image || (profile.avatar_url as string | undefined),
              email: email,
            },
          });

          return true;
        }

        // Check if email already exists (different GitHub account)
        const existingByEmail = await prisma.user.findUnique({
          where: { email },
        });

        if (existingByEmail) {
          // Link this GitHub account to existing user
          await prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              githubId,
              name: user.name || (profile.name as string | undefined) || existingByEmail.name,
              avatar: user.image || (profile.avatar_url as string | undefined) || existingByEmail.avatar,
            },
          });
          return true;
        }

        // New user - check if this is the first user
        const userCount = await prisma.user.count();
        const isFirstUser = userCount === 0;

        // Create new user
        await prisma.user.create({
          data: {
            githubId,
            email,
            name: user.name || (profile.name as string | undefined) || (profile.login as string | undefined) || null,
            avatar: user.image || (profile.avatar_url as string | undefined) || null,
            role: isFirstUser ? "ADMIN" : "PENDING",
            approvedAt: isFirstUser ? new Date() : null,
          },
        });

        return true;
      }

      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && profile) {
        // Initial sign in - fetch user from DB
        const githubId = String(profile.id);
        const dbUser = await prisma.user.findUnique({
          where: { githubId },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.githubId = dbUser.githubId;
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.avatar;
        }
      }
      // Role is set on sign-in and stored in JWT
      // User must sign out and back in to get role updates
      return token;
    },
    // session callback is inherited from authConfig
  },
});

// Helper to check if user is admin
export function isAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

// Helper to check if user is approved (admin or approved)
export function isApproved(role: UserRole): boolean {
  return role === "ADMIN" || role === "APPROVED";
}

// Helper to check if user is pending
export function isPending(role: UserRole): boolean {
  return role === "PENDING";
}
