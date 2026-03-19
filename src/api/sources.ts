import { segmentGet, segmentGetAll } from "../client.ts";

export interface Source {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  writeKeys: string[];
  metadata?: { name: string; slug: string; categories: string[] };
  settings?: Record<string, any>;
  labels?: { key: string; value: string }[];
}

export async function listSources(): Promise<Source[]> {
  return await segmentGetAll<Source>("/sources", "sources");
}

export async function getSource(id: string): Promise<Source> {
  const data = await segmentGet<{ source: Source }>(`/sources/${id}`);
  return data.source;
}

export async function getSourceConnectedDestinations(sourceId: string) {
  return await segmentGetAll(`/sources/${sourceId}/connected-destinations`, "destinations");
}

export async function getSourceSchemaSettings(sourceId: string) {
  return await segmentGet(`/sources/${sourceId}/schema-settings`);
}
