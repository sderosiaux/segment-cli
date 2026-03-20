# segment-cli

Read-only CLI for [Segment](https://segment.com) Public API. Inspect sources, destinations, tracking plans, transformations, delivery, audit trail, and **tap into live events** from your terminal.

Built for governance, observability, and LLM-actionable output.

## Install

### As a Claude Code skill (recommended)

```bash
npx skills add sderosiaux/segment-cli
```

This gives your AI agent full knowledge of the CLI: commands, flags, workflows, and token-saving patterns.

### CLI binary

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/sderosiaux/segment-cli.git ~/.local/share/segment-cli
cd ~/.local/share/segment-cli && bun install && bun link
```

Optional: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for `sources tap` (live event stream).

```bash
brew install cloudflared
```

## Setup

Create `~/.config/segment-cli/config` with your Segment Public API token:

```bash
mkdir -p ~/.config/segment-cli
cat > ~/.config/segment-cli/config << 'EOF'
SEGMENT_TOKEN=sgp_...
SEGMENT_REGION=eu
EOF
```

`SEGMENT_REGION` is optional (defaults to `eu`). Use `us` for US workspaces.

Alternatively, use `~/.segmentrc` or export `SEGMENT_TOKEN` as an env var.

Generate a token at [app.segment.com](https://app.segment.com) > Settings > Access Management > Tokens.

## Usage

```
segment overview                                 Workspace health summary
segment sources                                  List all sources
segment sources <id> --all                       Deep dive (volume, destinations, transforms)
segment sources debug <id>                       Diagnostic snapshot (events/min, top events)
segment sources tap <id>                         Live event stream (requires cloudflared)
segment destinations                             List all destinations
segment destinations <id> --all                  Deep dive (filters, subscriptions)
segment tracking-plans                           List tracking plans
segment tracking-plans <id> rules                Event schemas (governance)
segment transformations                          List transformations
segment reverse-etl                              Reverse ETL models (SQL queries)
segment violations                               Schema violations summary
segment coverage                                 Tracking plan coverage map
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
segment tracking-plans rules <tpId> --json | jq '.[].key'
segment audit --json | jq '[.[] | select(.type == "Violations Detected")]'
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

### Live Event Stream (tap)

Stream real events flowing through a source. Creates a temporary webhook destination, tunnels events through cloudflared to your machine, and cleans up on exit.

```
$ segment sources tap <sourceId>

Tapping My App [Prod] (<sourceId>)
Events will appear below. Ctrl+C to stop and cleanup.

4:04:11 PM page     app.dashboard.Viewed [1b52f875]
           path=/dashboard title=My App url=https://app.example.com/dashboard
4:04:14 PM identify user@example.com [f9957...]
           email=user@example.com company={"id":1,"name":"Acme","plan":"enterprise"}
4:04:14 PM track    app.feature.Used [f9957...]
           feature=export format=csv
4:04:32 PM track    app.cluster.Connected [1a1e1...]
           provider=aws region=us-east-1
^C
Cleaning up...
Webhook destination deleted.
Total events received: 23
```

How it works:
1. Starts a local HTTP server on port 9876
2. Opens a [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) tunnel to expose it publicly
3. Creates a temporary Webhooks (Actions) destination on Segment pointing to the tunnel
4. Displays events as they arrive (color-coded by type: track, page, identify)
5. On Ctrl+C: deletes the webhook destination, stops the tunnel

**Crash recovery:** If the CLI dies unexpectedly, a breadcrumb file (`/tmp/segment-cli-tap.json`) records the destination ID. On next run of any command, it auto-cleans the stale destination. You can also run `segment sources tap-cleanup` manually.

### Source Debug (diagnostic snapshot)

```
$ segment sources debug <sourceId>

Debug: My App [Prod]
Period: last 60min (2:51 PM - 3:51 PM)

Total:  6,909 events (~115/min)

By Type:
  page              4,474
  track             1,890
  identify            579

Top Events (15):
       1,890 ██████████████████████████████ app.dashboard.Viewed
         906 ██████████████░░░░░░░░░░░░░░░░ app.feature.Used
         703 ███████████░░░░░░░░░░░░░░░░░░░ app.user.LoggedIn
         677 ███████████░░░░░░░░░░░░░░░░░░░ app.cluster.Connected
         ...
```

### Source Deep Dive

```
$ segment sources <sourceId> --all

Name:       My App [Prod]
ID:         <sourceId>
Enabled:    yes
Type:       Javascript
Labels:     environment:prod

Volume (7d): 1,523,857 events

Connected Destinations (4):
  OFF Mixpanel
  ON  Google Tag Manager
  OFF SatisMeter

Transformations (2):
  ON  Filter Internal Traffic DROP
  ON  Don't Send Demo Events to Intercom DROP
```

### Reverse ETL

```
$ segment reverse-etl

Reverse ETL Models (2):
  ON  MAU per Organization (30d)                         [organization] <modelId>
  ON  Last Active + Cluster Count                        [email] <modelId>

$ segment reverse-etl <modelId>

Name:       MAU per Organization (30d)
ID:         <modelId>
Enabled:    yes
Source:     BigQuery
Identifier: organization

Query:
SELECT organization, COUNT(DISTINCT(user_id)) as MAU
  FROM identifies WHERE ...
 GROUP BY organization

$ segment reverse-etl subscriptions <modelId>

Subscriptions for "MAU per Organization (30d)" (1):
  ON  Upsert Company [upsertCompany]
       → HubSpot Prod <subscriptionId>
```

### Governance: Violations & Coverage

```
$ segment violations

Violations (43):

By Source:
    30 API Backend [Prod]
    13 My App [Prod]

Timeline:
  Mar 16 at 12:00 PM My App [Prod]
  Mar 14 at 12:00 PM API Backend [Prod]
  Mar 10 at 12:00 PM My App [Prod]
  ...

$ segment coverage

Tracking Plan Coverage

Sources:  7 active / 21 total
Covered:  12 sources across 11 plans

My App Tracking Plan (1 sources)
  ● My App [Prod]

API Events Tracking Plan (2 sources)
  ● API Backend [Prod]
  ● API Backend [Dev]

Uncovered Active Sources (1):
  ○ BigQuery <sourceId>
```

### Workspace Overview

```
$ segment overview

Workspace Overview

Sources:         7 active / 21 total
Destinations:    3 active / 29 total
Tracking Plans: 11
Transformations: 14 active (14 dropping)
Violations:     43 recent on: My App [Prod], API Backend [Prod]
Volume (7d):    3,055,482 events
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `overview` | Workspace health summary |
| `sources [id]` | List or detail (`--all`, `--volume`, `--destinations`, `--transformations`, `--schema`, `--enabled`) |
| `sources debug <id>` | Diagnostic snapshot: events/min, top events, violations (`--period <min>`) |
| `sources tap <id>` | Live event stream via temporary webhook (requires `cloudflared`) |
| `sources tap-cleanup` | Manual cleanup of stale tap destination |
| `sources destinations <id>` | Connected destinations |
| `sources schema-settings <id>` | Schema validation config |
| `destinations [id]` | List or detail (`--all`, `--filters`, `--subscriptions`, `--enabled`) |
| `destinations filters <id>` | Destination filters |
| `destinations subscriptions <id>` | Destination subscriptions |
| `tracking-plans [id]` | List tracking plans or detail |
| `tracking-plans rules <id>` | Event schemas / governance rules (`--type TRACK`) |
| `tracking-plans sources <id>` | Connected sources |
| `transformations [id]` | List transformations (`--source <id>`, `--resolve`) |
| `reverse-etl [id]` | List Reverse ETL models or detail (includes SQL query) |
| `reverse-etl subscriptions <id>` | Destination mappings linked to a Reverse ETL model |
| `violations` | Schema violations summary by source (`--source`, `--limit`) |
| `coverage` | Tracking plan coverage: which sources are covered, which are not |
| `delivery <type>` | Delivery metrics (egress, filtered-source, etc.) |
| `volume` | Event volume (`--group-by eventName`, `--source <id>`) |
| `audit` | Audit trail (`--type`, `--resource`, `--start`, `--end`) |
| `regulations` | GDPR deletion/suppression requests |
| `suppressions` | Suppressed users |
| `users [id]` | Workspace users |
| `usage` | API call counts per source |
| `usage mtu` | Monthly tracked users |

## Design

- **Read-only** -- no write operations (tap creates/deletes a temporary webhook, self-cleaning)
- **LLM-actionable** -- `--json` on every command for structured output
- **Auto-pagination** -- fetches all pages automatically
- **Retry with backoff** -- handles 429 rate limits and server errors
- **EU + US regions** -- configurable via `SEGMENT_REGION`

## Stack

Bun, TypeScript, Commander.js, Chalk, cloudflared.

## License

MIT
