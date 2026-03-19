import chalk from "chalk";
import type { Command } from "commander";
import { listAuditEvents } from "../api/audit.ts";
import { getEventVolume } from "../api/events.ts";
import {
  getSource,
  getSourceConnectedDestinations,
  getSourceSchemaSettings,
  listSources,
} from "../api/sources.ts";
import { listTransformations } from "../api/transformations.ts";
import { compactDestination, compactSource, defaultEnd, defaultStart } from "../compact.ts";
import { formatSourceEnrichment, formatSources } from "../formatters/sources.ts";
import { fail, isJson, output } from "../index.ts";
import { cleanupStaleTap, runTap } from "../tap.ts";

export function register(program: Command) {
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
        output(settings, JSON.stringify(settings, null, 2), (s: any) => s);
      } catch (e: any) {
        fail(e);
      }
    });
}

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
