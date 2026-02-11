import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { NextResponse } from "next/server";
import { z } from "zod";

const connectionSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean(),
  dbType: z.enum(["postgres", "clickhouse"]).default("postgres"),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  description: z.string().optional(),
  pgbouncerUrl: z.string().optional(),
  publicHost: z.string().optional(),
  publicPort: z.number().min(1).max(65535).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = connectionSchema.parse(body);

    const connection = await prisma.connection.create({
      data: {
        name: data.name,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        password: encrypt(data.password),
        ssl: data.ssl,
        dbType: data.dbType,
        environment: data.environment,
        color: data.color,
        description: data.description || null,
        pgbouncerUrl: data.pgbouncerUrl || null,
        publicHost: data.publicHost || null,
        publicPort: data.publicPort || null,
        createdBy: session.user.id,
      },
    });

    // Automatically give the creator admin access
    await prisma.userConnection.create({
      data: {
        userId: session.user.id,
        connectionId: connection.id,
        role: "ADMIN",
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CONNECTION_CREATED",
        resource: "connection",
        resourceId: connection.id,
        metadata: { name: data.name },
      },
    });

    return NextResponse.json({ id: connection.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid data", errors: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating connection:", error);
    return NextResponse.json(
      { message: "Failed to create connection" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // If admin, get all connections
    // Otherwise, get only connections the user has access to
    let connections;

    if (session.user.role === "ADMIN") {
      connections = await prisma.connection.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          dbType: true,
          environment: true,
          color: true,
          description: true,
        },
      });
    } else {
      connections = await prisma.connection.findMany({
        where: {
          users: {
            some: {
              userId: session.user.id,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          dbType: true,
          environment: true,
          color: true,
          description: true,
        },
      });
    }

    return NextResponse.json(connections);
  } catch (error) {
    console.error("Error fetching connections:", error);
    return NextResponse.json(
      { message: "Failed to fetch connections" },
      { status: 500 }
    );
  }
}
