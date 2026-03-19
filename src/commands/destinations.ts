import chalk from "chalk";
import type { Command } from "commander";
import {
  deleteDestination,
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
  destsCmd
    .command("delete <destinationIds...>")
    .description("Delete one or more destinations (irreversible)")
    .option("--force", "Skip confirmation prompt")
    .action(async (ids: string[], opts: any) => {
      try {
        // Fetch details for all destinations first
        const dests = await Promise.all(
          ids.map((id) =>
            getDestination(id).catch(
              () =>
                ({ id, name: `(unknown: ${id})`, enabled: false, metadata: { name: "?" } }) as any,
            ),
          ),
        );

        // Show what will be deleted
        console.error(chalk.bold.red(`\nAbout to delete ${dests.length} destination(s):\n`));
        for (const d of dests) {
          const status = d.enabled ? chalk.green("ON ") : chalk.red("OFF");
          const type = d.metadata?.name || "unknown";
          console.error(`  ${status} ${d.name} [${type}] ${chalk.dim(d.id)}`);
        }

        const activeCount = dests.filter((d) => d.enabled).length;
        if (activeCount > 0) {
          console.error(
            chalk.yellow(`\n  WARNING: ${activeCount} destination(s) are currently ENABLED.`),
          );
        }

        // Confirm unless --force
        if (!opts.force) {
          console.error(chalk.dim("\nType 'yes' to confirm, or Ctrl+C to cancel:"));
          const answer = await new Promise<string>((resolve) => {
            process.stdout.write("> ");
            process.stdin.setEncoding("utf-8");
            process.stdin.once("data", (data) => resolve(data.toString().trim()));
          });
          if (answer !== "yes") {
            console.error(chalk.dim("Cancelled."));
            process.exit(0);
          }
        }

        // Delete each destination
        const results: { id: string; name: string; status: string }[] = [];
        for (const d of dests) {
          try {
            const res = await deleteDestination(d.id);
            results.push({ id: d.id, name: d.name, status: res.status });
            console.error(chalk.green(`  Deleted: ${d.name} (${d.id})`));
          } catch (e: any) {
            results.push({ id: d.id, name: d.name, status: `error: ${e.message}` });
            console.error(chalk.red(`  Failed: ${d.name} — ${e.message}`));
          }
        }

        output(results, "", (r: any) => r);
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
