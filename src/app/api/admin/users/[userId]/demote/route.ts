import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const session = await auth();
    const { userId } = await params;

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Prevent self-demotion
    if (userId === session.user.id) {
      return NextResponse.json(
        { message: "You cannot demote yourself" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "User is not an admin" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: "APPROVED",
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_DEMOTED",
        resource: "user",
        resourceId: userId,
        metadata: { targetUser: user.email },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error demoting user:", error);
    return NextResponse.json(
      { message: "Failed to demote user" },
      { status: 500 }
    );
  }
}
