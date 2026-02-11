import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

interface Table {
  name: string;
  schema: string;
  row_count: number;
  size: string;
}

// Simple cache to avoid excessive API calls
const schemaCache = new Map<string, { data: Table[]; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

async function fetchTables(
  connectionId: string,
  database?: string
): Promise<Table[]> {
  const cacheKey = `${connectionId}:${database || "default"}`;
  const cached = schemaCache.get(cacheKey);

  // Return cached data if fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = database
      ? `/api/connections/${connectionId}/databases/${database}/tables`
      : `/api/connections/${connectionId}/databases/list`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const tables = data.tables || [];

    // Cache the result
    schemaCache.set(cacheKey, { data: tables, timestamp: Date.now() });

    return tables;
  } catch (error) {
    console.error("Failed to fetch tables for autocomplete:", error);
    return [];
  }
}

export function createSqlCompletions(
  connectionId: string,
  database?: string
) {
  return async (
    context: CompletionContext
  ): Promise<CompletionResult | null> => {
    // Get word being typed
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) {
      return null;
    }

    // Fetch tables for autocomplete
    const tables = await fetchTables(connectionId, database);

    // Create completion options
    const options = tables.map((table) => ({
      label: table.name,
      type: "table" as const,
      detail: table.schema !== "public" ? table.schema : undefined,
      info: `${table.row_count.toLocaleString()} rows • ${table.size}`,
      boost: table.schema === "public" ? 1 : 0, // Prioritize public schema
    }));

    return {
      from: word.from,
      options,
      validFor: /^\w*$/, // Re-filter as user types
    };
  };
}
