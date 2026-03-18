import * as pulumi from "@pulumi/pulumi";
import type { CacheRuleEntry } from "pgbeam";
import { apiErrorStatus, createClient, handleApiError } from "./provider.js";
import { stripUndefined } from "./utils.js";

export interface CacheRuleArgs {
  /** ID of the project. */
  projectId: pulumi.Input<string>;
  /** ID of the database. */
  databaseId: pulumi.Input<string>;
  /** xxhash64 hex of the normalized SQL (16-char hex string). */
  queryHash: pulumi.Input<string>;
  /** Whether caching is enabled for this query shape. */
  cacheEnabled: pulumi.Input<boolean>;
  /** TTL override in seconds (0–86400). Null uses project default. */
  cacheTtlSeconds?: pulumi.Input<number | null>;
  /** SWR override in seconds (0–86400). Null uses project default. */
  cacheSwrSeconds?: pulumi.Input<number | null>;
}

function entryToState(e: CacheRuleEntry) {
  return {
    queryHash: e.query_hash,
    normalizedSql: e.normalized_sql,
    queryType: e.query_type,
    cacheEnabled: e.cache_enabled,
    cacheTtlSeconds: e.cache_ttl_seconds ?? null,
    cacheSwrSeconds: e.cache_swr_seconds ?? null,
    callCount: e.call_count,
    avgLatencyMs: e.avg_latency_ms,
    p95LatencyMs: e.p95_latency_ms,
    avgResponseBytes: e.avg_response_bytes,
    stabilityRate: e.stability_rate,
    recommendation: e.recommendation,
    firstSeenAt: e.first_seen_at,
    lastSeenAt: e.last_seen_at,
  };
}

const cacheRuleProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.projects.updateCacheRule({
        pathParams: {
          project_id: String(inputs.projectId),
          database_id: String(inputs.databaseId),
          query_hash: String(inputs.queryHash),
        },
        body: {
          cache_enabled: Boolean(inputs.cacheEnabled),
          cache_ttl_seconds: inputs.cacheTtlSeconds as number | null | undefined,
          cache_swr_seconds: inputs.cacheSwrSeconds as number | null | undefined,
        },
      });

      const response = result as { entry: CacheRuleEntry };
      const id = `${inputs.projectId}/${inputs.databaseId}/${inputs.queryHash}`;

      return {
        id,
        outs: stripUndefined({
          projectId: inputs.projectId,
          databaseId: inputs.databaseId,
          ...entryToState(response.entry),
        }),
      };
    } catch (err) {
      handleApiError("create", "CacheRule", err);
    }
  },

  async read(id: string, props: Record<string, unknown>) {
    const api = createClient();

    try {
      // No getCacheRule endpoint — list with pagination and filter
      let entry: CacheRuleEntry | undefined;
      let pageToken: string | undefined;

      do {
        const result = await api.projects.listCacheRules({
          pathParams: {
            project_id: String(props.projectId),
            database_id: String(props.databaseId),
          },
          queryParams: {
            page_size: 100,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        });

        const response = result as {
          entries: CacheRuleEntry[];
          next_page_token?: string;
        };
        entry = response.entries?.find((e) => e.query_hash === props.queryHash);
        pageToken = response.next_page_token;
      } while (!entry && pageToken);

      if (!entry) {
        throw new Error(`Cache rule ${props.queryHash} not found`);
      }

      return {
        id,
        props: stripUndefined({
          ...props,
          ...entryToState(entry),
        }),
      };
    } catch (err) {
      handleApiError("read", "CacheRule", err);
    }
  },

  async update(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.projects.updateCacheRule({
        pathParams: {
          project_id: String(news.projectId),
          database_id: String(news.databaseId),
          query_hash: String(news.queryHash),
        },
        body: {
          cache_enabled: Boolean(news.cacheEnabled),
          cache_ttl_seconds: news.cacheTtlSeconds as number | null | undefined,
          cache_swr_seconds: news.cacheSwrSeconds as number | null | undefined,
        },
      });

      const response = result as { entry: CacheRuleEntry };
      return {
        outs: stripUndefined({
          projectId: news.projectId,
          databaseId: news.databaseId,
          ...entryToState(response.entry),
        }),
      };
    } catch (err) {
      const status = apiErrorStatus(err);
      if (status === undefined || status >= 500) {
        const detail = status ? `(${status})` : `(network error)`;
        pulumi.log.warn(
          `PgBeam API unavailable ${detail} during cache rule update — preserving previous state.`,
        );
        return { outs: stripUndefined({ ...(olds as Record<string, unknown>) }) };
      }
      handleApiError("update", "CacheRule", err);
    }
  },

  async delete(_id: string, props: Record<string, unknown>) {
    // No dedicated delete endpoint — disable caching for this rule
    const api = createClient();
    try {
      await api.projects.updateCacheRule({
        pathParams: {
          project_id: String(props.projectId),
          database_id: String(props.databaseId),
          query_hash: String(props.queryHash),
        },
        body: {
          cache_enabled: false,
          cache_ttl_seconds: null,
          cache_swr_seconds: null,
        },
      });
    } catch (err) {
      // 404 means the cache rule is already gone — treat as success.
      if (apiErrorStatus(err) === 404) return;
      handleApiError("delete", "CacheRule", err);
    }
  },

  async diff(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const replaces: string[] = [];
    if (news.projectId !== olds.projectId) replaces.push("projectId");
    if (news.databaseId !== olds.databaseId) replaces.push("databaseId");
    if (news.queryHash !== olds.queryHash) replaces.push("queryHash");

    const changes =
      news.cacheEnabled !== olds.cacheEnabled ||
      news.cacheTtlSeconds !== olds.cacheTtlSeconds ||
      news.cacheSwrSeconds !== olds.cacheSwrSeconds ||
      replaces.length > 0;

    return { changes, replaces, deleteBeforeReplace: true };
  },
};

/**
 * A cache rule override for a specific query shape on a PgBeam Database.
 *
 * Cache rules let you control per-query caching behavior. PgBeam automatically
 * detects query shapes — use this resource to override the default cache
 * settings for specific queries identified by their xxhash64 query hash.
 *
 * On deletion, caching is disabled for the query shape (set to `cache_enabled: false`).
 *
 * @example
 * ```typescript
 * const rule = new pgbeam.CacheRule("hot-query", {
 *   projectId: project.id,
 *   databaseId: db.id,
 *   queryHash: "a1b2c3d4e5f67890",
 *   cacheEnabled: true,
 *   cacheTtlSeconds: 300,
 *   cacheSwrSeconds: 60,
 * });
 *
 * export const recommendation = rule.recommendation;
 * ```
 */
export class CacheRule extends pulumi.dynamic.Resource {
  /** ID of the parent project. */
  public readonly projectId!: pulumi.Output<string>;
  /** ID of the parent database. */
  public readonly databaseId!: pulumi.Output<string>;
  /** xxhash64 hex of normalized SQL. */
  public readonly queryHash!: pulumi.Output<string>;
  /** Normalized SQL text with $N placeholders. */
  public readonly normalizedSql!: pulumi.Output<string>;
  /** Query classification: read, write, or other. */
  public readonly queryType!: pulumi.Output<string>;
  /** Whether caching is enabled for this query shape. */
  public readonly cacheEnabled!: pulumi.Output<boolean>;
  /** TTL override in seconds. */
  public readonly cacheTtlSeconds!: pulumi.Output<number | null>;
  /** SWR override in seconds. */
  public readonly cacheSwrSeconds!: pulumi.Output<number | null>;
  /** Total query executions observed. */
  public readonly callCount!: pulumi.Output<number>;
  /** Average query latency in milliseconds. */
  public readonly avgLatencyMs!: pulumi.Output<number>;
  /** 95th percentile latency in milliseconds. */
  public readonly p95LatencyMs!: pulumi.Output<number>;
  /** Average response size in bytes. */
  public readonly avgResponseBytes!: pulumi.Output<number>;
  /** Response stability rate (0.0–1.0). */
  public readonly stabilityRate!: pulumi.Output<number>;
  /** Cache recommendation: great, good, fair, or poor. */
  public readonly recommendation!: pulumi.Output<string>;
  /** ISO 8601 timestamp when query was first observed. */
  public readonly firstSeenAt!: pulumi.Output<string>;
  /** ISO 8601 timestamp when query was last observed. */
  public readonly lastSeenAt!: pulumi.Output<string>;

  constructor(name: string, args: CacheRuleArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      cacheRuleProvider,
      name,
      {
        ...args,
        normalizedSql: undefined,
        queryType: undefined,
        callCount: undefined,
        avgLatencyMs: undefined,
        p95LatencyMs: undefined,
        avgResponseBytes: undefined,
        stabilityRate: undefined,
        recommendation: undefined,
        firstSeenAt: undefined,
        lastSeenAt: undefined,
      },
      opts,
    );
  }
}
