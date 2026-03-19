import chalk from "chalk";
import type { DailyApiCallUsage, DailyMtuUsage } from "../api/usage.ts";

export function formatApiCallUsage(data: DailyApiCallUsage[]): string {
  if (data.length === 0) return chalk.yellow("No API call usage data.");
  const bySource: Record<string, number> = {};
  for (const d of data) {
    const key = d.sourceId || "total";
    bySource[key] = (bySource[key] || 0) + parseInt(d.apiCalls, 10);
  }
  const total = Object.values(bySource).reduce((s, v) => s + v, 0);
  const lines = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `  ${count.toLocaleString().padStart(12)} ${chalk.dim(name)}`);
  return `${chalk.bold(`API Calls (total: ${total.toLocaleString()}):`)}\n${lines.join("\n")}`;
}

export function formatMtuUsage(data: DailyMtuUsage[]): string {
  if (data.length === 0) return chalk.yellow("No MTU usage data.");
  const bySource: Record<string, { anonymous: number; identified: number }> = {};
  for (const d of data) {
    const key = d.sourceId || "total";
    if (!bySource[key]) bySource[key] = { anonymous: 0, identified: 0 };
    bySource[key].anonymous = Math.max(bySource[key].anonymous, parseInt(d.anonymous || "0", 10));
    bySource[key].identified = Math.max(
      bySource[key].identified,
      parseInt(d.identified || "0", 10),
    );
  }
  const lines = Object.entries(bySource)
    .sort((a, b) => b[1].anonymous + b[1].identified - (a[1].anonymous + a[1].identified))
    .map(([name, counts]) => {
      const total = counts.anonymous + counts.identified;
      return `  ${total.toLocaleString().padStart(12)} ${chalk.dim(name)} ${chalk.dim(`(anon: ${counts.anonymous.toLocaleString()}, id: ${counts.identified.toLocaleString()})`)}`;
    });
  const grandTotal = Object.values(bySource).reduce((s, v) => s + v.anonymous + v.identified, 0);
  return `${chalk.bold(`MTU (total: ${grandTotal.toLocaleString()}):`)}\n${lines.join("\n")}`;
}
