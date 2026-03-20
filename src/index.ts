#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { cleanupStaleTap, hasStaleTap } from "./tap.ts";

// Load config: env var > ~/.config/segment-cli/config > .env (cwd)
function loadConfig() {
  const paths = [
    join(homedir(), ".config", "segment-cli", "config"),
    join(homedir(), ".segmentrc"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
    return;
  }
}
loadConfig();

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

import { register as registerDestinations } from "./commands/destinations.ts";
import { register as registerGovernance } from "./commands/governance.ts";
import { register as registerMetrics } from "./commands/metrics.ts";
// Register command modules
import { register as registerSources } from "./commands/sources.ts";
import { register as registerWorkspace } from "./commands/workspace.ts";

registerSources(program);
registerDestinations(program);
registerGovernance(program);
registerMetrics(program);
registerWorkspace(program);

// Auto-cleanup stale tap destinations from previous crashes (local file check, zero cost)
if (hasStaleTap()) {
  await cleanupStaleTap();
}

program.parse();
