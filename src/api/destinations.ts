import { segmentGet, segmentGetAll } from "../client.ts";

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
  return segmentGetAll<Destination>("/destinations", "destinations");
}

export async function getDestination(id: string): Promise<Destination> {
  return segmentGet<{ destination: Destination }>("/destinations/" + id).then((d) => d.destination);
}

export async function listDestinationFilters(destinationId: string): Promise<DestinationFilter[]> {
  return segmentGetAll<DestinationFilter>("/destinations/" + destinationId + "/filters", "filters");
}

export async function listDestinationSubscriptions(destinationId: string) {
  return segmentGetAll("/destinations/" + destinationId + "/subscriptions", "subscriptions");
}
