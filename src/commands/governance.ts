import chalk from "chalk";
import type { Command } from "commander";
import { listAuditEvents } from "../api/audit.ts";
import { listDestinationSubscriptions, listDestinations } from "../api/destinations.ts";
import { getReverseEtlModel, listReverseEtlModels } from "../api/reverse-etl.ts";
import { listSources } from "../api/sources.ts";
import {
  getTrackingPlan,
  listTrackingPlanRules,
  listTrackingPlanSources,
  listTrackingPlans,
} from "../api/tracking-plans.ts";
import { getTransformation, listTransformations } from "../api/transformations.ts";
import {
  compactReverseEtlModel,
  compactRule,
  compactSource,
  compactSubscription,
  compactTrackingPlan,
  compactTransformation,
} from "../compact.ts";
import { formatReverseEtlModel, formatReverseEtlModels } from "../formatters/reverse-etl.ts";
import {
  formatRules,
  formatTrackingPlan,
  formatTrackingPlans,
} from "../formatters/tracking-plans.ts";
import { formatTransformation, formatTransformations } from "../formatters/transformations.ts";
import { fail, output, program } from "../index.ts";
import { resolveAll } from "../resolver.ts";

export function register(prog: Command) {
  // --- Tracking Plans ---
  const tpCmd = prog
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
        if (opts.type)
          rules = rules.filter((r) => r.type.toUpperCase() === opts.type.toUpperCase());
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
  prog
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

  // --- Reverse ETL ---
  const retlCmd = prog
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
          output([], chalk.yellow("No subscriptions found for this model."), compactSubscription);
        } else {
          const lines = results.map((s: any) => {
            const status = s.enabled ? chalk.green("ON ") : chalk.red("OFF");
            return `  ${status} ${chalk.bold(s.name)} ${chalk.dim(`[${s.actionSlug}]`)}\n       → ${chalk.dim(s.destinationName)} ${chalk.dim(s.id)}`;
          });
          const fmt = `${chalk.bold(`Subscriptions for "${model.name}" (${results.length}):`)}\n${lines.join("\n")}`;
          output(results, fmt, compactSubscription);
        }
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Violations ---
  prog
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
        const globalLimit = Number.parseInt(program.opts().limit, 10);
        if (globalLimit > 0) events = events.slice(0, globalLimit);

        const bySource: Record<string, number> = {};
        for (const e of events) {
          bySource[e.resourceName] = (bySource[e.resourceName] || 0) + 1;
        }

        const data = { total: events.length, bySource, events };

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

        output(data, fmtLines.join("\n"), (d: any) => ({ total: d.total, bySource: d.bySource }));
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Coverage ---
  prog
    .command("coverage")
    .description("Tracking Plan coverage: which sources are covered by which plans")
    .action(async () => {
      try {
        const [sources, plans] = await Promise.all([listSources(), listTrackingPlans()]);

        const planSources = await Promise.all(
          plans.map(async (p) => {
            const connected = await listTrackingPlanSources(p.id).catch(() => []);
            return { plan: p, sources: connected as any[] };
          }),
        );

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
          fmtLines.push(
            chalk.yellow.bold(`Uncovered Active Sources (${uncoveredSources.length}):`),
          );
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
}
