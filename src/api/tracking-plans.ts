import { segmentGet, segmentGetAll } from "../client.ts";

export interface TrackingPlan {
  id: string;
  name: string;
  slug?: string;
  type: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrackingPlanRule {
  type: string;
  key: string;
  version: number;
  jsonSchema?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export async function listTrackingPlans(): Promise<TrackingPlan[]> {
  return await segmentGetAll<TrackingPlan>("/tracking-plans", "trackingPlans");
}

export async function getTrackingPlan(id: string): Promise<TrackingPlan> {
  const data = await segmentGet<{ trackingPlan: TrackingPlan }>(`/tracking-plans/${id}`);
  return data.trackingPlan;
}

export async function listTrackingPlanRules(id: string): Promise<TrackingPlanRule[]> {
  return await segmentGetAll<TrackingPlanRule>(`/tracking-plans/${id}/rules`, "rules");
}

export async function listTrackingPlanSources(id: string) {
  return await segmentGetAll(`/tracking-plans/${id}/sources`, "sources");
}
