import chalk from "chalk";
import type { Source } from "../api/sources.ts";

export function formatSources(sources: Source[]): string {
  if (sources.length === 0) return chalk.yellow("No sources found.");
  const lines = sources.map((s) => {
    const status = s.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const labels = s.labels?.map((l) => `${l.key}:${l.value}`).join(", ") || "";
    return `  ${status} ${chalk.bold(s.name.padEnd(45))} ${chalk.dim(s.id)} ${chalk.dim(labels)}`;
  });
  return `${chalk.bold(`Sources (${sources.length}):`)}\n${lines.join("\n")}`;
}

export function formatSource(s: Source): string {
  const lines = [
    `${chalk.bold("Name:")}       ${s.name}`,
    `${chalk.bold("ID:")}         ${s.id}`,
    `${chalk.bold("Slug:")}       ${s.slug}`,
    `${chalk.bold("Enabled:")}    ${s.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Write Keys:")} ${s.writeKeys?.join(", ") || "none"}`,
  ];
  if (s.metadata) {
    lines.push(`${chalk.bold("Type:")}       ${s.metadata.name}`);
    lines.push(`${chalk.bold("Categories:")} ${s.metadata.categories?.join(", ") || "none"}`);
  }
  if (s.labels?.length > 0) {
    lines.push(
      `${chalk.bold("Labels:")}     ${s.labels.map((l) => `${l.key}:${l.value}`).join(", ")}`,
    );
  }
  return lines.join("\n");
}
