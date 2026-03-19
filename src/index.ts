#!/usr/bin/env bun
import chalk from "chalk";
import { Command } from "commander";

export const program = new Command();

program
  .name("segment")
  .description(
    "Segment CLI — read-only access to Segment Public API.\nInspect sources, destinations, tracking plans, transformations, delivery, audit trail.",
  )
  .version("0.1.0")
  .option("--json", "Output as JSON (for LLM/script consumption)")
  .addHelpText(
    "after",
    `
Examples:
  segment sources                                  List all sources
  segment tracking-plans                           List tracking plans
  segment tracking-plans <id> rules                List event schemas
  segment transformations                          List transformations
  segment audit --json | jq '.[]'                  Audit trail as JSON
  segment volume --start 2026-03-01                Event volume

All commands support --json for structured output (no ANSI).
Errors go to stderr with exit code 1.`,
  );

export function isJson(): boolean {
  return program.opts().json === true;
}

export function output(data: unknown, formatted: string) {
  if (isJson()) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatted);
  }
}

export function fail(e: any): never {
  if (isJson()) {
    console.error(JSON.stringify({ error: e.message }));
  } else {
    console.error(chalk.red(e.message));
  }
  process.exit(1);
}

// --- Sources ---
import {
  getSource,
  getSourceConnectedDestinations,
  getSourceSchemaSettings,
  listSources,
} from "./api/sources.ts";
import { formatSource, formatSources } from "./formatters/sources.ts";

const sourcesCmd = program
  .command("sources [id]")
  .description("List sources or get source details")
  .action(async (id: string | undefined) => {
    try {
      if (id) {
        const source = await getSource(id);
        output(source, formatSource(source));
      } else {
        const sources = await listSources();
        output(sources, formatSources(sources));
      }
    } catch (e: any) {
      fail(e);
    }
  });

sourcesCmd
  .command("destinations <sourceId>")
  .description("List destinations connected to a source")
  .action(async (sourceId: string) => {
    try {
      const dests = await getSourceConnectedDestinations(sourceId);
      output(dests, JSON.stringify(dests, null, 2));
    } catch (e: any) {
      fail(e);
    }
  });

sourcesCmd
  .command("schema-settings <sourceId>")
  .description("Show schema validation settings for a source")
  .action(async (sourceId: string) => {
    try {
      const settings = await getSourceSchemaSettings(sourceId);
      output(settings, JSON.stringify(settings, null, 2));
    } catch (e: any) {
      fail(e);
    }
  });

// --- Destinations ---
import {
  getDestination,
  listDestinationFilters,
  listDestinationSubscriptions,
  listDestinations,
} from "./api/destinations.ts";
import { formatDestination, formatDestinations, formatFilters } from "./formatters/destinations.ts";

const destsCmd = program
  .command("destinations [id]")
  .description("List destinations or get destination details")
  .action(async (id: string | undefined) => {
    try {
      if (id) {
        const dest = await getDestination(id);
        output(dest, formatDestination(dest));
      } else {
        const dests = await listDestinations();
        output(dests, formatDestinations(dests));
      }
    } catch (e: any) {
      fail(e);
    }
  });

destsCmd
  .command("filters <destinationId>")
  .description("List filters for a destination")
  .action(async (destinationId: string) => {
    try {
      const filters = await listDestinationFilters(destinationId);
      output(filters, formatFilters(filters));
    } catch (e: any) {
      fail(e);
    }
  });

destsCmd
  .command("subscriptions <destinationId>")
  .description("List subscriptions for a destination")
  .action(async (destinationId: string) => {
    try {
      const subs = await listDestinationSubscriptions(destinationId);
      output(subs, JSON.stringify(subs, null, 2));
    } catch (e: any) {
      fail(e);
    }
  });

// --- Tracking Plans ---
import {
  getTrackingPlan,
  listTrackingPlanRules,
  listTrackingPlanSources,
  listTrackingPlans,
} from "./api/tracking-plans.ts";
import {
  formatRules,
  formatTrackingPlan,
  formatTrackingPlans,
} from "./formatters/tracking-plans.ts";

const tpCmd = program
  .command("tracking-plans [id]")
  .description("List tracking plans or get details")
  .action(async (id: string | undefined) => {
    try {
      if (id) {
        const tp = await getTrackingPlan(id);
        output(tp, formatTrackingPlan(tp));
      } else {
        const plans = await listTrackingPlans();
        output(plans, formatTrackingPlans(plans));
      }
    } catch (e: any) {
      fail(e);
    }
  });

tpCmd
  .command("rules <trackingPlanId>")
  .description("List rules (event schemas) for a tracking plan")
  .action(async (trackingPlanId: string) => {
    try {
      const rules = await listTrackingPlanRules(trackingPlanId);
      output(rules, formatRules(rules));
    } catch (e: any) {
      fail(e);
    }
  });

tpCmd
  .command("sources <trackingPlanId>")
  .description("List sources connected to a tracking plan")
  .action(async (trackingPlanId: string) => {
    try {
      const sources = await listTrackingPlanSources(trackingPlanId);
      output(sources, JSON.stringify(sources, null, 2));
    } catch (e: any) {
      fail(e);
    }
  });

// --- Transformations ---
import { getTransformation, listTransformations } from "./api/transformations.ts";
import { formatTransformation, formatTransformations } from "./formatters/transformations.ts";

program
  .command("transformations [id]")
  .description("List transformations or get details")
  .action(async (id: string | undefined) => {
    try {
      if (id) {
        const t = await getTransformation(id);
        output(t, formatTransformation(t));
      } else {
        const items = await listTransformations();
        output(items, formatTransformations(items));
      }
    } catch (e: any) {
      fail(e);
    }
  });

// --- Delivery + Volume ---
import { getDeliveryMetrics } from "./api/delivery.ts";
import { getEventVolume } from "./api/events.ts";
import { formatDeliveryMetrics } from "./formatters/delivery.ts";
import { formatVolume } from "./formatters/events.ts";

function defaultStart(): string {
  return new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0] + "T00:00:00Z";
}
function defaultEnd(): string {
  return new Date().toISOString().split("T")[0] + "T23:59:59Z";
}

program
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
      output(data, formatDeliveryMetrics(data, type));
    } catch (e: any) {
      fail(e);
    }
  });

program
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
      output(results, formatVolume(results));
    } catch (e: any) {
      fail(e);
    }
  });

// --- Audit ---
import { listAuditEvents } from "./api/audit.ts";
import { formatAuditEvents } from "./formatters/audit.ts";

program
  .command("audit")
  .description("List audit events (violations, changes, user actions)")
  .option("--type <type>", "Filter by event type")
  .option("--resource <id>", "Filter by resource ID")
  .option("--resource-type <type>", "Filter by resource type")
  .option("--start <date>", "Start time (ISO)")
  .option("--end <date>", "End time (ISO)")
  .action(async (opts: any) => {
    try {
      let events = await listAuditEvents({
        startTime: opts.start,
        endTime: opts.end,
        resourceId: opts.resource,
        resourceType: opts.resourceType,
      });
      if (opts.type) {
        events = events.filter((e) => e.type.toLowerCase().includes(opts.type.toLowerCase()));
      }
      output(events, formatAuditEvents(events));
    } catch (e: any) {
      fail(e);
    }
  });

// --- Regulations + Suppressions ---
import { listRegulations, listSuppressions } from "./api/regulations.ts";
import { formatRegulations } from "./formatters/regulations.ts";

program
  .command("regulations")
  .description("List deletion/suppression regulations")
  .action(async () => {
    try {
      const regs = await listRegulations();
      output(regs, formatRegulations(regs));
    } catch (e: any) {
      fail(e);
    }
  });

program
  .command("suppressions")
  .description("List suppressed users")
  .action(async () => {
    try {
      const items = await listSuppressions();
      output(items, JSON.stringify(items, null, 2));
    } catch (e: any) {
      fail(e);
    }
  });

// --- Users ---
import { getUser, listUsers } from "./api/users.ts";
import { formatUsers } from "./formatters/users.ts";

program
  .command("users [id]")
  .description("List workspace users or get user details")
  .action(async (id: string | undefined) => {
    try {
      if (id) {
        const user = await getUser(id);
        output(user, JSON.stringify(user, null, 2));
      } else {
        const users = await listUsers();
        output(users, formatUsers(users));
      }
    } catch (e: any) {
      fail(e);
    }
  });

// --- Usage ---
import { getDailyApiCalls, getDailyMtu } from "./api/usage.ts";
import { formatApiCallUsage, formatMtuUsage } from "./formatters/usage.ts";

const usageCmd = program
  .command("usage")
  .description("API call usage (current month by default)")
  .option("--period <date>", "Month start date (YYYY-MM-01)")
  .action(async (opts: any) => {
    try {
      const period = opts.period || new Date().toISOString().slice(0, 8) + "01";
      const data = await getDailyApiCalls(period);
      output(data, formatApiCallUsage(data));
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
      const period = opts.period || new Date().toISOString().slice(0, 8) + "01";
      const data = await getDailyMtu(period);
      output(data, formatMtuUsage(data));
    } catch (e: any) {
      fail(e);
    }
  });

program.parse();
