import { segmentGet, segmentGetAll } from "../client.ts";

export interface Transformation {
  id: string;
  name: string;
  sourceId: string;
  destinationMetadataId?: string;
  destinationId?: string;
  enabled: boolean;
  if: string;
  drop: boolean;
  newEventName?: string;
  propertyRenames: { oldName: string; newName: string }[];
  propertyValueTransformations: { propertyPath: string; propertyValue: string }[];
  propertyDrops: string[];
  allowProperties: string[];
}

export async function listTransformations(): Promise<Transformation[]> {
  return await segmentGetAll<Transformation>("/transformations", "transformations");
}

export async function getTransformation(id: string): Promise<Transformation> {
  const data = await segmentGet<{ transformation: Transformation }>(`/transformations/${id}`);
  return data.transformation;
}
