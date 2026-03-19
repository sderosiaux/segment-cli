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
  return segmentGetAll<TrackingPlan>("/tracking-plans", "trackingPlans");
}

export async function getTrackingPlan(id: string): Promise<TrackingPlan> {
  return segmentGet<{ trackingPlan: TrackingPlan }>("/tracking-plans/" + id).then(
    (d) => d.trackingPlan,
  );
}

export async function listTrackingPlanRules(id: string): Promise<TrackingPlanRule[]> {
  return segmentGetAll<TrackingPlanRule>("/tracking-plans/" + id + "/rules", "rules");
}

export async function listTrackingPlanSources(id: string) {
  return segmentGetAll("/tracking-plans/" + id + "/sources", "sources");
}
