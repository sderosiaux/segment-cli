import chalk from "chalk";
import type { Command } from "commander";
import {
  getDestination,
  listDestinationFilters,
  listDestinationSubscriptions,
  listDestinations,
} from "../api/destinations.ts";
import { compactDestination, compactSubscription } from "../compact.ts";
import {
  formatDestination,
  formatDestinations,
  formatFilters,
} from "../formatters/destinations.ts";
import { fail, output, program } from "../index.ts";
import { resolveAll } from "../resolver.ts";

export function register(prog: Command) {
  const destsCmd = prog
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
          await showDestDetail(id, opts);
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
        output(subs, JSON.stringify(subs, null, 2), compactSubscription);
      } catch (e: any) {
        fail(e);
      }
    });
}

async function showDestDetail(id: string, opts: any) {
  const a = opts.all;
  const [dest, filters, subs] = await Promise.all([
    getDestination(id),
    a || opts.filters ? listDestinationFilters(id).catch(() => null) : null,
    a || opts.subscriptions ? listDestinationSubscriptions(id).catch(() => null) : null,
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
}
