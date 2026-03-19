import chalk from "chalk";
import type { Regulation } from "../api/regulations.ts";

export function formatRegulations(items: Regulation[]): string {
  if (items.length === 0) return chalk.yellow("No regulations found.");
  const lines = items.map((r) => {
    const status =
      r.overallStatus === "FINISHED" ? chalk.green(r.overallStatus) : chalk.yellow(r.overallStatus);
    const type = r.regulateRequest?.regulationType || "unknown";
    const subjects = r.regulateRequest?.subjectIds?.join(", ") || "";
    return `  ${status.padEnd(20)} ${chalk.bold(type.padEnd(15))} ${chalk.dim(subjects)} ${chalk.dim(r.createdAt)}`;
  });
  return `${chalk.bold(`Regulations (${items.length}):`)}\n${lines.join("\n")}`;
}
