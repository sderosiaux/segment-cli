import chalk from "chalk";
import type { EventVolume } from "../api/events.ts";

function bar(value: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
}

export function formatVolume(results: EventVolume[]): string {
  if (results.length === 0) return chalk.yellow("No event volume data.");
  if (results.length === 1 && !results[0].eventName) {
    return `${chalk.bold("Total events:")} ${results[0].total.toLocaleString()}`;
  }
  const max = Math.max(...results.map((r) => r.total));
  const sorted = [...results].sort((a, b) => b.total - a.total);
  const lines = sorted.map((r) => {
    const name = r.eventName || "(all)";
    const count = r.total.toLocaleString().padStart(12);
    return `  ${count} ${bar(r.total, max)} ${chalk.dim(name)}`;
  });
  return `${chalk.bold(`Event Volume (${results.length} groups):`)}\n${lines.join("\n")}`;
}
