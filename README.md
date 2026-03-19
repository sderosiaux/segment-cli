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
segment sources                                  List all sources
segment sources <id>                             Source details
segment destinations                             List all destinations
segment destinations <id> filters                Destination filters
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

## Examples

### Sources

```
$ segment sources

Sources (21):
  ON  Gateway [Prod]                                7RLVCZKs8ymUn689jJG8yp environment:prod
  ON  Console Backend [Prod]                        d8yT8TV69vSgsqmkJuKdAg
  ON  Console Frontend [Prod]                       rqVAu2fqXkQXNAAwud6Bfo environment:prod
  OFF Monitoring [Dev]                              9geMNCSwzCEew5oFRbTKmS environment:dev
  ...
```

### Tracking Plan Rules

```
$ segment tracking-plans rules tp_2N3clI1nLyIgWceDI3aPsD1NmjL

Rules (186):
  IDENTIFY (1):
    (root) (3 props, 0 required)

  TRACK (185):
    cdk.admin.cluster.Added (3 props, 0 required)
    cdk.admin.cluster.Deleted (3 props, 0 required)
    cdk.admin.group.Created (3 props, 0 required)
    ...
```

### Transformations

```
$ segment transformations

Transformations (14):
  ON  Page Path Contains Home                                 DROP
       if: !(contains ( context.page.path , "/home" ))
       source: rqVAu2fqXkQXNAAwud6Bfo -> dest: 655a50937a263f696a27357f
  ON  Don't Send demo.conduktor Events to Intercom            DROP
       if: contains ( context.page.url , "demo.conduktor.io" )
       source: rqVAu2fqXkQXNAAwud6Bfo -> dest: 6311c75394f4a8d37c4bf6d6
  ...
```

### Audit Trail

```
$ segment audit

Audit Events (93):
  Mar 16 at 12:00 PM Violations Detected
                    system source: Console Frontend [Prod]
  Mar 14 at 12:00 PM Violations Detected
                    system source: Console Backend [Prod]
  Mar 10 at 03:47 PM Integration Disabled
                    user@company.io integration: Tempo Server [Prod] - Mixpanel (Legacy)
  ...
```

### Event Volume

```
$ segment volume

Total events: 3,055,482
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `sources [id]` | List sources or get details |
| `sources destinations <sourceId>` | Connected destinations |
| `sources schema-settings <sourceId>` | Schema validation config |
| `destinations [id]` | List destinations or get details |
| `destinations filters <destId>` | Destination filters |
| `destinations subscriptions <destId>` | Destination subscriptions |
| `tracking-plans [id]` | List tracking plans or get details |
| `tracking-plans rules <tpId>` | Event schemas / governance rules |
| `tracking-plans sources <tpId>` | Connected sources |
| `transformations [id]` | List transformations or get details |
| `delivery <type>` | Delivery metrics (egress, filtered-source, etc.) |
| `volume` | Event volume with optional grouping |
| `audit` | Audit trail with filters |
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
