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

program.parse();
