import chalk from "chalk";
import type { WorkspaceUser } from "../api/users.ts";

export function formatUsers(users: WorkspaceUser[]): string {
  if (users.length === 0) return chalk.yellow("No users found.");
  const lines = users.map((u) => {
    return `  ${chalk.bold((u.name || "").padEnd(30))} ${chalk.dim((u.email || "").padEnd(40))} ${chalk.dim(u.id)}`;
  });
  return `${chalk.bold(`Users (${users.length}):`)}\n${lines.join("\n")}`;
}
