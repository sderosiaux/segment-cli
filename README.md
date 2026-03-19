# segment-cli

Read-only CLI for [Segment](https://segment.com) Public API. Inspect your sources, destinations, tracking plans, transformations, event delivery, audit trail, and more from your terminal.

Built for governance, observability, and LLM-actionable output. No write operations.

## Install

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/sderosiaux/segment-cli.git
cd segment-cli
bun install
bun link
```

## Setup

Create a `.env` file with your Segment Public API token:

```
SEGMENT_TOKEN=sgp_...
SEGMENT_REGION=eu    # optional, defaults to "eu". Use "us" for US workspaces.
```

Generate a token at [app.segment.com](https://app.segment.com) > Settings > Access Management > Tokens.

## Usage

```
segment overview                                 Workspace health summary
segment sources                                  List all sources
segment sources <id> --all                       Deep dive (volume, destinations, transforms)
segment sources debug <id>                       Live diagnostic (events/min, top events)
segment destinations                             List all destinations
segment destinations <id> --all                  Deep dive (filters, subscriptions)
segment tracking-plans                           List tracking plans
segment tracking-plans <id> rules                Event schemas (governance)
segment transformations                          List transformations
segment volume                                   Event volume (last 7 days)
segment delivery egress --source <id>            Delivery metrics
segment audit                                    Audit trail
segment users                                    Workspace users
segment regulations                              GDPR/deletion requests
segment usage                                    API call counts
segment usage mtu                                Monthly tracked users
```

Every command supports `--json` for structured output:

```bash
# List all tracking plan rules as JSON
segment tracking-plans rules tp_xxx --json | jq '.[].key'

# Find violation events
segment audit --json | jq '[.[] | select(.type == "Violations Detected")]'

# Count events per source
segment volume --group-by source --json
```

## Global Flags

| Flag | Purpose |
|---|---|
| `--json` | Structured JSON output for LLM/script consumption |
| `--compact` | Minimal JSON fields (id, name, enabled). Reduces 534KB to 5KB. |
| `--limit N` | Cap results to N items |
| `--resolve` | Enrich IDs with human-readable names |

## Examples

### Source Debug (live diagnostic)

```
$ segment sources debug rqVAu2fqXkQXNAAwud6Bfo

Debug: Console Frontend [Prod]
Period: last 60min (2:51 PM - 3:51 PM)

Total:  6,909 events (~115/min)

By Type:
  page              4,474
  track             1,890
  identify            579

Top Events (15):
       1,890 ██████████████████████████████ Conduktor Console
         906 ██████████████░░░░░░░░░░░░░░░░ cdk.devtools.topicList.Loaded
         703 ███████████░░░░░░░░░░░░░░░░░░░ cdk.devtools.topicDetails.browse.ConsumerEnded
         677 ███████████░░░░░░░░░░░░░░░░░░░ cdk.devtools.cluster.connectionInitialized
         670 ███████████░░░░░░░░░░░░░░░░░░░ cdk.devtools.topicDetails.browse.settings.Modified
         ...
```

### Source Deep Dive

```
$ segment sources rqVAu2fqXkQXNAAwud6Bfo --all

Name:       Console Frontend [Prod]
ID:         rqVAu2fqXkQXNAAwud6Bfo
Enabled:    yes
Write Keys: qmFf...
Type:       Javascript
Labels:     environment:prod

Volume (7d): 1,523,857 events

Connected Destinations (4):
  OFF Mixpanel for DevTools [Prod]
  OFF PLATFORM.PROD.CONSOLE
  ON  GTM Console
  OFF SatisMeter

Transformations (4):
  ON  Page Path Contains Home DROP
  ON  SaaS Filter DROP
  ON  Don't Send demo.conduktor Events to Intercom DROP
  ON  Prevent Default admin@ Creds Sending to Intercom DROP
```

### Tracking Plan Rules

```
$ segment tracking-plans rules tp_xxx

Rules (186):
  IDENTIFY (1):
    (root) (3 props, 0 required)

  TRACK (185):
    cdk.admin.cluster.Added (3 props, 0 required)
    cdk.admin.cluster.Deleted (3 props, 0 required)
    ...
```

### Workspace Overview

```
$ segment overview

Workspace Overview

Sources:         7 active / 21 total
Destinations:    3 active / 29 total
Tracking Plans: 11
Transformations: 14 active (14 dropping)
Violations:     43 recent on: Console Frontend [Prod], Console Backend [Prod]
Volume (7d):    3,055,482 events
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `overview` | Workspace health summary |
| `sources [id]` | List sources or get details (`--all`, `--volume`, `--destinations`, `--transformations`, `--schema`) |
| `sources debug <id>` | Live diagnostic: events/min, top events, violations (`--period <min>`) |
| `sources destinations <id>` | Connected destinations |
| `sources schema-settings <id>` | Schema validation config |
| `destinations [id]` | List destinations or get details (`--all`, `--filters`, `--subscriptions`) |
| `destinations filters <id>` | Destination filters |
| `destinations subscriptions <id>` | Destination subscriptions |
| `tracking-plans [id]` | List tracking plans or get details |
| `tracking-plans rules <id>` | Event schemas / governance rules (`--type TRACK`) |
| `tracking-plans sources <id>` | Connected sources |
| `transformations [id]` | List transformations (`--source <id>`) |
| `delivery <type>` | Delivery metrics (egress, filtered-source, etc.) |
| `volume` | Event volume (`--group-by eventName`, `--source <id>`) |
| `audit` | Audit trail (`--type`, `--resource`, `--start`, `--end`) |
| `regulations` | GDPR deletion/suppression requests |
| `suppressions` | Suppressed users |
| `users [id]` | Workspace users |
| `usage` | API call counts per source |
| `usage mtu` | Monthly tracked users |

## Design

- **Read-only** -- no write operations, safe to use on production workspaces
- **LLM-actionable** -- `--json` on every command for structured output
- **Auto-pagination** -- fetches all pages automatically
- **Retry with backoff** -- handles 429 rate limits and server errors
- **EU + US regions** -- configurable via `SEGMENT_REGION`

## Stack

Bun, TypeScript, Commander.js, Chalk.

## License

MIT
