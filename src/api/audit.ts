import { segmentGetAll } from "../client.ts";

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: string;
  actor: string;
  actorEmail?: string;
  resourceId: string;
  resourceType: string;
  resourceName: string;
}

export async function listAuditEvents(params?: {
  startTime?: string;
  endTime?: string;
  resourceId?: string;
  resourceType?: string;
}): Promise<AuditEvent[]> {
  const queryParams: Record<string, string> = {};
  if (params?.startTime) queryParams.startTime = params.startTime;
  if (params?.endTime) queryParams.endTime = params.endTime;
  if (params?.resourceId) queryParams.resourceId = params.resourceId;
  if (params?.resourceType) queryParams.resourceType = params.resourceType;
  return await segmentGetAll<AuditEvent>("/audit-events", "events", queryParams);
}
