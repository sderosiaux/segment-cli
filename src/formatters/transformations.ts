import chalk from "chalk";
import type { Transformation } from "../api/transformations.ts";

export function formatTransformations(items: Transformation[]): string {
  if (items.length === 0) return chalk.yellow("No transformations found.");
  const lines = items.map((t) => {
    const status = t.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const action = t.drop
      ? chalk.red("DROP")
      : t.newEventName
        ? chalk.blue(`RENAME -> ${t.newEventName}`)
        : t.propertyRenames.length > 0
          ? chalk.cyan("RENAME_PROPS")
          : chalk.dim("PASS");
    return [
      `  ${status} ${chalk.bold(t.name.padEnd(55))} ${action}`,
      `       ${chalk.dim("if: " + t.if)}`,
      `       ${chalk.dim("source: " + t.sourceId)}${t.destinationId ? chalk.dim(" -> dest: " + t.destinationId) : ""}`,
    ].join("\n");
  });
  return `${chalk.bold(`Transformations (${items.length}):`)}\n${lines.join("\n")}`;
}

export function formatTransformation(t: Transformation): string {
  const lines = [
    `${chalk.bold("Name:")}      ${t.name}`,
    `${chalk.bold("ID:")}        ${t.id}`,
    `${chalk.bold("Enabled:")}   ${t.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Condition:")} ${t.if}`,
    `${chalk.bold("Drop:")}      ${t.drop ? chalk.red("yes") : "no"}`,
    `${chalk.bold("Source:")}    ${t.sourceId}`,
  ];
  if (t.destinationId) lines.push(`${chalk.bold("Dest:")}      ${t.destinationId}`);
  if (t.newEventName) lines.push(`${chalk.bold("Rename to:")} ${t.newEventName}`);
  if (t.propertyRenames.length > 0) {
    lines.push(`${chalk.bold("Prop renames:")}`);
    for (const r of t.propertyRenames) lines.push(`  ${r.oldName} -> ${r.newName}`);
  }
  if (t.propertyDrops.length > 0) {
    lines.push(`${chalk.bold("Prop drops:")} ${t.propertyDrops.join(", ")}`);
  }
  return lines.join("\n");
}
