# Feature: segment-cli
## Status: Phase 5

## Problem
Who: Conduktor engineering/product team managing Segment analytics
Pain: No CLI or LLM-actionable way to inspect tracking plans, governance rules, event delivery, transformations, violations. Must use Segment UI manually, clicking through dozens of sources/destinations/tracking plans.
Trigger: Need to audit what events are tracked, which are dropped, what transformations are applied, who changed what
Impact: Slow governance review cycles, missed violations, no quick overview of analytics health
Why Now: Workspace has 20 sources, 29 destinations, 11 tracking plans, 14 transformations — too much to navigate manually

## Codebase Findings
### Related Code
| File | Relevance | Reuse? | Notes |
|------|-----------|--------|-------|
| `../linkedin-cli/src/index.ts` | CLI entry point pattern | Yes | Commander.js + output/fail helpers |
| `../linkedin-cli/src/api/client.ts` | HTTP client pattern | Partial | We use Bearer auth, much simpler |
| `../linkedin-cli/src/formatters/*.ts` | Output formatting | Yes | Chalk + hyperlinks + ASCII bars |
| `../linkedin-cli/package.json` | Build config | Yes | Bun + biome + husky |
| `../linkedin-cli/biome.json` | Linter config | Yes | Copy as-is |

### Integration Points
| Component | Connection | Risk |
|-----------|-----------|------|
| Segment Public API (EU) | HTTPS REST, Bearer token | Rate limits unknown |
| `.env` file | Token storage | Must not commit |

### Red Flags
None — greenfield project.

### Questions from Code
- linkedin-cli uses SQLite for persistence. Do we need that here? **No** — Segment persists data server-side. We're read-only.

## Certainty Map
### Known-Knowns
| Fact | Source | Confidence |
|------|--------|------------|
| EU base URL: `eu1.api.segmentapis.com` | API response redirect | Verified |
| Auth: Bearer token in Authorization header | Tested | Verified |
| ~80 GET endpoints available | API docs + testing | Verified |
| 20 sources, 29 destinations, 11 tracking plans | API responses | Verified |
| 14 transformations active | API response | Verified |
| Violations detected regularly on Console Backend/Frontend Prod | Audit events | Verified |
| Bun + Commander.js + Chalk + Biome stack works well | linkedin-cli | Verified |

### Known-Unknowns
| Question | Impact if Wrong | Resolution |
|----------|----------------|------------|
| API rate limits? | Commands may fail | Add retry + backoff like linkedin-cli |
| Pagination model for all endpoints? | Incomplete data | cursor-based, tested |
| Delivery overview empty — is it the time range or permissions? | Missing feature | Test with broader ranges |

### Assumptions
| Assumption | If Wrong | Validation |
|-----------|----------|------------|
| Single workspace is sufficient | Need multi-workspace support | Ask user |
| EU region is hardcoded | Won't work for US workspaces | Make configurable via env |

## Scope
### In (v1)

**Core commands** (read-only, all GET endpoints):

#### Workspace & Catalog
- `segment workspace` — workspace info (name, slug, id)

#### Sources
- `segment sources` — list all sources (id, name, slug, enabled)
- `segment sources <id>` — get source details
- `segment sources <id> destinations` — list connected destinations
- `segment sources <id> schema-settings` — schema validation config

#### Destinations
- `segment destinations` — list all destinations (id, name, enabled, type)
- `segment destinations <id>` — get destination details
- `segment destinations <id> filters` — list destination filters
- `segment destinations <id> subscriptions` — list subscriptions

#### Tracking Plans (Governance)
- `segment tracking-plans` — list all tracking plans
- `segment tracking-plans <id>` — get tracking plan details
- `segment tracking-plans <id> rules` — list all rules (event schemas)
- `segment tracking-plans <id> sources` — list connected sources

#### Transformations
- `segment transformations` — list all transformations (name, condition, drop/rename)
- `segment transformations <id>` — get transformation details

#### Event Delivery
- `segment delivery ingress` — ingress success/failed metrics
- `segment delivery egress` — egress success/failed metrics
- `segment delivery filtered` — filtered at source/destination
- `segment volume` — event volume (groupable by eventName, source, eventType)

#### Audit Trail
- `segment audit` — list recent audit events (violations, changes, user actions)
- Options: `--type`, `--resource`, `--start`, `--end`

#### Regulations
- `segment regulations` — list regulations (deletion/suppression requests)
- `segment suppressions` — list suppressed users

#### IAM
- `segment users` — list workspace users
- `segment users <id>` — user details

#### Usage
- `segment usage` — daily API call counts
- `segment usage mtu` — MTU (monthly tracked users) counts

### Out (Not v1)
- Functions — low priority, rarely inspected via CLI
- Reverse ETL — complex, separate domain
- Spaces/Audiences/Computed Traits — Engage features, not core governance
- Warehouses — secondary concern
- Selective Sync — niche
- Any WRITE operation — explicitly excluded for safety

### Future (v2+)
- `segment diff <tracking-plan-id>` — diff tracking plan rules between dates
- `segment health` — dashboard-style summary (volume, violations, delivery rates)
- `segment violations` — dedicated violations view (parsed from audit events)
- Local SQLite cache for offline access and trend analysis
- Functions listing
- Warehouse status

### Anti-Goals
- NO write operations (create, update, delete, patch) — production safety
- NO data sending/tracking — this is observability only
- NO interactive/TUI mode — pure CLI for LLM actionability
- NO multi-workspace switching in v1

## Edge Cases
| Scenario | Expected | Severity |
|----------|----------|----------|
| Token expired/invalid | Clear error: "Invalid token. Generate a new one at app.segment.com" | P1 |
| Wrong region (US token on EU endpoint) | Detect redirect message, suggest correct base URL | P1 |
| Empty results (no sources, no tracking plans) | Show "No X found." in yellow | P2 |
| Paginated results > 100 items | Auto-paginate, show progress | P2 |
| Rate limited (429) | Retry with backoff, max 3 attempts | P1 |
| Network timeout | "Connection timeout. Check your network." | P2 |
| Malformed API response | Log raw response to stderr, exit 1 | P3 |

## Failure Modes
| What Fails | User Sees | Recovery |
|-----------|-----------|----------|
| No .env file | "Missing SEGMENT_TOKEN. Set it in .env or as env var." | Auto |
| API 403 | "Token lacks permission for this resource." | Check token scopes |
| API 404 | "Resource not found: <id>" | Verify ID |
| API 500 | "Segment API error. Try again later." | Retry |

## Success Criteria

### Functional (Must)
- All v1 commands return correct data matching Segment UI
- `--json` flag on every command outputs raw JSON (LLM-actionable)
- Default output is formatted with Chalk colors (human-readable)
- Auto-pagination for all list endpoints
- Error messages are actionable (tell user what to do)

### Quality (Should)
- Response time < 2s for single-resource GETs
- Retry with backoff on 429/5xx
- Zero write operations — verified by code review

### User Outcome
- Run `segment tracking-plans` and see all governance rules in terminal
- Run `segment audit --json | jq '.[] | select(.type == "Violations Detected")'` to filter violations
- Run `segment transformations` to see all event transformations at a glance
- Run `segment delivery egress --source <id>` to check delivery health

### Demo Script
1. `segment sources` → see 20 sources with name, slug, enabled status
2. `segment tracking-plans` → see 11 tracking plans
3. `segment tracking-plans tp_2N3clI1nLyIgWceDI3aPsD1NmjL rules` → see DevTools Console event schemas
4. `segment transformations` → see 14 transformations with conditions
5. `segment audit --json` → get raw audit log for LLM processing
6. `segment volume --start 2026-03-12 --end 2026-03-19` → see event volume (2.5M events)

## Architecture

```
segment-cli/
├── src/
│   ├── index.ts              # CLI entry (Commander.js)
│   ├── client.ts             # HTTP client (fetch + Bearer auth + retry)
│   ├── api/
│   │   ├── sources.ts        # Sources endpoints
│   │   ├── destinations.ts   # Destinations + filters + subscriptions
│   │   ├── tracking-plans.ts # Tracking plans + rules
│   │   ├── transformations.ts# Transformations
│   │   ├── delivery.ts       # Delivery overview metrics
│   │   ├── events.ts         # Event volume
│   │   ├── audit.ts          # Audit trail
│   │   ├── regulations.ts    # Regulations + suppressions
│   │   ├── users.ts          # IAM users
│   │   └── usage.ts          # Usage/billing
│   └── formatters/
│       ├── sources.ts
│       ├── destinations.ts
│       ├── tracking-plans.ts
│       ├── transformations.ts
│       ├── delivery.ts
│       ├── events.ts
│       ├── audit.ts
│       ├── regulations.ts
│       ├── users.ts
│       └── usage.ts
├── package.json
├── tsconfig.json
├── biome.json
├── .env                      # SEGMENT_TOKEN + SEGMENT_REGION
├── .gitignore
└── specs/
    └── segment-cli.md        # This file
```

### HTTP Client (`client.ts`)

```typescript
// Config from env
const BASE_URLS = {
  us: "https://api.segmentapis.com",
  eu: "https://eu1.api.segmentapis.com",
};

// Simple fetch wrapper with:
// - Bearer auth from SEGMENT_TOKEN env
// - Auto-retry on 429/5xx (max 3, exponential backoff)
// - Auto-pagination (cursor-based)
// - Region from SEGMENT_REGION env (default: "eu")
```

### CLI Entry (`index.ts`)

```typescript
// Same pattern as linkedin-cli:
// - program.option("--json") for raw output
// - output(data, formatted) routing
// - fail(e) error handler
// - Each command: fetch → format → output
```

### API Modules (`api/*.ts`)

Each module exports:
1. TypeScript interface for the response shape
2. `list*()` function (with auto-pagination)
3. `get*()` function for single resource
4. Related sub-resource getters

### Formatters (`formatters/*.ts`)

Each module exports:
1. `format*(items)` → ANSI string
2. Uses Chalk for colors, tables for structured data
3. Hyperlinks to Segment UI where possible

## Tech Stack
| Component | Tool |
|-----------|------|
| Runtime | Bun |
| Language | TypeScript (strict) |
| CLI | Commander.js |
| Colors | Chalk |
| Linter | Biome |
| HTTP | Native fetch (Bun built-in) |
| Types | `@segment/public-api-sdk-typescript` (types only, not called) |
| Hooks | Husky + lint-staged |

No SQLite — no local persistence needed for v1.

### SDK Strategy
Install `@segment/public-api-sdk-typescript` for type definitions only. The SDK itself uses the deprecated `request` library and adds unnecessary boilerplate. We import types (`import type { ... }`) and make raw `fetch` calls with Bearer auth. This gives us full IDE autocomplete + type safety with zero runtime overhead.

## Env Config
```
SEGMENT_TOKEN=sgp_...        # Required
SEGMENT_REGION=eu            # Optional, default: "eu"
```

## Open Questions
- Should we support `SEGMENT_BASE_URL` override for custom/proxy endpoints?

## Decisions
| Decision | Rationale | Reversible? |
|----------|-----------|-------------|
| No SQLite | Data lives on Segment, no need to cache | Yes |
| EU default region | Conduktor workspace is EU | Yes |
| Bearer auth (not Basic) | Works, simpler than Basic | Yes |
| No write operations | Production safety, explicit anti-goal | No |
| Same stack as linkedin-cli | Proven, consistent across CLIs | Yes |
| SDK for types only, raw fetch for calls | SDK uses deprecated `request` lib, too heavy | Yes |
| Flat command structure (`segment sources`, not `segment source list`) | Simpler, more LLM-actionable | Yes |
| Auto-pagination by default | User expects all results | Yes |

## Changelog
- 2026-03-19: Created. API explored and validated. Spec written through Phase 5.
- 2026-03-19: Added SDK strategy — use `@segment/public-api-sdk-typescript` for types only.
