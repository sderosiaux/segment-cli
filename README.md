# segment-cli

Read-only CLI for [Segment](https://segment.com) Public API. Inspect sources, destinations, tracking plans, transformations, delivery, audit trail, and **tap into live events** from your terminal.

Built for governance, observability, and LLM-actionable output.

## Install

Requires [Bun](https://bun.sh). Optional: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for `sources tap`.

```bash
git clone https://github.com/sderosiaux/segment-cli.git
cd segment-cli
bun install
bun link

# Optional: for live event tapping
brew install cloudflared
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
segment sources debug <id>                       Diagnostic snapshot (events/min, top events)
segment sources tap <id>                         Live event stream (requires cloudflared)
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
segment tracking-plans rules tp_xxx --json | jq '.[].key'
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
$ segment sources tap rqVAu2fqXkQXNAAwud6Bfo

Tapping Console Frontend [Prod] (rqVAu2fqXkQXNAAwud6Bfo)
Events will appear below. Ctrl+C to stop and cleanup.

4:04:11 PM page     cdk.devtools.topicList.Viewed [1b52f875]
           path=/console/1ka51881d2x/topics title=Conduktor Console
4:04:12 PM page     cdk.devtools.home.Viewed [0dedfb24]
           path=/console/1wrmn title=Conduktor Console
4:04:14 PM identify user@company.com [f9957...]
           email=user@company.com company={"id":1,"name":"Acme","plan":"enterprise"}
4:04:14 PM track    cdk.devtools.topicDetails.browse.FirstMessage [f9957...]
           keyDeserializer=Automatic valueDeserializer=Automatic
4:04:32 PM track    cdk.devtools.cluster.connectionInitialized [1a1e1...]
           clusterProvider=confluent clusterType=remote
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

**Crash recovery:** If the CLI dies unexpectedly, a breadcrumb file (`/tmp/segment-cli-tap.json`) records the destination ID. On next run, it auto-cleans the stale destination. You can also run `segment sources tap-cleanup` manually.

### Source Debug (diagnostic snapshot)

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
         ...
```

### Source Deep Dive

```
$ segment sources rqVAu2fqXkQXNAAwud6Bfo --all

Name:       Console Frontend [Prod]
ID:         rqVAu2fqXkQXNAAwud6Bfo
Enabled:    yes
Type:       Javascript
Labels:     environment:prod

Volume (7d): 1,523,857 events

Connected Destinations (4):
  OFF Mixpanel for DevTools [Prod]
  ON  GTM Console
  OFF SatisMeter

Transformations (4):
  ON  Page Path Contains Home DROP
  ON  SaaS Filter DROP
  ON  Don't Send demo.conduktor Events to Intercom DROP
  ON  Prevent Default admin@ Creds Sending to Intercom DROP
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
