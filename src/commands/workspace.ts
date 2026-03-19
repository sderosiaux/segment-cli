import chalk from "chalk";
import type { Command } from "commander";
import { listAuditEvents } from "../api/audit.ts";
import { listDestinations } from "../api/destinations.ts";
import { getEventVolume } from "../api/events.ts";
import { listRegulations, listSuppressions } from "../api/regulations.ts";
import { listSources } from "../api/sources.ts";
import { listTrackingPlans } from "../api/tracking-plans.ts";
import { listTransformations } from "../api/transformations.ts";
import { getUser, listUsers } from "../api/users.ts";
import { compactRegulation, compactUser, defaultEnd, defaultStart } from "../compact.ts";
import { formatRegulations } from "../formatters/regulations.ts";
import { formatUsers } from "../formatters/users.ts";
import { fail, output } from "../index.ts";

export function register(prog: Command) {
  // --- Overview ---
  prog
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
          volume: { last7days: volume },
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

        output(overview, fmt, (d: any) => ({
          sources: { active: d.sources.active, total: d.sources.total },
          destinations: { active: d.destinations.active, total: d.destinations.total },
          trackingPlans: d.trackingPlans.total,
          transformations: {
            active: d.transformations.active,
            dropping: d.transformations.dropping,
          },
          violations: d.violations.recent,
          volume: d.volume.last7days,
        }));
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Regulations ---
  prog
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

  // --- Suppressions ---
  prog
    .command("suppressions")
    .description("List suppressed users")
    .action(async () => {
      try {
        const items = await listSuppressions();
        output(items, JSON.stringify(items, null, 2), (s: any) => s);
      } catch (e: any) {
        fail(e);
      }
    });

  // --- Users ---
  prog
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
}
