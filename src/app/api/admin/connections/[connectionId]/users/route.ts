import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET: List users assigned to a connection
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await context.params;

    const userConnections = await prisma.userConnection.findMany({
      where: { connectionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    return NextResponse.json({ users: userConnections });
  } catch (error) {
    console.error("Error fetching connection users:", error);
    return NextResponse.json(
      { message: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// POST: Add user to connection
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await context.params;
    const { userId, role = "VIEWER" } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { message: "User ID is required" },
        { status: 400 }
      );
    }

    // Check if connection exists
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json(
        { message: "Connection not found" },
        { status: 404 }
      );
    }

    // Check if user exists and is approved
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    if (user.role !== "ADMIN" && user.role !== "APPROVED") {
      return NextResponse.json(
        { message: "User must be approved first" },
        { status: 400 }
      );
    }

    // Create or update user connection
    const userConnection = await prisma.userConnection.upsert({
      where: {
        userId_connectionId: {
          userId,
          connectionId,
        },
      },
      update: { role },
      create: {
        userId,
        connectionId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_ASSIGNED_TO_CONNECTION",
        resource: "connection",
        resourceId: connectionId,
        metadata: { assignedUserId: userId, role },
      },
    });

    return NextResponse.json({ userConnection });
  } catch (error) {
    console.error("Error adding user to connection:", error);
    return NextResponse.json(
      { message: "Failed to add user" },
      { status: 500 }
    );
  }
}

// DELETE: Remove user from connection
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { connectionId } = await context.params;
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { message: "User ID is required" },
        { status: 400 }
      );
    }

    await prisma.userConnection.delete({
      where: {
        userId_connectionId: {
          userId,
          connectionId,
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_REMOVED_FROM_CONNECTION",
        resource: "connection",
        resourceId: connectionId,
        metadata: { removedUserId: userId },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing user from connection:", error);
    return NextResponse.json(
      { message: "Failed to remove user" },
      { status: 500 }
    );
  }
}
