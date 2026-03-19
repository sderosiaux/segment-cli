import chalk from "chalk";
import type { ReverseEtlModel } from "../api/reverse-etl.ts";

export function formatReverseEtlModels(models: ReverseEtlModel[]): string {
  if (models.length === 0) return chalk.yellow("No Reverse ETL models found.");
  const lines = models.map((m) => {
    const status = m.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const col = chalk.dim(`[${m.queryIdentifierColumn}]`);
    return `  ${status} ${chalk.bold(m.name.padEnd(50))} ${col} ${chalk.dim(m.id)}`;
  });
  return `${chalk.bold(`Reverse ETL Models (${models.length}):`)}\n${lines.join("\n")}`;
}

export function formatReverseEtlModel(m: ReverseEtlModel): string {
  const lines = [
    `${chalk.bold("Name:")}       ${m.name}`,
    `${chalk.bold("ID:")}         ${m.id}`,
    `${chalk.bold("Enabled:")}    ${m.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Source:")}     ${m.sourceId}`,
    `${chalk.bold("Identifier:")} ${m.queryIdentifierColumn}`,
  ];
  if (m.description?.trim()) {
    lines.push(`${chalk.bold("Description:")} ${m.description.trim()}`);
  }
  if (m.scheduleStrategy) {
    lines.push(`${chalk.bold("Schedule:")}   ${m.scheduleStrategy}`);
  }
  lines.push(`\n${chalk.bold("Query:")}\n${chalk.dim(m.query)}`);
  return lines.join("\n");
}
