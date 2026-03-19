import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import chalk from "chalk";
import { segmentGet } from "./client.ts";

const TAP_BREADCRUMB = "/tmp/segment-cli-tap.json";
const TAP_PREFIX = "__segment-cli-tap-";
const LOCAL_PORT = 9876;
const WEBHOOK_METADATA_ID = "614a3c7d791c91c41bae7599";
const WEBHOOK_ACTION_ID = "nFPnRozhz1mh4Gbx4MLvT5";

interface TapState {
  destinationId: string;
  sourceId: string;
  createdAt: string;
}

// --- Preflight ---

declare const Bun: { spawnSync(cmd: string[]): { exitCode: number } };

export function checkCloudflared(): boolean {
  try {
    const result = Bun.spawnSync(["cloudflared", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// --- Breadcrumb (crash recovery) ---

function saveBreadcrumb(state: TapState) {
  writeFileSync(TAP_BREADCRUMB, JSON.stringify(state));
}

export function hasStaleTap(): boolean {
  return existsSync(TAP_BREADCRUMB);
}

function loadBreadcrumb(): TapState | null {
  if (!existsSync(TAP_BREADCRUMB)) return null;
  try {
    return JSON.parse(readFileSync(TAP_BREADCRUMB, "utf-8"));
  } catch {
    return null;
  }
}

function clearBreadcrumb() {
  try {
    unlinkSync(TAP_BREADCRUMB);
  } catch {
    // File may not exist, that's fine
  }
}

// --- Segment API (write ops for tap only) ---

async function createWebhookDestination(sourceId: string, url: string): Promise<string> {
  const name = `${TAP_PREFIX}${Date.now()}__`;
  const response = await fetch(buildSegmentUrl("/destinations"), {
    method: "POST",
    headers: segmentHeaders(),
    body: JSON.stringify({
      sourceId,
      metadataId: WEBHOOK_METADATA_ID,
      name,
      enabled: true,
      settings: {},
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to create webhook destination: ${body?.errors?.[0]?.message || response.status}`,
    );
  }

  const body = await response.json();
  const destId = body.data.destination.id;

  // Create subscription to forward all events
  const subResponse = await fetch(buildSegmentUrl(`/destinations/${destId}/subscriptions`), {
    method: "POST",
    headers: segmentHeaders(),
    body: JSON.stringify({
      name: "segment-cli-tap",
      actionId: WEBHOOK_ACTION_ID,
      actionSlug: "send",
      enabled: true,
      trigger:
        'type = "track" or type = "identify" or type = "page" or type = "group" or type = "screen"',
      settings: {
        url,
        method: "POST",
        data: { "@path": "$." },
      },
    }),
  });

  if (!subResponse.ok) {
    // Cleanup destination if subscription fails
    await deleteDestination(destId);
    const subBody = await subResponse.json().catch(() => ({}));
    throw new Error(
      `Failed to create subscription: ${subBody?.errors?.[0]?.message || subResponse.status}`,
    );
  }

  return destId;
}

async function deleteDestination(destId: string): Promise<boolean> {
  const response = await fetch(buildSegmentUrl(`/destinations/${destId}`), {
    method: "DELETE",
    headers: segmentHeaders(),
  });
  return response.ok;
}

function buildSegmentUrl(path: string): string {
  const region = (process.env.SEGMENT_REGION ?? "eu").toLowerCase();
  const base = region === "us" ? "https://api.segmentapis.com" : "https://eu1.api.segmentapis.com";
  return `${base}${path}`;
}

function segmentHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.SEGMENT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// --- Cleanup stale taps ---

export async function cleanupStaleTap(): Promise<boolean> {
  const stale = loadBreadcrumb();
  if (!stale) return false;

  console.error(
    chalk.yellow(
      `Found stale tap destination ${stale.destinationId} (from ${stale.createdAt}). Cleaning up...`,
    ),
  );
  const deleted = await deleteDestination(stale.destinationId);
  clearBreadcrumb();
  if (deleted) {
    console.error(chalk.green("Stale tap destination cleaned up."));
  } else {
    console.error(chalk.dim("Stale destination already removed (or token changed)."));
  }
  return true;
}

// --- Cloudflared tunnel ---

function startTunnel(port: number): Promise<{ process: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "cloudflared",
      [
        "tunnel",
        "--no-autoupdate",
        "--loglevel",
        "error",
        "--protocol",
        "http2",
        "--metrics",
        "localhost:0",
        "--url",
        `http://localhost:${port}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let resolved = false;
    const stderrChunks: string[] = [];

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        const output = stderrChunks.join("").trim();
        reject(new Error(`Cloudflared failed to start within 30s.\n${output}`));
      }
    }, 30000);

    const handleOutput = (data: Buffer) => {
      const line = data.toString();
      stderrChunks.push(line);
      const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        proc.stderr?.removeAllListeners("data");
        proc.stdout?.removeAllListeners("data");
        resolve({ process: proc, url: match[0] });
      }
    };

    proc.stderr?.on("data", handleOutput);
    proc.stdout?.on("data", handleOutput);
    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
    proc.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const output = stderrChunks.join("").trim();
        reject(new Error(`Cloudflared exited with code ${code}.\n${output}`));
      }
    });
  });
}

// --- Local HTTP server ---

interface TapEvent {
  timestamp: string;
  type: string;
  event?: string;
  userId?: string;
  anonymousId?: string;
  properties?: Record<string, any>;
  traits?: Record<string, any>;
  context?: Record<string, any>;
}

function startServer(port: number, onEvent: (event: TapEvent) => void): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');

      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        onEvent(body);
      } catch {
        // Ignore malformed payloads
      }
    });
  });

  server.listen(port);
  return server;
}

// --- Formatters ---

function formatTapEvent(event: TapEvent, jsonMode: boolean): string {
  if (jsonMode) return JSON.stringify(event);

  const time = chalk.dim(new Date().toLocaleTimeString());
  const type =
    event.type === "track"
      ? chalk.green(event.type.padEnd(8))
      : event.type === "identify"
        ? chalk.blue(event.type.padEnd(8))
        : event.type === "page"
          ? chalk.cyan(event.type.padEnd(8))
          : chalk.white((event.type || "unknown").padEnd(8));

  const name = event.event || event.properties?.name || event.traits?.email || "";
  const userId = event.userId || event.anonymousId?.slice(0, 8) || "";

  const parts = [`${time} ${type} ${chalk.bold(name)}`];
  if (userId) parts[0] += chalk.dim(` [${userId}]`);

  // Show key properties (not all, just the interesting ones)
  const props = event.properties || event.traits || {};
  const keys = Object.keys(props).filter((k) => !k.startsWith("__") && k !== "name");
  if (keys.length > 0) {
    const preview = keys.slice(0, 5).map((k) => {
      const v = props[k];
      const val = typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v);
      return `${chalk.dim(k)}=${val}`;
    });
    parts.push(`         ${preview.join(" ")}`);
  }

  return parts.join("\n");
}

// --- Main tap function ---

export async function runTap(sourceId: string, opts: { json: boolean }) {
  // 1. Preflight
  if (!checkCloudflared()) {
    console.error(chalk.red("cloudflared is not installed."));
    console.error(chalk.dim("Install: brew install cloudflared"));
    process.exit(1);
  }

  // 2. Cleanup any stale tap
  await cleanupStaleTap();

  // 3. Verify source exists
  console.error(chalk.dim("Verifying source..."));
  const source = await segmentGet<{ source: any }>(`/sources/${sourceId}`);
  const sourceName = source.source.name;
  console.error(chalk.dim(`Source: ${sourceName}`));

  // 4. Start local server
  let eventCount = 0;
  const server = startServer(LOCAL_PORT, (event) => {
    eventCount++;
    console.log(formatTapEvent(event, opts.json));
  });
  console.error(chalk.dim(`Local server on :${LOCAL_PORT}`));

  // 5. Start cloudflared tunnel
  console.error(chalk.dim("Starting tunnel (takes a few seconds)..."));
  let tunnel: { process: ChildProcess; url: string };
  try {
    tunnel = await startTunnel(LOCAL_PORT);
  } catch (err: any) {
    server.close();
    console.error(chalk.red(`Tunnel failed: ${err.message}`));
    process.exit(1);
  }
  console.error(chalk.dim(`Tunnel: ${tunnel.url}`));

  // 6. Create webhook destination on Segment
  console.error(chalk.dim("Creating temporary webhook destination..."));
  let destinationId: string;
  try {
    destinationId = await createWebhookDestination(sourceId, `${tunnel.url}/events`);
  } catch (err: any) {
    tunnel.process.kill();
    server.close();
    console.error(chalk.red(`Failed: ${err.message}`));
    process.exit(1);
  }

  // 7. Save breadcrumb for crash recovery
  saveBreadcrumb({
    destinationId,
    sourceId,
    createdAt: new Date().toISOString(),
  });

  console.error(chalk.green(`\nTapping ${chalk.bold(sourceName)} (${sourceId})`));
  console.error(chalk.dim(`Destination: ${destinationId}`));
  console.error(chalk.dim("Events will appear below. Ctrl+C to stop and cleanup.\n"));
  console.error(chalk.dim("Note: first events may take 30-60s to arrive (Segment batching).\n"));

  // 8. Cleanup on exit
  const cleanup = async () => {
    console.error(chalk.dim("\n\nCleaning up..."));

    // Delete Segment destination
    const deleted = await deleteDestination(destinationId);
    if (deleted) {
      console.error(chalk.green("Webhook destination deleted."));
    } else {
      console.error(chalk.yellow("Could not delete destination (may need manual cleanup)."));
    }
    clearBreadcrumb();

    // Kill tunnel
    tunnel.process.kill();

    // Stop server
    server.close();

    console.error(chalk.dim(`Total events received: ${eventCount}`));
    process.exit(0);
  };

  // Handle all exit signals
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("uncaughtException", async (err) => {
    console.error(chalk.red(`Uncaught error: ${err.message}`));
    await cleanup();
  });
  process.on("unhandledRejection", async (err: any) => {
    console.error(chalk.red(`Unhandled rejection: ${err?.message || err}`));
    await cleanup();
  });
}
