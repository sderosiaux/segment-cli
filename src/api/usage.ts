import { segmentGetAll } from "../client.ts";

export interface DailyApiCallUsage {
  timestamp: string;
  apiCalls: string;
  sourceId?: string;
}

export interface DailyMtuUsage {
  timestamp: string;
  anonymous: string;
  anonymousIdentified: string;
  identified: string;
  neverIdentified: string;
  sourceId?: string;
  periodStart?: string;
  periodEnd?: string;
}

export async function getDailyApiCalls(period: string): Promise<DailyApiCallUsage[]> {
  return segmentGetAll<DailyApiCallUsage>(
    "/usage/api-calls/sources/daily",
    "dailyPerSourceAPICallsUsage",
    { period },
  );
}

export async function getDailyMtu(period: string): Promise<DailyMtuUsage[]> {
  return segmentGetAll<DailyMtuUsage>("/usage/mtu/sources/daily", "dailyPerSourceMTUUsage", {
    period,
  });
}
