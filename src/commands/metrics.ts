import type { Command } from "commander";
import { listAuditEvents } from "../api/audit.ts";
import { getDeliveryMetrics } from "../api/delivery.ts";
import { getEventVolume } from "../api/events.ts";
import { getDailyApiCalls, getDailyMtu } from "../api/usage.ts";
import { compactAuditEvent, defaultEnd, defaultStart } from "../compact.ts";
import { formatAuditEvents } from "../formatters/audit.ts";
import { formatDeliveryMetrics } from "../formatters/delivery.ts";
import { formatVolume } from "../formatters/events.ts";
import { formatApiCallUsage, formatMtuUsage } from "../formatters/usage.ts";
import { fail, output, program } from "../index.ts";
import { resolveAll } from "../resolver.ts";

export function register(prog: Command) {
  // --- Delivery ---
  prog
    .command("delivery <type>")
    .description(
      "Delivery metrics. Types: egress, egress-failed, filtered-source, filtered-dest, ingress, ingress-failed",
    )
    .requiredOption("--source <sourceId>", "Source ID (required)")
    .option("--destination <destId>", "Destination config ID (required for egress/filtered-dest)")
    .option("--start <date>", "Start date (ISO)")
    .option("--end <date>", "End date (ISO)")
    .option("--granularity <g>", "DAY, HOUR, or MINUTE", "DAY")
    .action(async (type: string, opts: any) => {
      try {
        const typeMap: Record<string, string> = {
          ingress: "ingress-success",
          "ingress-failed": "ingress-failed",
          egress: "successful-delivery",
          "egress-failed": "failed-delivery",
          "filtered-source": "filtered-at-source",
          "filtered-dest": "filtered-at-destination",
        };
        const apiType = typeMap[type];
        if (!apiType) {
          throw new Error(`Unknown type: ${type}. Use: ${Object.keys(typeMap).join(", ")}`);
        }
        const data = await getDeliveryMetrics(apiType as any, {
          sourceId: opts.source,
          destinationConfigId: opts.destination,
          startTime: opts.start || defaultStart(),
          endTime: opts.end || defaultEnd(),
          granularity: opts.granularity,
        });
        output(data, formatDeliveryMetrics(data, type), (d: any) => d);
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Volume ---
  prog
    .command("volume")
    .description("Event volume (last 7 days by default)")
    .option("--source <sourceId>", "Filter by source ID")
    .option("--start <date>", "Start date")
    .option("--end <date>", "End date")
    .option("--group-by <field>", "Group by: eventName, eventType, source")
    .action(async (opts: any) => {
      try {
        const data = await getEventVolume({
          startTime: opts.start || defaultStart(),
          endTime: opts.end || defaultEnd(),
          sourceId: opts.source,
          groupBy: opts.groupBy,
        });
        const results = data.data?.result || [];
        output(results, formatVolume(results), (r: any) => ({
          eventName: r.eventName,
          total: r.total,
        }));
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Audit ---
  prog
    .command("audit")
    .description("List audit events (violations, changes, user actions)")
    .option("--type <type>", "Filter by event type")
    .option("--resource <id>", "Filter by resource ID")
    .option("--resource-type <type>", "Filter by resource type")
    .option("--start <date>", "Start time (ISO)")
    .option("--end <date>", "End time (ISO)")
    .action(async (opts: any) => {
      try {
        let events: any[] = await listAuditEvents({
          startTime: opts.start,
          endTime: opts.end,
          resourceId: opts.resource,
          resourceType: opts.resourceType,
        });
        if (opts.type) {
          events = events.filter((e) => e.type.toLowerCase().includes(opts.type.toLowerCase()));
        }
        if (program.opts().resolve) events = await resolveAll(events);
        output(events, formatAuditEvents(events), compactAuditEvent);
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Usage ---
  const usageCmd = prog
    .command("usage")
    .description("API call usage (current month by default)")
    .option("--period <date>", "Month start date (YYYY-MM-01)")
    .action(async (opts: any) => {
      try {
        const period = opts.period || `${new Date().toISOString().slice(0, 8)}01`;
        const data = await getDailyApiCalls(period);
        output(data, formatApiCallUsage(data), (d: any) => ({
          timestamp: d.timestamp,
          apiCalls: d.apiCalls,
          sourceId: d.sourceId,
        }));
      } catch (e: any) {
        fail(e);
      }
    });

  usageCmd
    .command("mtu")
    .description("Monthly Tracked Users")
    .option("--period <date>", "Month start date (YYYY-MM-01)")
    .action(async (opts: any) => {
      try {
        const period = opts.period || `${new Date().toISOString().slice(0, 8)}01`;
        const data = await getDailyMtu(period);
        output(data, formatMtuUsage(data), (d: any) => ({
          timestamp: d.timestamp,
          anonymous: d.anonymous,
          identified: d.identified,
          sourceId: d.sourceId,
        }));
      } catch (e: any) {
        fail(e);
      }
    });
}
