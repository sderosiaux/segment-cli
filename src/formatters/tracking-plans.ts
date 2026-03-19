import chalk from "chalk";
import type { TrackingPlan, TrackingPlanRule } from "../api/tracking-plans.ts";

export function formatTrackingPlans(plans: TrackingPlan[]): string {
  if (plans.length === 0) return chalk.yellow("No tracking plans found.");
  const lines = plans.map((p) => {
    const type = chalk.dim(`[${p.type}]`);
    return `  ${chalk.bold(p.name.padEnd(55))} ${type} ${chalk.dim(p.id)}`;
  });
  return `${chalk.bold(`Tracking Plans (${plans.length}):`)}\n${lines.join("\n")}`;
}

export function formatTrackingPlan(p: TrackingPlan): string {
  return [
    `${chalk.bold("Name:")}    ${p.name}`,
    `${chalk.bold("ID:")}      ${p.id}`,
    `${chalk.bold("Type:")}    ${p.type}`,
    p.description ? `${chalk.bold("Desc:")}    ${p.description}` : "",
    p.updatedAt ? `${chalk.bold("Updated:")} ${p.updatedAt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatRules(rules: TrackingPlanRule[]): string {
  if (rules.length === 0) return chalk.yellow("No rules found.");

  const grouped: Record<string, TrackingPlanRule[]> = {};
  for (const r of rules) {
    const t = r.type || "OTHER";
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(r);
  }

  const sections: string[] = [];
  for (const [type, items] of Object.entries(grouped)) {
    const sorted = items.sort((a, b) => a.key.localeCompare(b.key));
    const lines = sorted.map((r) => {
      const props = r.jsonSchema?.properties ? Object.keys(r.jsonSchema.properties).length : 0;
      const required = r.jsonSchema?.required?.length ?? 0;
      const meta = props > 0 ? chalk.dim(` (${props} props, ${required} required)`) : "";
      return `    ${r.key || "(root)"}${meta}`;
    });
    sections.push(`  ${chalk.bold(type)} (${items.length}):\n${lines.join("\n")}`);
  }

  return `${chalk.bold(`Rules (${rules.length}):`)}\n${sections.join("\n\n")}`;
}
