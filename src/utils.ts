import type { CacheConfig, PoolConfig } from "pgbeam";

/**
 * Recursively strips `undefined` values from an object.
 *
 * Pulumi dynamic providers serialize outputs via google-protobuf's
 * `Struct.fromJavaScript`, which only handles null, bool, number, string,
 * array, and object — `undefined` causes "Unexpected struct type".
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export interface CacheConfigArgs {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
  swrSeconds: number;
}

export interface PoolConfigArgs {
  poolSize: number;
  minPoolSize: number;
  poolMode: "session" | "transaction" | "statement";
}

export function toCacheConfig(c: Record<string, unknown> | undefined): CacheConfig | undefined {
  if (!c) return undefined;
  return {
    enabled: Boolean(c.enabled),
    ttl_seconds: Number(c.ttlSeconds),
    max_entries: Number(c.maxEntries),
    swr_seconds: Number(c.swrSeconds),
  };
}

export function toPoolConfig(c: Record<string, unknown> | undefined): PoolConfig | undefined {
  if (!c) return undefined;
  const mode = String(c.poolMode);
  if (mode !== "session" && mode !== "transaction" && mode !== "statement") {
    throw new Error(
      `Invalid pool mode: ${mode}. Must be "session", "transaction", or "statement".`,
    );
  }
  return {
    pool_size: Number(c.poolSize),
    min_pool_size: Number(c.minPoolSize),
    pool_mode: mode,
  };
}
