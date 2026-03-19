#!/usr/bin/env bun
import chalk from "chalk";
import { Command } from "commander";
import { resolveAll } from "./resolver.ts";
import { cleanupStaleTap, hasStaleTap, runTap } from "./tap.ts";

export const program = new Command();

program
  .name("segment")
  .description(
    "Segment CLI — read-only access to Segment Public API.\nInspect sources, destinations, tracking plans, transformations, delivery, audit trail.",
  )
  .version("0.1.0")
  .option("--json", "Output as JSON (for LLM/script consumption)")
  .option("--compact", "Strip JSON output to essential fields only (requires --json)")
  .option("--resolve", "Enrich IDs with human-readable names")
  .option("--limit <n>", "Limit array output to N items")
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
  segment overview --json                          Workspace health summary

All commands support --json for structured output (no ANSI).
Use --compact with --json to strip to essential fields.
Use --resolve to enrich IDs with names.
Use --limit <n> to cap array results.`,
  );

export function isJson(): boolean {
  return program.opts().json === true;
}

export function output(data: unknown, formatted: string, compactFn?: (item: any) => any) {
  const limit = Number.parseInt(program.opts().limit, 10);
  let processedData = data;

  if (Array.isArray(processedData)) {
    if (limit > 0) processedData = processedData.slice(0, limit);
    if (program.opts().compact && compactFn) processedData = processedData.map(compactFn);
  } else if (program.opts().compact && compactFn) {
    processedData = compactFn(processedData);
  }

  if (isJson()) {
    console.log(JSON.stringify(processedData, null, 2));
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

// --- Compact functions ---
const compactSource = (s: any) => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  enabled: s.enabled,
  ...(s.volume ? { volume: s.volume } : {}),
  ...(s.dests
    ? {
        connectedDestinations: s.dests.map((d: any) => ({
          name: d.name || d.metadata?.name,
          enabled: d.enabled,
        })),
      }
    : {}),
  ...(s.transforms
    ? { transformations: s.transforms.map((t: any) => ({ name: t.name, drop: t.drop, if: t.if })) }
    : {}),
});

const compactDestination = (d: any) => ({
  id: d.id,
  name: d.name,
  enabled: d.enabled,
  sourceId: d.sourceId,
  type: d.metadata?.name,
});

const compactTrackingPlan = (p: any) => ({
  id: p.id,
  name: p.name,
  type: p.type,
});

const compactRule = (r: any) => ({
  key: r.key,
  type: r.type,
  version: r.version,
});

const compactTransformation = (t: any) => ({
  id: t.id,
  name: t.name,
  enabled: t.enabled,
  sourceId: t.sourceId,
  destinationId: t.destinationId,
  if: t.if,
  drop: t.drop,
  newEventName: t.newEventName,
  ...(t.sourceName ? { sourceName: t.sourceName } : {}),
  ...(t.destinationName ? { destinationName: t.destinationName } : {}),
});

const compactAuditEvent = (e: any) => ({
  id: e.id,
  timestamp: e.timestamp,
  type: e.type,
  actorEmail: e.actorEmail,
  resourceType: e.resourceType,
  resourceName: e.resourceName,
  ...(e.sourceName ? { sourceName: e.sourceName } : {}),
});

const compactUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

const compactRegulation = (r: any) => ({
  id: r.id,
  overallStatus: r.overallStatus,
  createdAt: r.createdAt,
  regulationType: r.regulateRequest?.regulationType,
});

// --- Sources ---
import {
  getSource,
  getSourceConnectedDestinations,
  getSourceSchemaSettings,
  listSources,
} from "./api/sources.ts";
import { formatSourceEnrichment, formatSources } from "./formatters/sources.ts";

const sourcesCmd = program
  .command("sources [id]")
  .description("List sources or get source details (use --all for deep dive)")
  .option("--enabled", "Show only enabled sources")
  .option("--disabled", "Show only disabled sources")
  .option("--volume", "Include event volume (last 7 days)")
  .option("--destinations", "Include connected destinations")
  .option("--transformations", "Include transformations for this source")
  .option("--schema", "Include schema validation settings")
  .option("--all", "Include volume, destinations, transformations, schema")
  .action(async (id: string | undefined, opts: any) => {
    try {
      if (id) {
        await showSourceDetail(id, opts);
      } else {
        let sources = await listSources();
        if (opts.enabled) sources = sources.filter((s) => s.enabled);
        if (opts.disabled) sources = sources.filter((s) => !s.enabled);
        output(sources, formatSources(sources), compactSource);
      }
    } catch (e: any) {
      fail(e);
    }
  });

async function showSourceDetail(id: string, opts: any) {
  const a = opts.all;
  const [source, volume, dests, transforms, schema] = await Promise.all([
    getSource(id),
    a || opts.volume
      ? getEventVolume({ startTime: defaultStart(), endTime: defaultEnd(), sourceId: id })
      : null,
    a || opts.destinations ? getSourceConnectedDestinations(id) : null,
    a || opts.transformations ? listTransformations() : null,
    a || opts.schema ? getSourceSchemaSettings(id).catch(() => null) : null,
  ]);

  const volTotal = volume?.data?.result?.[0]?.total ?? 0;
  const sourceTransforms = transforms?.filter((t) => t.sourceId === id);
  const enrichment = {
    volume: volume ? { last7days: volTotal } : undefined,
    dests: dests ?? undefined,
    transforms: sourceTransforms ?? undefined,
    schema: schema ?? undefined,
  };

  const enriched: any = { ...source, ...enrichment };
  output(enriched, formatSourceEnrichment({ source, ...enrichment }), compactSource);
}

async function showSourceDebug(sourceId: string, opts: any) {
  const minutes = Number.parseInt(opts.period, 10) || 60;
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60000);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [source, volumeByEvent, volumeByType, auditEvents] = await Promise.all([
    getSource(sourceId),
    getEventVolume({
      startTime: startISO,
      endTime: endISO,
      granularity: minutes <= 60 ? "MINUTE" : "HOUR",
      sourceId,
      groupBy: "eventName",
    }),
    getEventVolume({
      startTime: startISO,
      endTime: endISO,
      granularity: minutes <= 60 ? "MINUTE" : "HOUR",
      sourceId,
      groupBy: "eventType",
    }),
    listAuditEvents({ startTime: startISO, endTime: endISO, resourceId: sourceId }),
  ]);

  const topEvents = (volumeByEvent.data?.result ?? [])
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);
  const byType = (volumeByType.data?.result ?? []).sort((a, b) => b.total - a.total);
  const totalEvents = topEvents.reduce((sum, e) => sum + e.total, 0);
  const violations = auditEvents.filter((e) => e.type === "Violations Detected");

  const debugData = {
    source: { id: source.id, name: source.name, enabled: source.enabled },
    period: { minutes, start: startISO, end: endISO },
    totalEvents,
    eventsPerMinute: Math.round(totalEvents / minutes),
    byEventType: byType.map((e) => ({ type: e.eventName, total: e.total })),
    topEvents: topEvents.map((e) => ({ name: e.eventName, total: e.total })),
    violations: violations.length,
  };

  const maxEvt = topEvents[0]?.total ?? 1;
  const barWidth = 30;
  const makeBar = (val: number) => {
    const filled = maxEvt > 0 ? Math.round((val / maxEvt) * barWidth) : 0;
    return "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);
  };

  const fmt = [
    chalk.bold(`Debug: ${source.name}`),
    `${chalk.dim("Period:")} last ${minutes}min (${start.toLocaleTimeString()} - ${end.toLocaleTimeString()})`,
    "",
    `${chalk.bold("Total:")}  ${totalEvents.toLocaleString()} events (${chalk.cyan(`~${debugData.eventsPerMinute}/min`)})`,
    "",
    chalk.bold("By Type:"),
    ...byType.map(
      (e) => `  ${(e.eventName || "unknown").padEnd(12)} ${e.total.toLocaleString().padStart(10)}`,
    ),
    "",
    chalk.bold(`Top Events (${topEvents.length}):`),
    ...topEvents.map(
      (e) =>
        `  ${e.total.toLocaleString().padStart(10)} ${makeBar(e.total)} ${chalk.dim(e.eventName || "(unnamed)")}`,
    ),
  ];

  if (violations.length > 0) {
    fmt.push("", chalk.red.bold(`Violations: ${violations.length}`));
    for (const v of violations) {
      fmt.push(`  ${chalk.dim(v.timestamp)} ${v.type}`);
    }
  }

  output(debugData, fmt.join("\n"), (d: any) => ({
    source: d.source,
    totalEvents: d.totalEvents,
    eventsPerMinute: d.eventsPerMinute,
    topEvents: d.topEvents?.slice(0, 10),
    violations: d.violations,
  }));
}

sourcesCmd
  .command("debug <sourceId>")
  .description("Live diagnostic: top events, volume trend, violations (last hour)")
  .option("--period <minutes>", "Lookback period in minutes", "60")
  .action(async (sourceId: string, opts: any) => {
    try {
      await showSourceDebug(sourceId, opts);
    } catch (e: any) {
      fail(e);
    }
  });

sourcesCmd
  .command("tap <sourceId>")
  .description("Live event stream via temporary webhook (requires cloudflared)")
  .action(async (sourceId: string) => {
    try {
      await runTap(sourceId, { json: isJson() });
    } catch (e: any) {
      fail(e);
    }
  });

sourcesCmd
  .command("tap-cleanup")
  .description("Manually cleanup a stale tap destination (crash recovery)")
  .action(async () => {
    try {
      const cleaned = await cleanupStaleTap();
      if (!cleaned) console.log(chalk.green("No stale tap found."));
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
      output(dests, JSON.stringify(dests, null, 2), compactDestination);
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
  .description("List destinations or get destination details (use --all for deep dive)")
  .option("--enabled", "Show only enabled destinations")
  .option("--disabled", "Show only disabled destinations")
  .option("--filters", "Include destination filters")
  .option("--subscriptions", "Include subscriptions")
  .option("--all", "Include filters and subscriptions")
  .action(async (id: string | undefined, opts: any) => {
    try {
      if (id) {
        const wantAll = opts.all;
        const wantFilters = wantAll || opts.filters;
        const wantSubs = wantAll || opts.subscriptions;

        const [dest, filters, subs] = await Promise.all([
          getDestination(id),
          wantFilters ? listDestinationFilters(id).catch(() => null) : null,
          wantSubs ? listDestinationSubscriptions(id).catch(() => null) : null,
        ]);

        const enriched: any = { ...dest };
        const fmtParts = [formatDestination(dest)];

        if (filters) {
          enriched.filters = filters;
          fmtParts.push(`\n${formatFilters(filters)}`);
        }
        if (subs) {
          enriched.subscriptions = subs;
          fmtParts.push(
            `\n${chalk.bold(`Subscriptions (${subs.length}):`)}\n${JSON.stringify(subs, null, 2)}`,
          );
        }

        output(enriched, fmtParts.join("\n"), compactDestination);
      } else {
        let dests = await listDestinations();
        if (opts.enabled) dests = dests.filter((d) => d.enabled);
        if (opts.disabled) dests = dests.filter((d) => !d.enabled);
        output(dests, formatDestinations(dests), compactDestination);
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
      let filters = await listDestinationFilters(destinationId);
      if (program.opts().resolve) filters = (await resolveAll(filters)) as any;
      output(filters, formatFilters(filters), (f: any) => ({
        id: f.id,
        title: f.title,
        enabled: f.enabled,
        if: f.if,
        actions: f.actions?.map((a: any) => a.type),
      }));
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
        output(tp, formatTrackingPlan(tp), compactTrackingPlan);
      } else {
        const plans = await listTrackingPlans();
        output(plans, formatTrackingPlans(plans), compactTrackingPlan);
      }
    } catch (e: any) {
      fail(e);
    }
  });

tpCmd
  .command("rules <trackingPlanId>")
  .description("List rules (event schemas) for a tracking plan")
  .option("--type <type>", "Filter by rule type (TRACK, IDENTIFY, GROUP, PAGE, SCREEN)")
  .action(async (trackingPlanId: string, opts: any) => {
    try {
      let rules = await listTrackingPlanRules(trackingPlanId);
      if (opts.type) rules = rules.filter((r) => r.type.toUpperCase() === opts.type.toUpperCase());
      output(rules, formatRules(rules), compactRule);
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
      output(sources, JSON.stringify(sources, null, 2), compactSource);
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
  .option("--source <id>", "Filter by source ID")
  .action(async (id: string | undefined, opts: any) => {
    try {
      if (id) {
        let t: any = await getTransformation(id);
        if (program.opts().resolve) t = (await resolveAll([t]))[0];
        output(t, formatTransformation(t), compactTransformation);
      } else {
        let items: any[] = await listTransformations();
        if (opts.source) items = items.filter((t) => t.sourceId === opts.source);
        if (program.opts().resolve) items = await resolveAll(items);
        output(items, formatTransformations(items), compactTransformation);
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
  return `${new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]}T00:00:00Z`;
}
function defaultEnd(): string {
  return `${new Date().toISOString().split("T")[0]}T23:59:59Z`;
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
      output(data, formatDeliveryMetrics(data, type), (d: any) => d);
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
      output(results, formatVolume(results), (r: any) => ({
        eventName: r.eventName,
        total: r.total,
      }));
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

// --- Regulations + Suppressions ---
import { listRegulations, listSuppressions } from "./api/regulations.ts";
import { formatRegulations } from "./formatters/regulations.ts";

program
  .command("regulations")
  .description("List deletion/suppression regulations")
  .action(async () => {
    try {
      const regs = await listRegulations();
      output(regs, formatRegulations(regs), compactRegulation);
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
        output(user, JSON.stringify(user, null, 2), compactUser);
      } else {
        const users = await listUsers();
        output(users, formatUsers(users), compactUser);
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

// --- Overview ---
program
  .command("overview")
  .description(
    "Workspace health: active sources, destinations, violations, volume, transformations",
  )
  .action(async () => {
    try {
      const [sources, destinations, transformations, plans, auditEvents, volumeData] =
        await Promise.all([
          listSources(),
          listDestinations(),
          listTransformations(),
          listTrackingPlans(),
          listAuditEvents(),
          getEventVolume({ startTime: defaultStart(), endTime: defaultEnd() }),
        ]);

      const violations = auditEvents.filter((e) => e.type === "Violations Detected");
      const volume = volumeData.data?.result?.[0]?.total ?? 0;

      const overview = {
        sources: {
          total: sources.length,
          active: sources.filter((s) => s.enabled).length,
          inactive: sources.filter((s) => !s.enabled).length,
          list: sources.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name })),
        },
        destinations: {
          total: destinations.length,
          active: destinations.filter((d) => d.enabled).length,
          inactive: destinations.filter((d) => !d.enabled).length,
        },
        trackingPlans: {
          total: plans.length,
          list: plans.map((p) => ({ id: p.id, name: p.name })),
        },
        transformations: {
          total: transformations.length,
          active: transformations.filter((t) => t.enabled).length,
          dropping: transformations.filter((t) => t.drop).length,
        },
        violations: {
          recent: violations.length,
          sources: [...new Set(violations.map((v) => v.resourceName))],
        },
        volume: {
          last7days: volume,
        },
      };

      const fmt = [
        chalk.bold("Workspace Overview"),
        "",
        `${chalk.bold("Sources:")}         ${overview.sources.active} active / ${overview.sources.total} total`,
        `${chalk.bold("Destinations:")}    ${overview.destinations.active} active / ${overview.destinations.total} total`,
        `${chalk.bold("Tracking Plans:")} ${overview.trackingPlans.total}`,
        `${chalk.bold("Transformations:")} ${overview.transformations.active} active (${overview.transformations.dropping} dropping)`,
        `${chalk.bold("Violations:")}     ${overview.violations.recent} recent${overview.violations.sources.length > 0 ? ` on: ${overview.violations.sources.join(", ")}` : ""}`,
        `${chalk.bold("Volume (7d):")}    ${overview.volume.last7days.toLocaleString()} events`,
      ].join("\n");

      output(overview, fmt, (d: any) => d);
    } catch (e: any) {
      fail(e);
    }
  });

// --- Reverse ETL ---
import { getReverseEtlModel, listReverseEtlModels } from "./api/reverse-etl.ts";
import { formatReverseEtlModel, formatReverseEtlModels } from "./formatters/reverse-etl.ts";

const compactReverseEtlModel = (m: any) => ({
  id: m.id,
  name: m.name,
  sourceId: m.sourceId,
  enabled: m.enabled,
  queryIdentifierColumn: m.queryIdentifierColumn,
  ...(m.sourceName ? { sourceName: m.sourceName } : {}),
});

const retlCmd = program
  .command("reverse-etl [id]")
  .description("List Reverse ETL models or get details (includes SQL query)")
  .action(async (id: string | undefined) => {
    try {
      if (id) {
        let model: any = await getReverseEtlModel(id);
        if (program.opts().resolve) model = (await resolveAll([model]))[0];
        output(model, formatReverseEtlModel(model), compactReverseEtlModel);
      } else {
        let models: any[] = await listReverseEtlModels();
        if (program.opts().resolve) models = await resolveAll(models);
        output(models, formatReverseEtlModels(models), compactReverseEtlModel);
      }
    } catch (e: any) {
      fail(e);
    }
  });

retlCmd
  .command("subscriptions <modelId>")
  .description("List destination subscriptions (mappings) linked to a Reverse ETL model")
  .action(async (modelId: string) => {
    try {
      const model = await getReverseEtlModel(modelId);
      // Find destinations that have subscriptions referencing this model
      const allDests = await listDestinations();
      const results: any[] = [];

      for (const dest of allDests) {
        const subs = await listDestinationSubscriptions(dest.id).catch(() => []);
        const matching = (subs as any[]).filter((s: any) => s.modelId === modelId);
        for (const s of matching) {
          results.push({
            ...s,
            destinationId: dest.id,
            destinationName: dest.name || dest.metadata?.name,
          });
        }
      }

      if (results.length === 0) {
        output([], chalk.yellow("No subscriptions found for this model."));
      } else {
        const lines = results.map((s: any) => {
          const status = s.enabled ? chalk.green("ON ") : chalk.red("OFF");
          return `  ${status} ${chalk.bold(s.name)} ${chalk.dim(`[${s.actionSlug}]`)}\n       → ${chalk.dim(s.destinationName)} ${chalk.dim(s.id)}`;
        });
        const fmt = `${chalk.bold(`Subscriptions for "${model.name}" (${results.length}):`)}\n${lines.join("\n")}`;
        output(results, fmt);
      }
    } catch (e: any) {
      fail(e);
    }
  });

// --- Protocols (governance composite commands) ---

program
  .command("violations")
  .description("Recent schema violations (shortcut for audit --type violations)")
  .option("--source <name>", "Filter by source name (substring match)")
  .action(async (opts: any) => {
    try {
      let events = await listAuditEvents();
      events = events.filter((e) => e.type === "Violations Detected");
      if (opts.source) {
        events = events.filter((e) =>
          e.resourceName.toLowerCase().includes(opts.source.toLowerCase()),
        );
      }
      // Apply global --limit
      const globalLimit = Number.parseInt(program.opts().limit, 10);
      if (globalLimit > 0) events = events.slice(0, globalLimit);

      // Group by source for summary
      const bySource: Record<string, number> = {};
      for (const e of events) {
        bySource[e.resourceName] = (bySource[e.resourceName] || 0) + 1;
      }

      const data = {
        total: events.length,
        bySource,
        events,
      };

      const fmtLines = [
        chalk.bold(`Violations (${events.length}):`),
        "",
        chalk.bold("By Source:"),
        ...Object.entries(bySource)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `  ${String(count).padStart(4)} ${name}`),
        "",
        chalk.bold("Timeline:"),
        ...events.slice(0, 20).map((e) => {
          const date = new Date(e.timestamp).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          return `  ${chalk.dim(date.padEnd(18))} ${e.resourceName}`;
        }),
      ];

      output(data, fmtLines.join("\n"), (d: any) => ({
        total: d.total,
        bySource: d.bySource,
      }));
    } catch (e: any) {
      fail(e);
    }
  });

program
  .command("coverage")
  .description("Tracking Plan coverage: which sources are covered by which plans")
  .action(async () => {
    try {
      const [sources, plans] = await Promise.all([listSources(), listTrackingPlans()]);

      // For each plan, get connected sources
      const planSources = await Promise.all(
        plans.map(async (p) => {
          const connected = await listTrackingPlanSources(p.id).catch(() => []);
          return { plan: p, sources: connected as any[] };
        }),
      );

      // Build coverage map
      const coveredSourceIds = new Set<string>();
      const coverage: any[] = [];
      for (const ps of planSources) {
        const sourceNames = ps.sources.map((s: any) => {
          coveredSourceIds.add(s.sourceId || s.id);
          const found = sources.find((src) => src.id === (s.sourceId || s.id));
          return found?.name || s.sourceId || s.id;
        });
        coverage.push({
          plan: { id: ps.plan.id, name: ps.plan.name },
          sources: sourceNames,
          sourceCount: sourceNames.length,
        });
      }

      const enabledSources = sources.filter((s) => s.enabled);
      const uncoveredSources = enabledSources.filter((s) => !coveredSourceIds.has(s.id));

      const data = {
        totalPlans: plans.length,
        totalSources: sources.length,
        activeSources: enabledSources.length,
        coveredSources: coveredSourceIds.size,
        uncoveredActiveSources: uncoveredSources.map((s) => ({ id: s.id, name: s.name })),
        coverage,
      };

      const fmtLines = [
        chalk.bold("Tracking Plan Coverage"),
        "",
        `${chalk.bold("Sources:")}  ${enabledSources.length} active / ${sources.length} total`,
        `${chalk.bold("Covered:")}  ${coveredSourceIds.size} sources across ${plans.length} plans`,
        "",
      ];

      for (const c of coverage) {
        fmtLines.push(`${chalk.bold(c.plan.name)} ${chalk.dim(`(${c.sourceCount} sources)`)}`);
        for (const name of c.sources) {
          fmtLines.push(`  ${chalk.green("●")} ${name}`);
        }
        fmtLines.push("");
      }

      if (uncoveredSources.length > 0) {
        fmtLines.push(chalk.yellow.bold(`Uncovered Active Sources (${uncoveredSources.length}):`));
        for (const s of uncoveredSources) {
          fmtLines.push(`  ${chalk.red("○")} ${s.name} ${chalk.dim(s.id)}`);
        }
      } else {
        fmtLines.push(chalk.green("All active sources are covered by a tracking plan."));
      }

      output(data, fmtLines.join("\n"), (d: any) => ({
        totalPlans: d.totalPlans,
        activeSources: d.activeSources,
        coveredSources: d.coveredSources,
        uncoveredActiveSources: d.uncoveredActiveSources,
      }));
    } catch (e: any) {
      fail(e);
    }
  });

// Auto-cleanup stale tap destinations from previous crashes (local file check, zero cost)
if (hasStaleTap()) {
  await cleanupStaleTap();
}

program.parse();
