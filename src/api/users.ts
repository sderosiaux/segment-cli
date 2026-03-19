import { segmentGet, segmentGetAll } from "../client.ts";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
}

export async function listUsers(): Promise<WorkspaceUser[]> {
  return await segmentGetAll<WorkspaceUser>("/users", "users");
}

export async function getUser(id: string): Promise<WorkspaceUser> {
  const data = await segmentGet<{ user: WorkspaceUser }>(`/users/${id}`);
  return data.user;
}
