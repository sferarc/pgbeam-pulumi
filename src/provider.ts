import * as pulumi from "@pulumi/pulumi";
import { type ApiClient, ApiError, PgBeamClient } from "pgbeam";

interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
}

let globalConfig: ResolvedConfig | undefined;

const DEFAULT_BASE_URL = "https://api.pgbeam.com";

/**
 * Configure the PgBeam provider globally. Call this once in your Pulumi program
 * before creating any PgBeam resources, or use the PGBEAM_API_KEY and
 * PGBEAM_API_URL environment variables.
 */
export function configure(args: { apiKey: string; baseUrl?: string }): void {
  globalConfig = {
    apiKey: args.apiKey,
    baseUrl: args.baseUrl ?? DEFAULT_BASE_URL,
  };
}

/** @internal Resolve provider config from explicit config or environment. */
function getConfig(): ResolvedConfig {
  if (globalConfig) return globalConfig;

  const config = new pulumi.Config("pgbeam");
  const apiKey = config.get("apiKey") ?? process.env.PGBEAM_API_KEY;
  const baseUrl = config.get("baseUrl") ?? process.env.PGBEAM_API_URL ?? DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "PgBeam API key is required. Set pgbeam:apiKey in config, call configure(), or set PGBEAM_API_KEY.",
    );
  }

  return { apiKey, baseUrl };
}

/** @internal Create a PgBeam API client from current config. */
export function createClient(): ApiClient {
  const cfg = getConfig();
  const client = new PgBeamClient({
    token: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    // Pulumi operations are infrequent — retry aggressively to ride out
    // transient API unavailability (e.g. during rolling deployments).
    retry: { maxRetries: 10, initialDelayMs: 2000, maxDelayMs: 30_000 },
  });
  return client.api;
}

/** @internal Wrap API errors with context for Pulumi. */
export function handleApiError(operation: string, resource: string, err: unknown): never {
  if (err instanceof ApiError) {
    throw new Error(
      `PgBeam ${operation} ${resource} failed (${err.status}): ${err.statusText}${err.body ? ` — ${JSON.stringify(err.body)}` : ""}`,
    );
  }
  throw err;
}

/**
 * @internal Extract HTTP status from an API error. Works across module
 * boundaries where `instanceof ApiError` may fail due to Pulumi's bundling.
 */
export function apiErrorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    return (err as { status: number }).status;
  }
  return undefined;
}
