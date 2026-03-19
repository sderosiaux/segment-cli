import { listDestinations } from "./api/destinations.ts";
import { listSources } from "./api/sources.ts";

let sourcesCache: Map<string, string> | null = null;
let destsCache: Map<string, string> | null = null;

export async function resolveSourceName(id: string): Promise<string> {
  if (!sourcesCache) {
    const sources = await listSources();
    sourcesCache = new Map(sources.map((s) => [s.id, s.name]));
  }
  return sourcesCache.get(id) || id;
}

export async function resolveDestinationName(id: string): Promise<string> {
  if (!destsCache) {
    const dests = await listDestinations();
    destsCache = new Map(dests.map((d) => [d.id, d.name || d.metadata?.name || d.id]));
  }
  return destsCache.get(id) || id;
}

export async function resolveAll(items: any[]): Promise<any[]> {
  return Promise.all(
    items.map(async (item) => {
      const resolved = { ...item };
      if (resolved.sourceId) resolved.sourceName = await resolveSourceName(resolved.sourceId);
      if (resolved.destinationId)
        resolved.destinationName = await resolveDestinationName(resolved.destinationId);
      return resolved;
    }),
  );
}
