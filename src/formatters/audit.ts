import chalk from "chalk";
import type { AuditEvent } from "../api/audit.ts";

export function formatAuditEvents(events: AuditEvent[]): string {
  if (events.length === 0) return chalk.yellow("No audit events found.");
  const lines = events.map((e) => {
    const date = new Date(e.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const actor = e.actorEmail || e.actor || "system";
    const typeColor =
      e.type === "Violations Detected"
        ? chalk.red(e.type)
        : e.type.includes("Disabled")
          ? chalk.yellow(e.type)
          : chalk.white(e.type);
    return `  ${chalk.dim(date.padEnd(18))} ${typeColor}\n${" ".repeat(20)}${chalk.blue(actor)} ${chalk.dim(`${e.resourceType}: ${e.resourceName}`)}`;
  });
  return `${chalk.bold(`Audit Events (${events.length}):`)}\n${lines.join("\n")}`;
}
