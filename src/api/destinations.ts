import { segmentDelete, segmentGet, segmentGetAll } from "../client.ts";

export interface Destination {
  id: string;
  name: string;
  enabled: boolean;
  sourceId: string;
  metadata: { name: string; slug: string; description: string };
  settings?: Record<string, any>;
}

export interface DestinationFilter {
  id: string;
  sourceId: string;
  destinationId: string;
  title: string;
  description?: string;
  if: string;
  actions: { type: string; fields?: Record<string, any> }[];
  enabled: boolean;
}

export async function listDestinations(): Promise<Destination[]> {
  return await segmentGetAll<Destination>("/destinations", "destinations");
}

export async function getDestination(id: string): Promise<Destination> {
  const data = await segmentGet<{ destination: Destination }>(`/destinations/${id}`);
  return data.destination;
}

export async function listDestinationFilters(destinationId: string): Promise<DestinationFilter[]> {
  return await segmentGetAll<DestinationFilter>(
    `/destinations/${destinationId}/filters`,
    "filters",
  );
}

export async function listDestinationSubscriptions(destinationId: string) {
  return await segmentGetAll(`/destinations/${destinationId}/subscriptions`, "subscriptions");
}

export async function deleteDestination(id: string): Promise<{ status: string }> {
  return await segmentDelete(`/destinations/${id}`);
}
