import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET: List user's favorite queries
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get("connectionId");

    const favorites = await prisma.query.findMany({
      where: {
        userId: session.user.id,
        isFavorite: true,
        ...(connectionId ? { connectionId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ favorites });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    return NextResponse.json(
      { message: "Failed to fetch favorites" },
      { status: 500 }
    );
  }
}

// POST: Toggle favorite status for a query
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { queryId, sql, connectionId, name } = await request.json();

    // If queryId is provided, toggle its favorite status
    if (queryId) {
      const query = await prisma.query.findUnique({
        where: { id: queryId },
      });

      if (!query || query.userId !== session.user.id) {
        return NextResponse.json({ message: "Query not found" }, { status: 404 });
      }

      const updated = await prisma.query.update({
        where: { id: queryId },
        data: {
          isFavorite: !query.isFavorite,
          name: name || query.name,
        },
      });

      return NextResponse.json({ query: updated });
    }

    // Otherwise, create a new favorite query
    if (!sql) {
      return NextResponse.json(
        { message: "SQL is required" },
        { status: 400 }
      );
    }

    const newQuery = await prisma.query.create({
      data: {
        userId: session.user.id,
        connectionId,
        sql: sql.substring(0, 10000),
        name: name || null,
        isFavorite: true,
      },
    });

    return NextResponse.json({ query: newQuery });
  } catch (error) {
    console.error("Error managing favorite:", error);
    return NextResponse.json(
      { message: "Failed to manage favorite" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a query from favorites (or delete it)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { queryId } = await request.json();

    if (!queryId) {
      return NextResponse.json(
        { message: "Query ID is required" },
        { status: 400 }
      );
    }

    const query = await prisma.query.findUnique({
      where: { id: queryId },
    });

    if (!query || query.userId !== session.user.id) {
      return NextResponse.json({ message: "Query not found" }, { status: 404 });
    }

    await prisma.query.delete({
      where: { id: queryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting query:", error);
    return NextResponse.json(
      { message: "Failed to delete query" },
      { status: 500 }
    );
  }
}
