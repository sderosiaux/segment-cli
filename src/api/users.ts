import { segmentGet, segmentGetAll } from "../client.ts";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
}

export async function listUsers(): Promise<WorkspaceUser[]> {
  return segmentGetAll<WorkspaceUser>("/users", "users");
}

export async function getUser(id: string): Promise<WorkspaceUser> {
  return segmentGet<{ user: WorkspaceUser }>(`/users/${id}`).then((d) => d.user);
}
