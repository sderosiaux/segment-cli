# segment-cli Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Read-only CLI for Segment.com Public API — inspect sources, destinations, tracking plans, transformations, delivery metrics, audit trail, regulations, users, and usage.

**Architecture:** Bun + TypeScript + Commander.js + Chalk. HTTP client with Bearer auth, auto-retry, auto-pagination. API modules (`src/api/*.ts`) + formatters (`src/formatters/*.ts`). Same patterns as `../linkedin-cli`.

**Tech Stack:** Bun runtime, TypeScript strict, Commander.js, Chalk, Biome, `@segment/public-api-sdk-typescript` (types only)

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Existing: `.env` (already created)
- Existing: `.gitignore` (already created)

**Step 1: Create package.json**

```json
{
  "name": "segment-cli",
  "module": "src/index.ts",
  "type": "module",
  "private": true,
  "bin": {
    "segment": "./src/index.ts"
  },
  "scripts": {
    "start": "bun src/index.ts",
    "segment": "bun src/index.ts",
    "lint": "bunx biome check src/",
    "lint:fix": "bunx biome check --write src/",
    "prepare": "husky",
    "postinstall": "bun link"
  },
  "lint-staged": {
    "*.ts": [
      "bunx biome check --write --no-errors-on-unmatched"
    ]
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.7",
    "@types/bun": "latest",
    "husky": "^9.1.7",
    "lint-staged": "^16.3.3"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "dependencies": {
    "chalk": "^5.6.2",
    "commander": "^14.0.3"
  }
}
```

**Step 2: Create tsconfig.json**

Copy from linkedin-cli (remove `jsx` line — not needed here):

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

**Step 3: Create biome.json**

Copy from linkedin-cli as-is:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.7/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": ["src/**/*.ts"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "suspicious": {
        "noDebugger": "error",
        "noExplicitAny": "off"
      },
      "style": {
        "useConst": "error"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always"
    }
  }
}
```

**Step 4: Install dependencies**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun install`
Expected: lockfile created, node_modules populated

**Step 5: Init git + husky**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && git init && bunx husky init`

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold project (bun + ts + commander + chalk + biome)"
```

---

### Task 2: HTTP Client

**Files:**
- Create: `src/client.ts`

**Step 1: Implement the HTTP client**

```typescript
import chalk from "chalk";

const BASE_URLS: Record<string, string> = {
  us: "https://api.segmentapis.com",
  eu: "https://eu1.api.segmentapis.com",
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

function getToken(): string {
  const token = process.env.SEGMENT_TOKEN;
  if (!token) {
    console.error(chalk.red("Missing SEGMENT_TOKEN. Set it in .env or as env var."));
    process.exit(1);
  }
  return token;
}

function getBaseUrl(): string {
  const region = process.env.SEGMENT_REGION || "eu";
  const url = BASE_URLS[region];
  if (!url) {
    console.error(chalk.red(`Invalid SEGMENT_REGION: ${region}. Use "us" or "eu".`));
    process.exit(1);
  }
  return url;
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = getToken();
  const base = getBaseUrl();
  const url = new URL(path, base);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      console.error(chalk.yellow(`  Retrying (${attempt}/${MAX_RETRIES}) in ${delay}ms...`));
      await new Promise((r) => setTimeout(r, delay));
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt < MAX_RETRIES) continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));

      if (body.message?.includes("must be sent to Segment's")) {
        const match = body.message.match(/https:\/\/[^\s]+/);
        console.error(chalk.red(`Wrong region. Use: ${match?.[0] || "check Segment docs"}`));
        process.exit(1);
      }

      const errors = body.errors || [];
      const msg = errors[0]?.message || body.message || `HTTP ${res.status}`;
      const type = errors[0]?.type || "";

      if (res.status === 401) throw new Error("Invalid token. Generate a new one at app.segment.com");
      if (res.status === 403) throw new Error(`Token lacks permission: ${msg}`);
      if (res.status === 404) throw new Error(`Not found: ${path}`);
      throw new Error(`Segment API error (${res.status} ${type}): ${msg}`);
    }

    return res.json() as Promise<T>;
  }

  throw new Error(`Failed after ${MAX_RETRIES} retries: ${path}`);
}

interface PaginatedResponse<T> {
  data: T;
  pagination?: {
    current?: string;
    next?: string;
    totalEntries?: number;
  };
}

export async function segmentGet<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const res = await request<{ data: T }>(path, params);
  return res.data;
}

export async function segmentGetAll<T>(
  path: string,
  dataKey: string,
  params?: Record<string, string>,
  pageSize = 100,
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  do {
    const queryParams: Record<string, string> = {
      ...params,
      "pagination[count]": String(pageSize),
    };
    if (cursor) queryParams["pagination[cursor]"] = cursor;

    const res = await request<PaginatedResponse<Record<string, any>>>(path, queryParams);
    const items = res.data?.[dataKey] ?? [];
    allItems.push(...items);
    cursor = res.data?.pagination?.next ?? res.pagination?.next;
  } while (cursor);

  return allItems;
}

export async function segmentGetRaw<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  return request<T>(path, params);
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun build --no-bundle src/client.ts --outdir /dev/null 2>&1 || echo "Check errors"`

**Step 3: Commit**

```bash
git add src/client.ts
git commit -m "feat: HTTP client with Bearer auth, retry, auto-pagination"
```

---

### Task 3: CLI Entry + Helpers

**Files:**
- Create: `src/index.ts`

**Step 1: Create the CLI entry point with output/fail helpers**

```typescript
#!/usr/bin/env bun
import chalk from "chalk";
import { Command } from "commander";

export const program = new Command();

program
  .name("segment")
  .description("Segment CLI — read-only access to Segment Public API.\nInspect sources, destinations, tracking plans, transformations, delivery, audit trail.")
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
```

Placeholder at bottom (will be filled in subsequent tasks):

```typescript
// Commands are registered via imports in subsequent tasks
program.parse();
```

**Step 2: Test it runs**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun src/index.ts --help`
Expected: Help text with "Segment CLI" description

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: CLI entry point with output/fail helpers"
```

---

### Task 4: Sources Command + Formatter

**Files:**
- Create: `src/api/sources.ts`
- Create: `src/formatters/sources.ts`
- Modify: `src/index.ts` (add sources command)

**Step 1: Create API module**

`src/api/sources.ts`:
```typescript
import { segmentGet, segmentGetAll } from "../client.ts";

export interface Source {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  writeKeys: string[];
  metadata?: { name: string; slug: string; categories: string[] };
  settings?: Record<string, any>;
  labels?: { key: string; value: string }[];
}

export async function listSources(): Promise<Source[]> {
  return segmentGetAll<Source>("/sources", "sources");
}

export async function getSource(id: string): Promise<Source> {
  return segmentGet<{ source: Source }>("/sources/" + id).then((d) => d.source);
}

export async function getSourceConnectedDestinations(sourceId: string) {
  return segmentGetAll("/sources/" + sourceId + "/connected-destinations", "destinations");
}

export async function getSourceSchemaSettings(sourceId: string) {
  return segmentGet("/sources/" + sourceId + "/schema-settings");
}
```

**Step 2: Create formatter**

`src/formatters/sources.ts`:
```typescript
import chalk from "chalk";
import type { Source } from "../api/sources.ts";

export function formatSources(sources: Source[]): string {
  if (sources.length === 0) return chalk.yellow("No sources found.");
  const lines = sources.map((s) => {
    const status = s.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const labels = s.labels?.map((l) => `${l.key}:${l.value}`).join(", ") || "";
    return `  ${status} ${chalk.bold(s.name.padEnd(45))} ${chalk.dim(s.id)} ${chalk.dim(labels)}`;
  });
  return `${chalk.bold(`Sources (${sources.length}):`)}\n${lines.join("\n")}`;
}

export function formatSource(s: Source): string {
  const lines = [
    `${chalk.bold("Name:")}       ${s.name}`,
    `${chalk.bold("ID:")}         ${s.id}`,
    `${chalk.bold("Slug:")}       ${s.slug}`,
    `${chalk.bold("Enabled:")}    ${s.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Write Keys:")} ${s.writeKeys?.join(", ") || "none"}`,
  ];
  if (s.metadata) {
    lines.push(`${chalk.bold("Type:")}       ${s.metadata.name}`);
    lines.push(`${chalk.bold("Categories:")} ${s.metadata.categories?.join(", ") || "none"}`);
  }
  if (s.labels?.length) {
    lines.push(`${chalk.bold("Labels:")}     ${s.labels.map((l) => `${l.key}:${l.value}`).join(", ")}`);
  }
  return lines.join("\n");
}
```

**Step 3: Register sources command in index.ts**

Add to `src/index.ts` before `program.parse()`:

```typescript
import { listSources, getSource, getSourceConnectedDestinations, getSourceSchemaSettings } from "./api/sources.ts";
import { formatSources, formatSource } from "./formatters/sources.ts";

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
      output(dests, JSON.stringify(dests, null, 2)); // temporary formatter
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
```

**Step 4: Test against real API**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun src/index.ts sources`
Expected: 20 sources listed with ON/OFF status, names, IDs

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun src/index.ts sources --json | jq '.[0]'`
Expected: JSON object with id, name, slug, enabled fields

**Step 5: Commit**

```bash
git add src/api/sources.ts src/formatters/sources.ts src/index.ts
git commit -m "feat: sources command (list + details + connected destinations + schema settings)"
```

---

### Task 5: Destinations Command + Formatter

**Files:**
- Create: `src/api/destinations.ts`
- Create: `src/formatters/destinations.ts`
- Modify: `src/index.ts`

**Step 1: Create API module**

`src/api/destinations.ts`:
```typescript
import { segmentGet, segmentGetAll } from "../client.ts";

export interface Destination {
  id: string;
  name: string;
  enabled: boolean;
  sourceId: string;
  metadata: { name: string; slug: string; description: string };
  settings?: Record<string, any>;
}

export interface DestinationFilter {
  id: string;
  sourceId: string;
  destinationId: string;
  title: string;
  description?: string;
  if: string;
  actions: { type: string; fields?: Record<string, any> }[];
  enabled: boolean;
}

export async function listDestinations(): Promise<Destination[]> {
  return segmentGetAll<Destination>("/destinations", "destinations");
}

export async function getDestination(id: string): Promise<Destination> {
  return segmentGet<{ destination: Destination }>("/destinations/" + id).then((d) => d.destination);
}

export async function listDestinationFilters(destinationId: string): Promise<DestinationFilter[]> {
  return segmentGetAll<DestinationFilter>(
    "/destinations/" + destinationId + "/filters",
    "filters",
  );
}

export async function listDestinationSubscriptions(destinationId: string) {
  return segmentGetAll("/destinations/" + destinationId + "/subscriptions", "subscriptions");
}
```

**Step 2: Create formatter**

`src/formatters/destinations.ts`:
```typescript
import chalk from "chalk";
import type { Destination, DestinationFilter } from "../api/destinations.ts";

export function formatDestinations(destinations: Destination[]): string {
  if (destinations.length === 0) return chalk.yellow("No destinations found.");
  const lines = destinations.map((d) => {
    const status = d.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const type = chalk.dim(`[${d.metadata?.name || "unknown"}]`);
    return `  ${status} ${chalk.bold(d.name.padEnd(50))} ${type} ${chalk.dim(d.id)}`;
  });
  return `${chalk.bold(`Destinations (${destinations.length}):`)}\n${lines.join("\n")}`;
}

export function formatDestination(d: Destination): string {
  return [
    `${chalk.bold("Name:")}     ${d.name}`,
    `${chalk.bold("ID:")}       ${d.id}`,
    `${chalk.bold("Enabled:")}  ${d.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Type:")}     ${d.metadata?.name || "unknown"}`,
    `${chalk.bold("Source:")}   ${d.sourceId}`,
  ].join("\n");
}

export function formatFilters(filters: DestinationFilter[]): string {
  if (filters.length === 0) return chalk.yellow("No filters found.");
  const lines = filters.map((f) => {
    const status = f.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const actions = f.actions.map((a) => a.type).join(", ");
    return `  ${status} ${chalk.bold(f.title.padEnd(40))} ${chalk.dim(actions)}\n       ${chalk.dim("if: " + f.if)}`;
  });
  return `${chalk.bold(`Filters (${filters.length}):`)}\n${lines.join("\n")}`;
}
```

**Step 3: Register command in index.ts**

Add imports + command before `program.parse()`:

```typescript
import { listDestinations, getDestination, listDestinationFilters, listDestinationSubscriptions } from "./api/destinations.ts";
import { formatDestinations, formatDestination, formatFilters } from "./formatters/destinations.ts";

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
```

**Step 4: Test**

Run: `bun src/index.ts destinations`
Expected: 29 destinations listed

Run: `bun src/index.ts destinations --json | jq '.[].name'`
Expected: destination names as JSON strings

**Step 5: Commit**

```bash
git add src/api/destinations.ts src/formatters/destinations.ts src/index.ts
git commit -m "feat: destinations command (list + details + filters + subscriptions)"
```

---

### Task 6: Tracking Plans Command + Formatter

**Files:**
- Create: `src/api/tracking-plans.ts`
- Create: `src/formatters/tracking-plans.ts`
- Modify: `src/index.ts`

**Step 1: Create API module**

`src/api/tracking-plans.ts`:
```typescript
import { segmentGet, segmentGetAll } from "../client.ts";

export interface TrackingPlan {
  id: string;
  name: string;
  slug?: string;
  type: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TrackingPlanRule {
  type: string;
  key: string;
  version: number;
  jsonSchema?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export async function listTrackingPlans(): Promise<TrackingPlan[]> {
  return segmentGetAll<TrackingPlan>("/tracking-plans", "trackingPlans");
}

export async function getTrackingPlan(id: string): Promise<TrackingPlan> {
  return segmentGet<{ trackingPlan: TrackingPlan }>("/tracking-plans/" + id).then(
    (d) => d.trackingPlan,
  );
}

export async function listTrackingPlanRules(id: string): Promise<TrackingPlanRule[]> {
  return segmentGetAll<TrackingPlanRule>("/tracking-plans/" + id + "/rules", "rules");
}

export async function listTrackingPlanSources(id: string) {
  return segmentGetAll("/tracking-plans/" + id + "/sources", "sources");
}
```

**Step 2: Create formatter**

`src/formatters/tracking-plans.ts`:
```typescript
import chalk from "chalk";
import type { TrackingPlan, TrackingPlanRule } from "../api/tracking-plans.ts";

export function formatTrackingPlans(plans: TrackingPlan[]): string {
  if (plans.length === 0) return chalk.yellow("No tracking plans found.");
  const lines = plans.map((p) => {
    const type = chalk.dim(`[${p.type}]`);
    return `  ${chalk.bold(p.name.padEnd(55))} ${type} ${chalk.dim(p.id)}`;
  });
  return `${chalk.bold(`Tracking Plans (${plans.length}):`)}\n${lines.join("\n")}`;
}

export function formatTrackingPlan(p: TrackingPlan): string {
  return [
    `${chalk.bold("Name:")}    ${p.name}`,
    `${chalk.bold("ID:")}      ${p.id}`,
    `${chalk.bold("Type:")}    ${p.type}`,
    p.description ? `${chalk.bold("Desc:")}    ${p.description}` : "",
    p.updatedAt ? `${chalk.bold("Updated:")} ${p.updatedAt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatRules(rules: TrackingPlanRule[]): string {
  if (rules.length === 0) return chalk.yellow("No rules found.");

  const grouped: Record<string, TrackingPlanRule[]> = {};
  for (const r of rules) {
    const t = r.type || "OTHER";
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(r);
  }

  const sections: string[] = [];
  for (const [type, items] of Object.entries(grouped)) {
    const sorted = items.sort((a, b) => a.key.localeCompare(b.key));
    const lines = sorted.map((r) => {
      const props = r.jsonSchema?.properties
        ? Object.keys(r.jsonSchema.properties).length
        : 0;
      const required = r.jsonSchema?.required?.length ?? 0;
      const meta = props > 0 ? chalk.dim(` (${props} props, ${required} required)`) : "";
      return `    ${r.key || "(root)"}${meta}`;
    });
    sections.push(`  ${chalk.bold(type)} (${items.length}):\n${lines.join("\n")}`);
  }

  return `${chalk.bold(`Rules (${rules.length}):`)}\n${sections.join("\n\n")}`;
}
```

**Step 3: Register command in index.ts**

```typescript
import { listTrackingPlans, getTrackingPlan, listTrackingPlanRules, listTrackingPlanSources } from "./api/tracking-plans.ts";
import { formatTrackingPlans, formatTrackingPlan, formatRules } from "./formatters/tracking-plans.ts";

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
```

**Step 4: Test**

Run: `bun src/index.ts tracking-plans`
Expected: 11 tracking plans listed

Run: `bun src/index.ts tracking-plans rules tp_2N3clI1nLyIgWceDI3aPsD1NmjL`
Expected: Rules grouped by TRACK/IDENTIFY with event names

**Step 5: Commit**

```bash
git add src/api/tracking-plans.ts src/formatters/tracking-plans.ts src/index.ts
git commit -m "feat: tracking-plans command (list + details + rules + sources)"
```

---

### Task 7: Transformations Command + Formatter

**Files:**
- Create: `src/api/transformations.ts`
- Create: `src/formatters/transformations.ts`
- Modify: `src/index.ts`

**Step 1: Create API module**

`src/api/transformations.ts`:
```typescript
import { segmentGet, segmentGetAll } from "../client.ts";

export interface Transformation {
  id: string;
  name: string;
  sourceId: string;
  destinationMetadataId?: string;
  destinationId?: string;
  enabled: boolean;
  if: string;
  drop: boolean;
  newEventName?: string;
  propertyRenames: { oldName: string; newName: string }[];
  propertyValueTransformations: { propertyPath: string; propertyValue: string }[];
  propertyDrops: string[];
  allowProperties: string[];
}

export async function listTransformations(): Promise<Transformation[]> {
  return segmentGetAll<Transformation>("/transformations", "transformations");
}

export async function getTransformation(id: string): Promise<Transformation> {
  return segmentGet<{ transformation: Transformation }>("/transformations/" + id).then(
    (d) => d.transformation,
  );
}
```

**Step 2: Create formatter**

`src/formatters/transformations.ts`:
```typescript
import chalk from "chalk";
import type { Transformation } from "../api/transformations.ts";

export function formatTransformations(items: Transformation[]): string {
  if (items.length === 0) return chalk.yellow("No transformations found.");
  const lines = items.map((t) => {
    const status = t.enabled ? chalk.green("ON ") : chalk.red("OFF");
    const action = t.drop
      ? chalk.red("DROP")
      : t.newEventName
        ? chalk.blue(`RENAME -> ${t.newEventName}`)
        : t.propertyRenames.length > 0
          ? chalk.cyan("RENAME_PROPS")
          : chalk.dim("PASS");
    return [
      `  ${status} ${chalk.bold(t.name.padEnd(55))} ${action}`,
      `       ${chalk.dim("if: " + t.if)}`,
      `       ${chalk.dim("source: " + t.sourceId)}${t.destinationId ? chalk.dim(" -> dest: " + t.destinationId) : ""}`,
    ].join("\n");
  });
  return `${chalk.bold(`Transformations (${items.length}):`)}\n${lines.join("\n")}`;
}

export function formatTransformation(t: Transformation): string {
  const lines = [
    `${chalk.bold("Name:")}      ${t.name}`,
    `${chalk.bold("ID:")}        ${t.id}`,
    `${chalk.bold("Enabled:")}   ${t.enabled ? chalk.green("yes") : chalk.red("no")}`,
    `${chalk.bold("Condition:")} ${t.if}`,
    `${chalk.bold("Drop:")}      ${t.drop ? chalk.red("yes") : "no"}`,
    `${chalk.bold("Source:")}    ${t.sourceId}`,
  ];
  if (t.destinationId) lines.push(`${chalk.bold("Dest:")}      ${t.destinationId}`);
  if (t.newEventName) lines.push(`${chalk.bold("Rename to:")} ${t.newEventName}`);
  if (t.propertyRenames.length > 0) {
    lines.push(`${chalk.bold("Prop renames:")}`);
    for (const r of t.propertyRenames) lines.push(`  ${r.oldName} -> ${r.newName}`);
  }
  if (t.propertyDrops.length > 0) {
    lines.push(`${chalk.bold("Prop drops:")} ${t.propertyDrops.join(", ")}`);
  }
  return lines.join("\n");
}
```

**Step 3: Register command**

```typescript
import { listTransformations, getTransformation } from "./api/transformations.ts";
import { formatTransformations, formatTransformation } from "./formatters/transformations.ts";

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
```

**Step 4: Test**

Run: `bun src/index.ts transformations`
Expected: 14 transformations with conditions and DROP/RENAME actions

**Step 5: Commit**

```bash
git add src/api/transformations.ts src/formatters/transformations.ts src/index.ts
git commit -m "feat: transformations command (list + details)"
```

---

### Task 8: Delivery + Volume Commands

**Files:**
- Create: `src/api/delivery.ts`
- Create: `src/api/events.ts`
- Create: `src/formatters/delivery.ts`
- Create: `src/formatters/events.ts`
- Modify: `src/index.ts`

**Step 1: Create delivery API**

`src/api/delivery.ts`:
```typescript
import { segmentGetRaw } from "../client.ts";

export interface DeliveryMetric {
  metricName: string;
  total: number;
  series: { time: string; count: number }[];
}

type DeliveryType =
  | "egress-failed-metrics"
  | "egress-success-metrics"
  | "ingress-failed-metrics"
  | "ingress-success-metrics"
  | "filtered-at-source-metrics"
  | "filtered-at-destination-metrics";

export async function getDeliveryMetrics(
  type: DeliveryType,
  params: { sourceId?: string; startTime: string; endTime: string; granularity?: string },
) {
  const queryParams: Record<string, string> = {
    startTime: params.startTime,
    endTime: params.endTime,
    granularity: params.granularity || "DAY",
  };
  if (params.sourceId) queryParams.sourceId = params.sourceId;
  return segmentGetRaw<{ data: { dataset: DeliveryMetric[] }; }>("/delivery-overview/" + type, queryParams);
}
```

**Step 2: Create events API**

`src/api/events.ts`:
```typescript
import { segmentGetRaw } from "../client.ts";

export interface EventVolume {
  eventName: string | null;
  total: number;
  series?: { time: string; count: number }[];
}

export async function getEventVolume(params: {
  startTime: string;
  endTime: string;
  granularity?: string;
  groupBy?: string[];
  sourceId?: string;
}) {
  const queryParams: Record<string, string> = {
    startTime: params.startTime,
    endTime: params.endTime,
    granularity: params.granularity || "DAY",
  };
  if (params.sourceId) queryParams.sourceId = params.sourceId;
  if (params.groupBy) {
    for (const g of params.groupBy) {
      queryParams[`groupBy`] = g;
    }
  }
  return segmentGetRaw<{ data: { result: EventVolume[]; pagination?: any } }>("/events/volume", queryParams);
}
```

**Step 3: Create formatters**

`src/formatters/delivery.ts`:
```typescript
import chalk from "chalk";

export function formatDeliveryMetrics(data: any, type: string): string {
  const dataset = data?.data?.dataset;
  if (!dataset || dataset.length === 0) return chalk.yellow(`No ${type} delivery data found.`);
  const lines = dataset.map((m: any) => {
    return `  ${chalk.bold(m.metricName || "total")}: ${m.total}`;
  });
  return `${chalk.bold(`Delivery ${type}:`)}\n${lines.join("\n")}`;
}
```

`src/formatters/events.ts`:
```typescript
import chalk from "chalk";
import type { EventVolume } from "../api/events.ts";

function bar(value: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function formatVolume(results: EventVolume[]): string {
  if (results.length === 0) return chalk.yellow("No event volume data.");
  if (results.length === 1 && !results[0].eventName) {
    return `${chalk.bold("Total events:")} ${results[0].total.toLocaleString()}`;
  }
  const max = Math.max(...results.map((r) => r.total));
  const sorted = [...results].sort((a, b) => b.total - a.total);
  const lines = sorted.map((r) => {
    const name = r.eventName || "(all)";
    const count = r.total.toLocaleString().padStart(12);
    return `  ${count} ${bar(r.total, max)} ${chalk.dim(name)}`;
  });
  return `${chalk.bold(`Event Volume (${results.length} groups):`)}\n${lines.join("\n")}`;
}
```

**Step 4: Register commands**

```typescript
import { getDeliveryMetrics } from "./api/delivery.ts";
import { getEventVolume } from "./api/events.ts";
import { formatDeliveryMetrics } from "./formatters/delivery.ts";
import { formatVolume } from "./formatters/events.ts";

const deliveryCmd = program
  .command("delivery <type>")
  .description("Delivery metrics. Types: ingress, egress, filtered-source, filtered-dest")
  .option("--source <sourceId>", "Filter by source ID")
  .option("--start <date>", "Start date (ISO)", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0] + "T00:00:00Z")
  .option("--end <date>", "End date (ISO)", new Date().toISOString().split("T")[0] + "T23:59:59Z")
  .option("--granularity <g>", "DAY, HOUR, or MINUTE", "DAY")
  .action(async (type: string, opts) => {
    try {
      const typeMap: Record<string, string> = {
        ingress: "ingress-success-metrics",
        "ingress-failed": "ingress-failed-metrics",
        egress: "egress-success-metrics",
        "egress-failed": "egress-failed-metrics",
        "filtered-source": "filtered-at-source-metrics",
        "filtered-dest": "filtered-at-destination-metrics",
      };
      const apiType = typeMap[type];
      if (!apiType) {
        throw new Error(`Unknown type: ${type}. Use: ${Object.keys(typeMap).join(", ")}`);
      }
      const data = await getDeliveryMetrics(apiType as any, {
        sourceId: opts.source,
        startTime: opts.start,
        endTime: opts.end,
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
  .option("--start <date>", "Start date", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0] + "T00:00:00Z")
  .option("--end <date>", "End date", new Date().toISOString().split("T")[0] + "T23:59:59Z")
  .option("--group-by <field>", "Group by: eventName, eventType, source")
  .action(async (opts) => {
    try {
      const data = await getEventVolume({
        startTime: opts.start,
        endTime: opts.end,
        sourceId: opts.source,
        groupBy: opts.groupBy ? [opts.groupBy] : undefined,
      });
      const results = data.data?.result || [];
      output(results, formatVolume(results));
    } catch (e: any) {
      fail(e);
    }
  });
```

**Step 5: Test**

Run: `bun src/index.ts volume --start 2026-03-12T00:00:00Z --end 2026-03-19T00:00:00Z`
Expected: "Total events: 2,561,043" or similar

Run: `bun src/index.ts delivery egress --source rqVAu2fqXkQXNAAwud6Bfo`

**Step 6: Commit**

```bash
git add src/api/delivery.ts src/api/events.ts src/formatters/delivery.ts src/formatters/events.ts src/index.ts
git commit -m "feat: delivery + volume commands (metrics, event volume, bar charts)"
```

---

### Task 9: Audit Command

**Files:**
- Create: `src/api/audit.ts`
- Create: `src/formatters/audit.ts`
- Modify: `src/index.ts`

**Step 1: Create API module**

`src/api/audit.ts`:
```typescript
import { segmentGetAll } from "../client.ts";

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: string;
  actor: string;
  actorEmail?: string;
  resourceId: string;
  resourceType: string;
  resourceName: string;
}

export async function listAuditEvents(params?: {
  startTime?: string;
  endTime?: string;
  resourceId?: string;
  resourceType?: string;
}): Promise<AuditEvent[]> {
  const queryParams: Record<string, string> = {};
  if (params?.startTime) queryParams.startTime = params.startTime;
  if (params?.endTime) queryParams.endTime = params.endTime;
  if (params?.resourceId) queryParams.resourceId = params.resourceId;
  if (params?.resourceType) queryParams.resourceType = params.resourceType;

  // Audit events use "events" as key (not "auditEvents")
  return segmentGetAll<AuditEvent>("/audit-events", "events", queryParams);
}
```

**Step 2: Create formatter**

`src/formatters/audit.ts`:
```typescript
import chalk from "chalk";
import type { AuditEvent } from "../api/audit.ts";

export function formatAuditEvents(events: AuditEvent[]): string {
  if (events.length === 0) return chalk.yellow("No audit events found.");
  const lines = events.map((e) => {
    const date = new Date(e.timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const actor = e.actorEmail || e.actor || "system";
    const typeColor =
      e.type === "Violations Detected"
        ? chalk.red(e.type)
        : e.type.includes("Disabled")
          ? chalk.yellow(e.type)
          : chalk.white(e.type);
    return `  ${chalk.dim(date.padEnd(18))} ${typeColor.padEnd(50)} ${chalk.blue(actor)}\n${" ".repeat(20)}${chalk.dim(`${e.resourceType}: ${e.resourceName}`)}`;
  });
  return `${chalk.bold(`Audit Events (${events.length}):`)}\n${lines.join("\n")}`;
}
```

**Step 3: Register command**

```typescript
import { listAuditEvents } from "./api/audit.ts";
import { formatAuditEvents } from "./formatters/audit.ts";

program
  .command("audit")
  .description("List audit events (violations, changes, user actions)")
  .option("--type <type>", "Filter by event type")
  .option("--resource <id>", "Filter by resource ID")
  .option("--resource-type <type>", "Filter by resource type (source, tracking_plan, etc.)")
  .option("--start <date>", "Start time (ISO)")
  .option("--end <date>", "End time (ISO)")
  .action(async (opts) => {
    try {
      let events = await listAuditEvents({
        startTime: opts.start,
        endTime: opts.end,
        resourceId: opts.resource,
        resourceType: opts.resourceType,
      });
      if (opts.type) {
        events = events.filter((e) =>
          e.type.toLowerCase().includes(opts.type.toLowerCase()),
        );
      }
      output(events, formatAuditEvents(events));
    } catch (e: any) {
      fail(e);
    }
  });
```

**Step 4: Test**

Run: `bun src/index.ts audit`
Expected: Audit events with violations, integration changes, user actions

Run: `bun src/index.ts audit --json | jq '[.[] | select(.type == "Violations Detected")] | length'`
Expected: Count of violation events

**Step 5: Commit**

```bash
git add src/api/audit.ts src/formatters/audit.ts src/index.ts
git commit -m "feat: audit command (list events with type/resource/date filters)"
```

---

### Task 10: Regulations + Users + Usage Commands

**Files:**
- Create: `src/api/regulations.ts`
- Create: `src/api/users.ts`
- Create: `src/api/usage.ts`
- Create: `src/formatters/regulations.ts`
- Create: `src/formatters/users.ts`
- Create: `src/formatters/usage.ts`
- Modify: `src/index.ts`

**Step 1: Create API modules**

`src/api/regulations.ts`:
```typescript
import { segmentGetAll } from "../client.ts";

export interface Regulation {
  id: string;
  workspaceId: string;
  overallStatus: string;
  createdAt: string;
  streamStatus?: any[];
  regulateRequest?: { subjectType: string; subjectIds: string[]; regulationType: string };
}

export async function listRegulations(): Promise<Regulation[]> {
  return segmentGetAll<Regulation>("/regulations", "regulations");
}

export async function listSuppressions() {
  return segmentGetAll("/suppressions", "suppressions");
}
```

`src/api/users.ts`:
```typescript
import { segmentGet, segmentGetAll } from "../client.ts";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  permissions?: { roles: { id: string; name: string }[] }[];
}

export async function listUsers(): Promise<WorkspaceUser[]> {
  return segmentGetAll<WorkspaceUser>("/users", "users");
}

export async function getUser(id: string): Promise<WorkspaceUser> {
  return segmentGet<{ user: WorkspaceUser }>("/users/" + id).then((d) => d.user);
}
```

`src/api/usage.ts`:
```typescript
import { segmentGetAll } from "../client.ts";

export interface DailyUsage {
  timestamp: string;
  count: number;
  sourceId?: string;
  sourceName?: string;
}

export async function getDailyApiCalls(period: string): Promise<DailyUsage[]> {
  return segmentGetAll<DailyUsage>("/usage/api-calls/sources/daily", "dailyPerSourceAPICallsUsage", {
    period,
  });
}

export async function getDailyMtu(period: string): Promise<DailyUsage[]> {
  return segmentGetAll<DailyUsage>("/usage/mtu/sources/daily", "dailyPerSourceMTUUsage", { period });
}
```

**Step 2: Create formatters**

`src/formatters/regulations.ts`:
```typescript
import chalk from "chalk";
import type { Regulation } from "../api/regulations.ts";

export function formatRegulations(items: Regulation[]): string {
  if (items.length === 0) return chalk.yellow("No regulations found.");
  const lines = items.map((r) => {
    const status =
      r.overallStatus === "FINISHED" ? chalk.green(r.overallStatus) : chalk.yellow(r.overallStatus);
    const type = r.regulateRequest?.regulationType || "unknown";
    const subjects = r.regulateRequest?.subjectIds?.join(", ") || "";
    return `  ${status.padEnd(20)} ${chalk.bold(type.padEnd(15))} ${chalk.dim(subjects)} ${chalk.dim(r.createdAt)}`;
  });
  return `${chalk.bold(`Regulations (${items.length}):`)}\n${lines.join("\n")}`;
}
```

`src/formatters/users.ts`:
```typescript
import chalk from "chalk";
import type { WorkspaceUser } from "../api/users.ts";

export function formatUsers(users: WorkspaceUser[]): string {
  if (users.length === 0) return chalk.yellow("No users found.");
  const lines = users.map((u) => {
    return `  ${chalk.bold(u.name.padEnd(30))} ${chalk.dim(u.email.padEnd(40))} ${chalk.dim(u.id)}`;
  });
  return `${chalk.bold(`Users (${users.length}):`)}\n${lines.join("\n")}`;
}
```

`src/formatters/usage.ts`:
```typescript
import chalk from "chalk";
import type { DailyUsage } from "../api/usage.ts";

export function formatUsage(data: DailyUsage[], label: string): string {
  if (data.length === 0) return chalk.yellow(`No ${label} usage data.`);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const bySource: Record<string, number> = {};
  for (const d of data) {
    const key = d.sourceName || d.sourceId || "total";
    bySource[key] = (bySource[key] || 0) + d.count;
  }
  const lines = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `  ${count.toLocaleString().padStart(12)} ${chalk.dim(name)}`);
  return `${chalk.bold(`${label} (total: ${total.toLocaleString()}):`)}\n${lines.join("\n")}`;
}
```

**Step 3: Register commands**

```typescript
import { listRegulations, listSuppressions } from "./api/regulations.ts";
import { listUsers, getUser } from "./api/users.ts";
import { getDailyApiCalls, getDailyMtu } from "./api/usage.ts";
import { formatRegulations } from "./formatters/regulations.ts";
import { formatUsers } from "./formatters/users.ts";
import { formatUsage } from "./formatters/usage.ts";

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

const usageCmd = program
  .command("usage")
  .description("API call usage (requires --period YYYY-MM-01)")
  .option("--period <date>", "Month start date (YYYY-MM-01)", new Date().toISOString().slice(0, 8) + "01")
  .action(async (opts) => {
    try {
      const data = await getDailyApiCalls(opts.period);
      output(data, formatUsage(data, "API Calls"));
    } catch (e: any) {
      fail(e);
    }
  });

usageCmd
  .command("mtu")
  .description("Monthly Tracked Users")
  .option("--period <date>", "Month start date (YYYY-MM-01)", new Date().toISOString().slice(0, 8) + "01")
  .action(async (opts) => {
    try {
      const data = await getDailyMtu(opts.period);
      output(data, formatUsage(data, "MTU"));
    } catch (e: any) {
      fail(e);
    }
  });
```

**Step 4: Test**

Run: `bun src/index.ts users`
Run: `bun src/index.ts regulations`
Run: `bun src/index.ts usage --period 2026-03-01`

**Step 5: Commit**

```bash
git add src/api/regulations.ts src/api/users.ts src/api/usage.ts \
  src/formatters/regulations.ts src/formatters/users.ts src/formatters/usage.ts src/index.ts
git commit -m "feat: regulations, users, usage commands"
```

---

### Task 11: Bun Link + Integration Test

**Step 1: Link the CLI globally**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun link`
Expected: `segment` command now available globally

**Step 2: Run the demo script**

```bash
segment sources
segment tracking-plans
segment tracking-plans rules tp_2N3clI1nLyIgWceDI3aPsD1NmjL
segment transformations
segment audit --json | jq '.[0:3]'
segment volume --start 2026-03-12T00:00:00Z --end 2026-03-19T00:00:00Z
segment destinations --json | jq 'length'
segment --help
```

**Step 3: Run lint**

Run: `cd /Users/sderosiaux/code/personal/segment-cli && bun run lint`
Expected: No errors

**Step 4: Fix any lint issues**

Run: `bun run lint:fix` if needed

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: link CLI globally, lint pass"
```

---

Plan complete and saved to `docs/plans/2026-03-19-segment-cli.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach ?