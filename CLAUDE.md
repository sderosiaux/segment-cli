# Segment CLI

Read-only CLI for the Segment.com Public API. Globally available as `segment` (installed via `bun link`).

## Authentication

`SEGMENT_TOKEN` in `.env` (auto-loaded by Bun). Default region: `eu` (`SEGMENT_REGION`).

## Global Flags

| Flag | Purpose |
|---|---|
| `--json` | Structured JSON output. **Always use this for LLM consumption.** |
| `--compact` | Minimal fields (id, name, enabled). Use for discovery/listing. |
| `--limit N` | Cap results to N items. Use to reduce token usage. |
| `--resolve` | Enrich IDs with human-readable names (sources, destinations). |

## Commands

```
segment overview                             Workspace health summary (start here)
segment sources [id]                         List/get sources
segment sources debug <srcId>                Diagnostic snapshot (events/min, top events)
segment sources tap <srcId>                  Live event stream (requires cloudflared)
segment sources tap-cleanup                  Manual cleanup of stale tap destination
segment sources destinations <srcId>         Connected destinations
segment sources schema-settings <srcId>      Schema validation config
segment destinations [id]                    List/get destinations
segment destinations filters <destId>        Destination filters
segment destinations subscriptions <destId>  Subscriptions
segment tracking-plans [id]                  List/get tracking plans
segment tracking-plans rules <tpId>          Event schemas (governance)
segment tracking-plans sources <tpId>        Connected sources
segment transformations [id]                 List/get transformations
segment reverse-etl [id]                     List/get Reverse ETL models (includes SQL query)
segment reverse-etl subscriptions <modelId>  Destination mappings for a model
segment violations                           Schema violations summary by source
segment coverage                             Tracking plan coverage map (covered/uncovered sources)
segment delivery <type> --source <id>        Delivery metrics
segment volume                               Event volume
segment audit                                Audit trail
segment regulations                          GDPR requests
segment suppressions                         Suppressed users
segment users [id]                           Workspace users
segment usage                                API calls
segment usage mtu                            Monthly tracked users
```

## Deep Dive Flags

Enrich single-resource views with related data (fetched in parallel):

**`segment sources <id>`:**
| Flag | Adds |
|---|---|
| `--volume` | Event volume (last 7 days) |
| `--destinations` | Connected destinations |
| `--transformations` | Transformations for this source |
| `--schema` | Schema validation settings |
| `--all` | All of the above |

**`segment destinations <id>`:**
| Flag | Adds |
|---|---|
| `--filters` | Destination filters |
| `--subscriptions` | Subscriptions |
| `--all` | All of the above |

**List filters:**
- `segment sources --enabled` / `--disabled`
- `segment destinations --enabled` / `--disabled`
- `segment transformations --source <id>`
- `segment tracking-plans rules <id> --type TRACK`

## LLM Usage Patterns

1. **Always use `--json`** for machine-readable output.
2. **Discovery flow**: `--compact` first to list, then fetch by ID for details.
3. **Filter with jq**: `segment sources --json --compact | jq '[.[] | select(.enabled)]'`
4. **Reduce tokens**: combine `--compact` and `--limit N`.
5. **Understand relationships**: use `--resolve` to map IDs to names.

## Common Workflows

```bash
# Workspace health check
segment overview --json

# List active sources
segment sources --json --compact | jq '[.[] | select(.enabled)]'

# Deep dive on a source (volume + destinations + transformations)
segment sources <srcId> --all --json

# Live event stream (real payloads, requires cloudflared)
segment sources tap <srcId> --json

# Debug a source (events/min, top events, last 5 minutes)
segment sources debug <srcId> --json --period 5

# Governance: get tracking plan rules
segment tracking-plans --json --compact          # find the plan ID
segment tracking-plans rules <tpId> --json --compact

# Find recent audit violations
segment audit --json --type violations --limit 10

# Check transformations with resolved names
segment transformations --json --resolve

# Reverse ETL: list models and their destination mappings
segment reverse-etl --json --compact --resolve
segment reverse-etl subscriptions <modelId> --json

# Governance: violations and coverage
segment violations --json                        # violations by source
segment coverage --json                          # which sources lack tracking plans

# Event volume by source
segment volume --json --group-by source

# Delivery health for a source
segment delivery egress --source <srcId> --json
```

## Architecture

```
src/index.ts          CLI entry (Commander.js)
src/client.ts         HTTP client (fetch, Bearer auth, retry, pagination)
src/tap.ts            Live event tap (cloudflared tunnel + temp webhook)
src/resolver.ts       Lazy-cached ID-to-name resolver
src/api/*.ts          API modules per resource
src/formatters/*.ts   Chalk formatters for terminal output
```
