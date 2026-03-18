import * as pulumi from "@pulumi/pulumi";
import type { CacheConfig, Database as DatabaseData, PoolConfig } from "pgbeam";
import { apiErrorStatus, createClient, handleApiError } from "./provider.js";
import {
  type CacheConfigArgs,
  type PoolConfigArgs,
  stripUndefined,
  toCacheConfig,
  toPoolConfig,
} from "./utils.js";

export interface DatabaseArgs {
  /** ID of the project this database belongs to. */
  projectId: pulumi.Input<string>;
  /** Upstream PostgreSQL host. */
  host: pulumi.Input<string>;
  /** Upstream PostgreSQL port (1–65535). */
  port: pulumi.Input<number>;
  /** PostgreSQL database name. */
  name: pulumi.Input<string>;
  /** PostgreSQL username. */
  username: pulumi.Input<string>;
  /** PostgreSQL password (encrypted at rest). */
  password: pulumi.Input<string>;
  /** SSL connection mode. */
  sslMode?: pulumi.Input<"disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full">;
  /** Database role: "primary" or "replica". */
  role?: pulumi.Input<"primary" | "replica">;
  /** Region for the connection pool (e.g. "us-east-1"). */
  poolRegion?: pulumi.Input<string>;
  /** Query cache configuration. */
  cacheConfig?: pulumi.Input<CacheConfigArgs>;
  /** Connection pool configuration. */
  poolConfig?: pulumi.Input<PoolConfigArgs>;
}

interface DatabaseState {
  projectId: string;
  host: string;
  port: number;
  name: string;
  username: string;
  sslMode: string;
  role: string;
  poolRegion?: string;
  connectionString: string;
  cacheConfig: CacheConfig;
  poolConfig: PoolConfig;
  createdAt: string;
  updatedAt: string;
}

function dbToState(d: DatabaseData): DatabaseState {
  return {
    projectId: d.project_id,
    host: d.host,
    port: d.port,
    name: d.name,
    username: d.username,
    sslMode: d.ssl_mode,
    role: d.role ?? "primary",
    poolRegion: d.pool_region,
    connectionString: d.connection_string ?? "",
    cacheConfig: d.cache_config,
    poolConfig: d.pool_config,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

const databaseProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.databases.createDatabase({
        pathParams: { project_id: String(inputs.projectId) },
        body: {
          host: String(inputs.host),
          port: Number(inputs.port),
          name: String(inputs.name),
          username: String(inputs.username),
          password: String(inputs.password),
          ssl_mode: inputs.sslMode as
            | "disable"
            | "allow"
            | "prefer"
            | "require"
            | "verify-ca"
            | "verify-full"
            | undefined,
          role: inputs.role as "primary" | "replica" | undefined,
          pool_region: inputs.poolRegion as string | undefined,
          cache_config: toCacheConfig(inputs.cacheConfig as Record<string, unknown> | undefined),
          pool_config: toPoolConfig(inputs.poolConfig as Record<string, unknown> | undefined),
        },
      });

      const db = result as DatabaseData;
      return {
        id: db.id,
        outs: stripUndefined({
          ...dbToState(db),
          password: inputs.password,
          cacheConfig: inputs.cacheConfig,
          poolConfig: inputs.poolConfig,
        }),
      };
    } catch (err) {
      handleApiError("create", "Database", err);
    }
  },

  async read(id: string, props: Record<string, unknown>) {
    const api = createClient();

    try {
      const db = (await api.databases.getDatabase({
        pathParams: {
          project_id: String(props.projectId),
          database_id: id,
        },
      })) as DatabaseData;

      return {
        id,
        props: stripUndefined({
          ...props,
          ...dbToState(db),
        }),
      };
    } catch (err) {
      handleApiError("read", "Database", err);
    }
  },

  async update(id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const api = createClient();

    try {
      const body: Record<string, unknown> = {};
      if (news.host !== olds.host) body.host = news.host;
      if (news.port !== olds.port) body.port = news.port;
      if (news.name !== olds.name) body.name = news.name;
      if (news.username !== olds.username) body.username = news.username;
      if (news.password !== olds.password) body.password = news.password;
      if (news.sslMode !== olds.sslMode) body.ssl_mode = news.sslMode;
      if (news.role !== olds.role) body.role = news.role;
      if (news.poolRegion !== olds.poolRegion) body.pool_region = news.poolRegion;
      if (JSON.stringify(news.cacheConfig) !== JSON.stringify(olds.cacheConfig))
        body.cache_config = toCacheConfig(news.cacheConfig as Record<string, unknown> | undefined);
      if (JSON.stringify(news.poolConfig) !== JSON.stringify(olds.poolConfig))
        body.pool_config = toPoolConfig(news.poolConfig as Record<string, unknown> | undefined);

      if (Object.keys(body).length > 0) {
        await api.databases.updateDatabase({
          pathParams: {
            project_id: String(news.projectId),
            database_id: id,
          },
          body: body as Parameters<typeof api.databases.updateDatabase>[0]["body"],
        });
      }

      const db = (await api.databases.getDatabase({
        pathParams: {
          project_id: String(news.projectId),
          database_id: id,
        },
      })) as DatabaseData;

      return {
        outs: stripUndefined({
          ...dbToState(db),
          password: news.password,
          cacheConfig: news.cacheConfig,
          poolConfig: news.poolConfig,
        }),
      };
    } catch (err) {
      const status = apiErrorStatus(err);
      if (status === undefined || status >= 500) {
        const detail = status ? `(${status})` : `(network error)`;
        pulumi.log.warn(
          `PgBeam API unavailable ${detail} during database update — preserving previous state.`,
        );
        return { outs: stripUndefined({ ...(olds as Record<string, unknown>) }) };
      }
      handleApiError("update", "Database", err);
    }
  },

  async delete(id: string, props: Record<string, unknown>) {
    const api = createClient();
    try {
      await api.databases.deleteDatabase({
        pathParams: {
          project_id: String(props.projectId),
          database_id: id,
        },
      });
    } catch (err) {
      // 404 means the database is already gone — treat as success.
      if (apiErrorStatus(err) === 404) return;
      handleApiError("delete", "Database", err);
    }
  },

  async diff(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const replaces: string[] = [];
    if (news.projectId !== olds.projectId) replaces.push("projectId");

    const changes =
      news.host !== olds.host ||
      news.port !== olds.port ||
      news.name !== olds.name ||
      news.username !== olds.username ||
      news.password !== olds.password ||
      news.sslMode !== olds.sslMode ||
      news.role !== olds.role ||
      news.poolRegion !== olds.poolRegion ||
      JSON.stringify(news.cacheConfig) !== JSON.stringify(olds.cacheConfig) ||
      JSON.stringify(news.poolConfig) !== JSON.stringify(olds.poolConfig) ||
      replaces.length > 0;

    return { changes, replaces, deleteBeforeReplace: false };
  },
};

/**
 * A PgBeam Database registered under a Project.
 *
 * Databases represent upstream PostgreSQL connections that PgBeam proxies.
 * Each database has its own connection pooling and query caching configuration.
 *
 * @example
 * ```typescript
 * const readReplica = new pgbeam.Database("read-replica", {
 *   projectId: project.id,
 *   host: "replica.us-east-1.rds.amazonaws.com",
 *   port: 5432,
 *   name: "mydb",
 *   username: "pgbeam",
 *   password: secret.value,
 *   role: "replica",
 *   poolConfig: {
 *     poolSize: 20,
 *     minPoolSize: 5,
 *     poolMode: "transaction",
 *   },
 *   cacheConfig: {
 *     enabled: true,
 *     ttlSeconds: 120,
 *     maxEntries: 50000,
 *     swrSeconds: 60,
 *   },
 * });
 * ```
 */
export class Database extends pulumi.dynamic.Resource {
  /** ID of the parent project. */
  public readonly projectId!: pulumi.Output<string>;
  /** Upstream PostgreSQL host. */
  public readonly host!: pulumi.Output<string>;
  /** Upstream PostgreSQL port. */
  public readonly port!: pulumi.Output<number>;
  /** PostgreSQL database name. */
  public readonly name!: pulumi.Output<string>;
  /** PostgreSQL username. */
  public readonly username!: pulumi.Output<string>;
  /** SSL connection mode. */
  public readonly sslMode!: pulumi.Output<string>;
  /** Database role (primary or replica). */
  public readonly role!: pulumi.Output<string>;
  /** Connection pool region. */
  public readonly poolRegion!: pulumi.Output<string | undefined>;
  /** PgBeam proxy connection string (password placeholder). */
  public readonly connectionString!: pulumi.Output<string>;
  /** Query cache configuration. */
  public readonly cacheConfig!: pulumi.Output<CacheConfig>;
  /** Connection pool configuration. */
  public readonly poolConfig!: pulumi.Output<PoolConfig>;
  /** ISO 8601 creation timestamp. */
  public readonly createdAt!: pulumi.Output<string>;
  /** ISO 8601 last-update timestamp. */
  public readonly updatedAt!: pulumi.Output<string>;

  constructor(name: string, args: DatabaseArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      databaseProvider,
      name,
      {
        ...args,
        connectionString: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
      opts,
    );
  }
}
