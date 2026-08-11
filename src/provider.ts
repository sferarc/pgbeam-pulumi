/**
 * Shared runtime for the generated PgBeam dynamic resource providers.
 *
 * SERIALIZATION CONSTRAINT. Pulumi captures a dynamic provider's closure by
 * value into stack state. This package is linked into `infra` as a workspace
 * symlink, so its real path sits outside `node_modules` and Pulumi's closure
 * serializer classifies it as a local module: it is serialized by value rather
 * than emitted as a `require`. The serializer only knows primitives, arrays,
 * plain objects, functions, RegExp and Promise. A `Set` comes back as `{}` with
 * `Set.prototype.has` pinned on it, so the first `.has()` throws "Method
 * Set.prototype.has called on incompatible receiver". So: no Set, Map, WeakMap,
 * WeakSet or Date at module scope here, and no class instance holding internal
 * slots. Use arrays and plain objects. Values built inside a function body are
 * fine; only captured ones are serialized. `src/serialization.test.ts` enforces
 * this. See `brain/infrastructure/pulumi.md`.
 */

import * as pulumi from "@pulumi/pulumi";
import { type ApiClient, ApiError, describeError, PgBeamClient } from "pgbeam";

interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
}

let globalConfig: ResolvedConfig | undefined;

const DEFAULT_BASE_URL = "https://api.pgbeam.com";

/**
 * Per-request timeout. A Pulumi operation is a handful of small JSON calls, so
 * anything past this is a socket that is never going to answer.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Retry budget for a single API call.
 *
 * Pulumi operations are infrequent, so a few retries are worth it to ride out a
 * rolling API deployment. The budget is what stops that from turning into a
 * five-minute hang: four retries over ~15s of backoff, and a hard 60s ceiling
 * on the whole call including time spent in requests. A control plane that is
 * genuinely down then fails the step in about a minute instead of holding the
 * deploy open while it waits.
 */
const RETRY_POLICY = {
  maxRetries: 4,
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  totalBudgetMs: 60_000,
} as const;

/**
 * Statuses where the request did not get a considered answer: a gateway or the
 * platform's own load balancer replied, not the API. Like a refused connection,
 * these say nothing about the state of the resource being read.
 */
const NO_ANSWER_STATUSES: readonly number[] = [408, 429, 502, 503, 504];

/** Node/undici error codes for a connection that never completed. */
const TRANSPORT_ERROR_CODES: readonly string[] = [
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
  "ENETDOWN",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
];

/** Error names raised by an aborted or timed-out request. */
const TRANSPORT_ERROR_NAMES: readonly string[] = ["NetworkError", "AbortError", "TimeoutError"];

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
    retry: { ...RETRY_POLICY },
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  return client.api;
}

/**
 * @internal Wrap API errors with context for Pulumi.
 *
 * Every message names the operation, the resource, and either the HTTP status
 * or the flattened cause chain, so a failed deploy log says what was called and
 * why it failed without the reader having to guess.
 */
export function handleApiError(operation: string, resource: string, err: unknown): never {
  const status = apiErrorStatus(err);
  if (status !== undefined) {
    const statusText = errorField(err, "statusText") ?? "";
    const body = (err as { body?: unknown }).body;
    const detail = body ? ` body: ${JSON.stringify(body)}` : "";
    throw new Error(`PgBeam ${operation} ${resource} failed (${status}): ${statusText}${detail}`, {
      cause: err,
    });
  }
  throw new Error(`PgBeam ${operation} ${resource} failed: ${describeError(err)}`, { cause: err });
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

/** @internal Read a string field off an unknown error without an `as any`. */
function errorField(err: unknown, field: string): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const value = (err as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** Walk an error's `cause` chain looking for a connection that never completed. */
function isTransportFailure(err: unknown, depth: number): boolean {
  if (depth > 5 || err === null || typeof err !== "object") return false;
  const candidate = err as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  if (typeof candidate.name === "string" && TRANSPORT_ERROR_NAMES.includes(candidate.name)) {
    return true;
  }
  if (typeof candidate.code === "string" && TRANSPORT_ERROR_CODES.includes(candidate.code)) {
    return true;
  }
  // undici reports every connection-level failure as `TypeError: fetch failed`
  // and hangs the real reason off `cause`.
  if (candidate instanceof TypeError && candidate.message === "fetch failed") return true;
  if (candidate.cause !== undefined) return isTransportFailure(candidate.cause, depth + 1);
  return false;
}

/**
 * @internal Whether the API never gave a considered answer about the resource:
 * the connection failed or timed out, or a gateway answered instead of the API.
 *
 * A 4xx or a 500 is a considered answer and is never counted here, so a real
 * API failure still surfaces.
 */
export function isApiUnreachable(err: unknown): boolean {
  const status = apiErrorStatus(err);
  if (status !== undefined) return NO_ANSWER_STATUSES.includes(status);
  return isTransportFailure(err, 0);
}

/**
 * @internal Report that a refresh could not observe a resource.
 *
 * A `read` runs during `pulumi refresh`, whose only job is to detect drift. When
 * the API is unreachable the read has learned nothing, which is not the same as
 * learning the resource is broken, so the provider keeps the last known state
 * and lets the run continue. Any actual change still goes through create,
 * update or delete, and those talk to the same API and fail loudly if it is
 * really down.
 */
export function warnRefreshSkipped(resource: string, id: string, err: unknown): void {
  console.warn(
    `PgBeam refresh of ${resource} (${id}) could not reach the API: ${describeError(err)}. ` +
      `Keeping the last known state; drift was not checked.`,
  );
}
