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
  return segmentGetAll<Source>("/sources", "sources");
}

export async function getSource(id: string): Promise<Source> {
  return segmentGet<{ source: Source }>("/sources/" + id).then((d) => d.source);
}

export async function getSourceConnectedDestinations(sourceId: string) {
  return segmentGetAll("/sources/" + sourceId + "/connected-destinations", "destinations");
}

export async function getSourceSchemaSettings(sourceId: string) {
  return segmentGet("/sources/" + sourceId + "/schema-settings");
}
