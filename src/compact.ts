export const compactSource = (s: any) => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  enabled: s.enabled,
  ...(s.volume ? { volume: s.volume } : {}),
  ...(s.dests
    ? {
        connectedDestinations: s.dests.map((d: any) => ({
          name: d.name || d.metadata?.name,
          enabled: d.enabled,
        })),
      }
    : {}),
  ...(s.transforms
    ? { transformations: s.transforms.map((t: any) => ({ name: t.name, drop: t.drop, if: t.if })) }
    : {}),
});

export const compactDestination = (d: any) => ({
  id: d.id,
  name: d.name,
  enabled: d.enabled,
  sourceId: d.sourceId,
  type: d.metadata?.name,
});

export const compactTrackingPlan = (p: any) => ({
  id: p.id,
  name: p.name,
  type: p.type,
});

export const compactRule = (r: any) => ({
  key: r.key,
  type: r.type,
  version: r.version,
});

export const compactTransformation = (t: any) => ({
  id: t.id,
  name: t.name,
  enabled: t.enabled,
  sourceId: t.sourceId,
  destinationId: t.destinationId,
  if: t.if,
  drop: t.drop,
  newEventName: t.newEventName,
  ...(t.sourceName ? { sourceName: t.sourceName } : {}),
  ...(t.destinationName ? { destinationName: t.destinationName } : {}),
});

export const compactAuditEvent = (e: any) => ({
  id: e.id,
  timestamp: e.timestamp,
  type: e.type,
  actorEmail: e.actorEmail,
  resourceType: e.resourceType,
  resourceName: e.resourceName,
  ...(e.sourceName ? { sourceName: e.sourceName } : {}),
});

export const compactUser = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
});

export const compactRegulation = (r: any) => ({
  id: r.id,
  overallStatus: r.overallStatus,
  createdAt: r.createdAt,
  regulationType: r.regulateRequest?.regulationType,
});

export const compactReverseEtlModel = (m: any) => ({
  id: m.id,
  name: m.name,
  sourceId: m.sourceId,
  enabled: m.enabled,
  queryIdentifierColumn: m.queryIdentifierColumn,
  ...(m.sourceName ? { sourceName: m.sourceName } : {}),
});

export const compactSubscription = (s: any) => ({
  id: s.id,
  name: s.name,
  actionSlug: s.actionSlug,
  enabled: s.enabled,
  modelId: s.modelId,
});

export function defaultStart(): string {
  return `${new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]}T00:00:00Z`;
}

export function defaultEnd(): string {
  return `${new Date().toISOString().split("T")[0]}T23:59:59Z`;
}
