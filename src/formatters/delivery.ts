import chalk from "chalk";

export function formatDeliveryMetrics(data: any, type: string): string {
  const total = data?.data?.total;
  const dataset = data?.data?.dataset;
  if (!dataset || dataset.length === 0) return chalk.yellow(`No ${type} delivery data found.`);
  const lines: string[] = [];
  for (const entry of dataset) {
    const label = entry.metricName || entry.eventName || "total";
    lines.push(`  ${chalk.bold(label)}: ${(entry.total ?? 0).toLocaleString()}`);
    if (entry.series?.length) {
      for (const s of entry.series) {
        const date = s.time.split("T")[0];
        lines.push(`    ${chalk.dim(date)} ${s.count.toLocaleString()}`);
      }
    }
  }
  const header =
    total != null ? `Delivery ${type} (total: ${total.toLocaleString()})` : `Delivery ${type}`;
  return `${chalk.bold(`${header}:`)}\n${lines.join("\n")}`;
}
