import chalk from "chalk";
import type { Destination, DestinationFilter } from "../api/destinations.ts";

export function formatDestinations(destinations: Destination[]): string {
  if (destinations.length === 0) return chalk.yellow("No destinations found.");
  const lines = destinations.map((d) => {
    const status = d.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const type = chalk.dim(`[${d.metadata?.name || "unknown"}]`);
    const name = d.name || d.metadata?.name || "unnamed";
    return `  ${status} ${chalk.bold(name.padEnd(50))} ${type} ${chalk.dim(d.id)}`;
  });
  return `${chalk.bold(`Destinations (${destinations.length}):`)}\n${lines.join("\n")}`;
}

export function formatDestination(d: Destination): string {
  return [
    `${chalk.bold("Name:")}     ${d.name}`,
    `${chalk.bold("ID:")}       ${d.id}`,
    `${chalk.bold("Enabled:")}  ${d.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Type:")}     ${d.metadata?.name || "unknown"}`,
    `${chalk.bold("Source:")}   ${d.sourceId}`,
  ].join("\n");
}

export function formatFilters(filters: DestinationFilter[]): string {
  if (filters.length === 0) return chalk.yellow("No filters found.");
  const lines = filters.map((f) => {
    const status = f.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const actions = f.actions.map((a) => a.type).join(", ");
    return `  ${status} ${chalk.bold(f.title.padEnd(40))} ${chalk.dim(actions)}\n       ${chalk.dim(`if: ${f.if}`)}`;
  });
  return `${chalk.bold(`Filters (${filters.length}):`)}\n${lines.join("\n")}`;
}
