import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

type UserRole = "ADMIN" | "APPROVED" | "PENDING" | "REJECTED";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: UserRole;
      githubId: string;
    };
  }
  interface User {
    role?: UserRole;
    githubId?: string;
  }
}

// Auth configuration without Prisma - for Edge runtime (middleware)
export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    // JWT callback - just pass through token (DB calls are in auth.ts)
    jwt({ token }) {
      return token;
    },
    // Session callback - populate session from token
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.githubId = token.githubId as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.image = token.picture as string | null;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const userRole = auth?.user?.role;

      // Public paths that don't require authentication
      const publicPaths = ["/auth/signin", "/auth/error"];
      const isPublicPath = publicPaths.some((path) =>
        nextUrl.pathname.startsWith(path)
      );

      // Auth-related paths for authenticated users in specific states
      const pendingPath = "/auth/pending";
      const rejectedPath = "/auth/rejected";

      // If not logged in and trying to access protected route
      if (!isLoggedIn && !isPublicPath) {
        return false; // Redirect to signIn page
      }

      // If logged in and trying to access sign in page
      if (isLoggedIn && nextUrl.pathname === "/auth/signin") {
        return Response.redirect(new URL("/", nextUrl));
      }

      // Handle user role-based redirects
      if (isLoggedIn && userRole) {
        // Rejected users can only see the rejected page
        if (userRole === "REJECTED" && nextUrl.pathname !== rejectedPath) {
          return Response.redirect(new URL(rejectedPath, nextUrl));
        }

        // Pending users can only see the pending page
        if (userRole === "PENDING" && nextUrl.pathname !== pendingPath) {
          return Response.redirect(new URL(pendingPath, nextUrl));
        }

        // Approved users shouldn't be on pending/rejected pages
        if (
          (userRole === "ADMIN" || userRole === "APPROVED") &&
          (nextUrl.pathname === pendingPath ||
            nextUrl.pathname === rejectedPath)
        ) {
          return Response.redirect(new URL("/", nextUrl));
        }

        // Admin-only routes
        if (nextUrl.pathname.startsWith("/admin") && userRole !== "ADMIN") {
          return Response.redirect(new URL("/", nextUrl));
        }
      }

      return true;
    },
  },
};
