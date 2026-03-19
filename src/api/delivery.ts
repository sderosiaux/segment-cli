import { segmentGetRaw } from "../client.ts";

export type DeliveryType =
  | "failed-delivery"
  | "successful-delivery"
  | "ingress-failed"
  | "ingress-success"
  | "filtered-at-source"
  | "filtered-at-destination";

export async function getDeliveryMetrics(
  type: DeliveryType,
  params: {
    sourceId: string;
    destinationConfigId?: string;
    startTime: string;
    endTime: string;
    granularity?: string;
  },
) {
  const queryParams: Record<string, string> = {
    sourceId: params.sourceId,
    startTime: params.startTime,
    endTime: params.endTime,
    granularity: params.granularity || "DAY",
  };
  if (params.destinationConfigId) queryParams.destinationConfigId = params.destinationConfigId;
  return await segmentGetRaw<any>(`/delivery-overview/${type}`, queryParams);
}
