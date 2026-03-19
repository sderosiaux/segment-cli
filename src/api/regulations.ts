import { segmentGetAll } from "../client.ts";

export interface Regulation {
  id: string;
  workspaceId: string;
  overallStatus: string;
  createdAt: string;
  regulateRequest?: { subjectType: string; subjectIds: string[]; regulationType: string };
}

export async function listRegulations(): Promise<Regulation[]> {
  return segmentGetAll<Regulation>("/regulations", "regulations");
}

export async function listSuppressions() {
  return segmentGetAll("/suppressions", "suppressions");
}
