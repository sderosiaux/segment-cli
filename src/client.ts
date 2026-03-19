const REGIONS: Record<string, string> = {
  us: "https://api.segmentapis.com",
  eu: "https://eu1.api.segmentapis.com",
};

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function getToken(): string {
  const token = process.env.SEGMENT_TOKEN;
  if (!token) {
    console.error("SEGMENT_TOKEN is not set. Export it before running segment-cli.");
    process.exit(1);
  }
  return token;
}

function getBaseUrl(): string {
  const region = (process.env.SEGMENT_REGION ?? "eu").toLowerCase();
  const url = REGIONS[region];
  if (!url) {
    console.error(`Unknown SEGMENT_REGION "${region}". Use "us" or "eu".`);
    process.exit(1);
  }
  return url;
}

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, getBaseUrl());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

function detectWrongRegion(body: any): string | null {
  const msg: string = body?.errors?.[0]?.message ?? body?.error?.message ?? "";
  if (/must be sent to Segment's (EU|US)-hosted API/i.test(msg)) {
    return msg;
  }
  return null;
}

function httpError(status: number, body: any): Error {
  const detail: string = body?.errors?.[0]?.message ?? body?.error?.message ?? JSON.stringify(body);

  switch (status) {
    case 401:
      return new Error(`401 Unauthorized — check your SEGMENT_TOKEN. ${detail}`);
    case 403:
      return new Error(`403 Forbidden — token lacks permission. ${detail}`);
    case 404:
      return new Error(`404 Not Found — resource does not exist. ${detail}`);
    default:
      if (status >= 500) {
        return new Error(`${status} Server Error — ${detail}`);
      }
      return new Error(`HTTP ${status} — ${detail}`);
  }
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    const res = await fetch(url, init);

    if (res.ok) return res;

    const body = await res.json().catch(() => ({}));

    const wrongRegion = detectWrongRegion(body);
    if (wrongRegion) {
      throw new Error(`Wrong region: ${wrongRegion}`);
    }

    if (res.status === 429 || res.status >= 500) {
      lastError = httpError(res.status, body);
      continue;
    }

    throw httpError(res.status, body);
  }

  throw lastError ?? new Error("Request failed after retries");
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });
  return res.json() as Promise<T>;
}

/** Single resource GET — unwraps { data: T } envelope. */
export async function segmentGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const envelope = await request<{ data: T }>(path, params);
  return envelope.data;
}

/** Raw GET — returns full response without unwrapping. */
export async function segmentGetRaw<T>(path: string, params?: Record<string, string>): Promise<T> {
  return await request<T>(path, params);
}

/** DELETE — returns success status. */
export async function segmentDelete(path: string): Promise<{ status: string }> {
  const url = buildUrl(path);
  const res = await fetchWithRetry(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });
  return await (res.json() as Promise<{ data: { status: string } }>).then((d) => d.data);
}

/** Paginated list GET — auto-paginates using cursor, returns all items. */
export async function segmentGetAll<T>(
  path: string,
  dataKey: string,
  params?: Record<string, string>,
  pageSize = 100,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;

  for (;;) {
    const pageParams: Record<string, string> = {
      ...params,
      "pagination[count]": String(pageSize),
    };
    if (cursor) {
      pageParams["pagination[cursor]"] = cursor;
    }

    const envelope = await request<any>(path, pageParams);

    // Items may be at data[dataKey] or top-level [dataKey]
    const page: T[] = envelope?.data?.[dataKey] ?? envelope?.[dataKey] ?? [];
    items.push(...page);

    // Pagination cursor may be inside data or at top level
    const next: string | undefined = envelope?.data?.pagination?.next ?? envelope?.pagination?.next;

    if (!next || page.length === 0) break;
    cursor = next;
  }

  return items;
}
