import { segmentGet, segmentGetRaw, segmentPatch } from "../client.ts";

export interface ReverseEtlModel {
  id: string;
  sourceId: string;
  name: string;
  description?: string;
  enabled: boolean;
  query: string;
  queryIdentifierColumn: string;
  scheduleStrategy?: string;
  scheduleConfig?: Record<string, any>;
}

export async function listReverseEtlModels(): Promise<ReverseEtlModel[]> {
  // API returns key "models" not "reverseEtlModels"
  const res = await segmentGetRaw<any>("/reverse-etl-models", { "pagination[count]": "200" });
  return res?.data?.models ?? [];
}

export async function getReverseEtlModel(id: string): Promise<ReverseEtlModel> {
  const data = await segmentGet<{ reverseEtlModel: ReverseEtlModel }>(`/reverse-etl-models/${id}`);
  return data.reverseEtlModel;
}

export async function updateReverseEtlModel(
  id: string,
  updates: { name?: string; query?: string; enabled?: boolean; description?: string },
): Promise<ReverseEtlModel> {
  const data = await segmentPatch<{ reverseEtlModel: ReverseEtlModel }>(
    `/reverse-etl-models/${id}`,
    updates,
  );
  return data.reverseEtlModel;
}
