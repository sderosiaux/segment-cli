---
name: segment-cli
description: Manage your Segment.com workspace from the CLI. Use when the user asks about Segment sources, destinations, tracking plans, transformations, event delivery, violations, or wants to inspect their analytics pipeline. Triggers on "segment sources", "check my tracking plans", "event volume", "schema violations", "reverse ETL", "tap into events".
metadata:
  author: sderosiaux
  version: "1.0.0"
---

# Segment CLI

Read-only CLI for Segment.com Public API. Inspect sources, destinations, tracking plans, transformations, delivery, violations, and tap into live events.

## Step 1: Check if installed

```bash
segment --version 2>/dev/null || echo "NOT_INSTALLED"
```

If not installed:

```bash
# Requires Bun (https://bun.sh)
git clone https://github.com/sderosiaux/segment-cli.git ~/.local/share/segment-cli
cd ~/.local/share/segment-cli && bun install && bun link
```

## Step 2: Check authentication

```bash
segment overview --json 2>/dev/null | head -1 || echo "AUTH_FAILED"
```

If auth fails, the user needs to configure their token:

```bash
mkdir -p ~/.config/segment-cli
echo "SEGMENT_TOKEN=sgp_..." > ~/.config/segment-cli/config
# Optional: SEGMENT_REGION=us (defaults to eu)
```

Generate a token at app.segment.com > Settings > Access Management > Tokens.

## Usage

### Global flags (use on every command)

| Flag | Purpose |
|---|---|
| `--json` | **Always use this.** Structured JSON output for parsing. |
| `--compact` | Minimal fields (id, name, enabled). Reduces 534KB to 5KB. |
| `--limit N` | Cap array results to N items. |
| `--resolve` | Enrich opaque IDs with human-readable names. |

### Discovery flow (how to explore a workspace)

```bash
# 1. Start with overview
segment overview --json

# 2. List resources (cheap, compact)
segment sources --json --compact
segment destinations --json --compact
segment tracking-plans --json --compact

# 3. Deep dive on one resource
segment sources <id> --all --json

# 4. Debug a source (events/min, top events)
segment sources debug <id> --json --period 5

# 5. Live event stream (requires cloudflared)
segment sources tap <id> --json
```

### All commands

```
segment overview                             Workspace health summary
segment sources [id]                         List/get sources (--enabled, --all, --volume, --destinations, --transformations, --schema)
segment sources debug <id>                   Diagnostic snapshot (--period <min>)
segment sources tap <id>                     Live event stream (requires cloudflared)
segment sources tap-cleanup                  Manual cleanup of stale tap destination
segment sources destinations <id>            Connected destinations
segment sources schema-settings <id>         Schema validation config
segment destinations [id]                    List/get destinations (--enabled, --all, --filters, --subscriptions)
segment destinations filters <id>            Destination filters
segment destinations subscriptions <id>      Subscriptions
segment destinations delete <id...>          Delete destinations (--force)
segment tracking-plans [id]                  List/get tracking plans
segment tracking-plans rules <id>            Event schemas (--type TRACK|IDENTIFY|PAGE)
segment tracking-plans sources <id>          Connected sources
segment transformations [id]                 List/get transformations (--source <id>, --resolve)
segment reverse-etl [id]                     Reverse ETL models with SQL queries
segment reverse-etl subscriptions <id>       Destination mappings for a model
segment violations                           Schema violations by source (--source, --limit)
segment coverage                             Tracking plan coverage map
segment delivery <type> --source <id>        Delivery metrics (egress, filtered-source, etc.)
segment volume                               Event volume (--group-by eventName|source, --source <id>)
segment audit                                Audit trail (--type, --resource, --start, --end)
segment regulations                          GDPR deletion/suppression requests
segment suppressions                         Suppressed users
segment users [id]                           Workspace users
segment usage                                API call counts (--period YYYY-MM-01)
segment usage mtu                            Monthly tracked users
```

### Common workflows

```bash
# Workspace health
segment overview --json

# Active sources only
segment sources --json --compact --enabled

# Full source inspection (volume + destinations + transforms)
segment sources <id> --all --json --compact

# Governance audit
segment violations --json
segment coverage --json --compact

# Tracking plan rules (filter by type)
segment tracking-plans rules <tpId> --json --compact --type TRACK

# Transformations with resolved names
segment transformations --json --compact --resolve

# Reverse ETL models and their HubSpot mappings
segment reverse-etl --json --compact --resolve
segment reverse-etl subscriptions <modelId> --json

# Event volume breakdown
segment volume --json --group-by eventName --source <id>

# Real-time event stream (requires cloudflared)
segment sources tap <id> --json
```

### Token-saving patterns

- Use `--compact` to reduce JSON from hundreds of KB to <5KB
- Use `--limit N` to cap results (e.g. `--limit 10`)
- Combine: `--json --compact --limit 5` for minimal token usage
- Use `--resolve` only when you need to understand ID relationships
- Start with `overview --json` to orient, then drill down
