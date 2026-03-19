import { segmentGetRaw } from "../client.ts";

export interface EventVolume {
  eventName: string | null;
  total: number;
  series?: { time: string; count: number }[];
}

export async function getEventVolume(params: {
  startTime: string;
  endTime: string;
  granularity?: string;
  groupBy?: string;
  sourceId?: string;
}) {
  const queryParams: Record<string, string> = {
    startTime: params.startTime,
    endTime: params.endTime,
    granularity: params.granularity || "DAY",
  };
  if (params.sourceId) queryParams.sourceId = params.sourceId;
  if (params.groupBy) queryParams["groupBy[]"] = params.groupBy;
  return segmentGetRaw<{ data: { result: EventVolume[]; pagination?: any } }>(
    "/events/volume",
    queryParams,
  );
}
