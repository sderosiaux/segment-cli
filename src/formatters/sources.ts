import chalk from "chalk";
import type { Source } from "../api/sources.ts";
import type { Transformation } from "../api/transformations.ts";

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

function formatTransformAction(t: Transformation): string {
  if (t.drop) return chalk.red("DROP");
  if (t.newEventName) return chalk.blue(`RENAME -> ${t.newEventName}`);
  return chalk.dim("PASS");
}

export function formatSourceEnrichment(parts: {
  source: Source;
  volume?: { last7days: number };
  dests?: any[];
  transforms?: Transformation[];
  schema?: any;
}): string {
  const fmtParts = [formatSource(parts.source)];

  if (parts.volume) {
    fmtParts.push(
      `\n${chalk.bold("Volume (7d):")} ${parts.volume.last7days.toLocaleString()} events`,
    );
  }
  if (parts.dests) {
    const destLines = parts.dests.map((d: any) => {
      const status = d.enabled ? chalk.green("ON ") : chalk.red("OFF");
      return `  ${status} ${d.name || d.metadata?.name || "unnamed"}`;
    });
    fmtParts.push(
      `\n${chalk.bold(`Connected Destinations (${parts.dests.length}):`)}\n${destLines.join("\n")}`,
    );
  }
  if (parts.transforms && parts.transforms.length > 0) {
    const tLines = parts.transforms.map((t) => {
      const status = t.enabled ? chalk.green("ON ") : chalk.red("OFF");
      return `  ${status} ${t.name} ${formatTransformAction(t)}`;
    });
    fmtParts.push(
      `\n${chalk.bold(`Transformations (${parts.transforms.length}):`)}\n${tLines.join("\n")}`,
    );
  }
  if (parts.schema) {
    fmtParts.push(`\n${chalk.bold("Schema Settings:")}\n${JSON.stringify(parts.schema, null, 2)}`);
  }

  return fmtParts.join("\n");
}
