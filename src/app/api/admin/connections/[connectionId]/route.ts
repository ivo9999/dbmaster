import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { closePool } from "@/lib/db";
import { closeClickHouseClient } from "@/lib/clickhouse";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().optional(),
  ssl: z.boolean(),
  dbType: z.enum(["postgres", "clickhouse"]).optional(),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  description: z.string().optional(),
  pgbouncerUrl: z.string().optional(),
  publicHost: z.string().optional(),
  publicPort: z.number().min(1).max(65535).optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    const { connectionId } = await params;

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json({ message: "Connection not found" }, { status: 404 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    // Close existing pool/client if connection settings changed
    await closePool(connectionId);
    await closeClickHouseClient(connectionId);

    await prisma.connection.update({
      where: { id: connectionId },
      data: {
        name: data.name,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        // Only update password if provided
        ...(data.password && { password: encrypt(data.password) }),
        ssl: data.ssl,
        ...(data.dbType && { dbType: data.dbType }),
        environment: data.environment,
        color: data.color,
        description: data.description || null,
        pgbouncerUrl: data.pgbouncerUrl || null,
        publicHost: data.publicHost || null,
        publicPort: data.publicPort || null,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CONNECTION_UPDATED",
        resource: "connection",
        resourceId: connectionId,
        metadata: { name: data.name },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid data", errors: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating connection:", error);
    return NextResponse.json(
      { message: "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const session = await auth();
    const { connectionId } = await params;

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json({ message: "Connection not found" }, { status: 404 });
    }

    // Close any existing pool/client
    await closePool(connectionId);
    await closeClickHouseClient(connectionId);

    // Delete the connection (cascades to userConnections and branches)
    await prisma.connection.delete({
      where: { id: connectionId },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CONNECTION_DELETED",
        resource: "connection",
        resourceId: connectionId,
        metadata: { name: connection.name },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting connection:", error);
    return NextResponse.json(
      { message: "Failed to delete connection" },
      { status: 500 }
    );
  }
}
