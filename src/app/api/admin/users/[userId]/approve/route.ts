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

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: "APPROVED",
        approvedAt: new Date(),
        approvedBy: session.user.id,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "USER_APPROVED",
        resource: "user",
        resourceId: userId,
        metadata: { targetUser: user.email },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error approving user:", error);
    return NextResponse.json(
      { message: "Failed to approve user" },
      { status: 500 }
    );
  }
}
