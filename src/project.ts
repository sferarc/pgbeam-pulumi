import * as pulumi from "@pulumi/pulumi";
import type { Database as DatabaseData, Project as ProjectData } from "pgbeam";
import { apiErrorStatus, createClient, handleApiError } from "./provider.js";
import {
  type CacheConfigArgs,
  type PoolConfigArgs,
  stripUndefined,
  toCacheConfig,
  toPoolConfig,
} from "./utils.js";

export interface ProjectArgs {
  /** Organization ID that owns this project. */
  orgId: pulumi.Input<string>;
  /** Human-readable project name (1–100 characters). */
  name: pulumi.Input<string>;
  /** Optional description (up to 500 characters). */
  description?: pulumi.Input<string>;
  /** Optional user-defined labels (max 10, each up to 50 characters). */
  tags?: pulumi.Input<pulumi.Input<string>[]>;
  /** Cloud provider. Defaults to "aws". */
  cloud?: pulumi.Input<"aws" | "azure" | "gcp">;
  /** Rate limit: max sustained queries per second (0 = unlimited). */
  queriesPerSecond?: pulumi.Input<number>;
  /** Rate limit: burst allowance above sustained QPS. */
  burstSize?: pulumi.Input<number>;
  /** Max concurrent connections (0 = unlimited). */
  maxConnections?: pulumi.Input<number>;

  /** Primary database configuration (created atomically with the project). */
  database: pulumi.Input<ProjectDatabaseArgs>;
}

export interface ProjectDatabaseArgs {
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

interface ProjectState {
  orgId: string;
  name: string;
  description?: string;
  tags?: string[];
  cloud: string;
  proxyHost: string;
  queriesPerSecond: number;
  burstSize: number;
  maxConnections: number;
  databaseCount: number;
  activeConnections: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  primaryDatabaseId?: string;
}

function projectToState(p: ProjectData, primaryDbId?: string): ProjectState {
  return {
    orgId: p.org_id,
    name: p.name,
    description: p.description,
    tags: p.tags,
    cloud: p.cloud ?? "aws",
    proxyHost: p.proxy_host ?? "",
    queriesPerSecond: p.queries_per_second ?? 0,
    burstSize: p.burst_size ?? 0,
    maxConnections: p.max_connections ?? 0,
    databaseCount: p.database_count ?? 0,
    activeConnections: p.active_connections ?? 0,
    status: p.status,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    primaryDatabaseId: primaryDbId,
  };
}

const projectProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: Record<string, unknown>) {
    const api = createClient();
    const db = inputs.database as Record<string, unknown>;

    try {
      const result = await api.projects.createProject({
        body: {
          name: String(inputs.name),
          org_id: String(inputs.orgId),
          description: inputs.description as string | undefined,
          tags: inputs.tags as string[] | undefined,
          cloud: inputs.cloud as "aws" | "azure" | "gcp" | undefined,
          database: {
            host: String(db.host),
            port: Number(db.port),
            name: String(db.name),
            username: String(db.username),
            password: String(db.password),
            ssl_mode: db.sslMode as
              | "disable"
              | "allow"
              | "prefer"
              | "require"
              | "verify-ca"
              | "verify-full"
              | undefined,
            role: db.role as "primary" | "replica" | undefined,
            pool_region: db.poolRegion as string | undefined,
            cache_config: toCacheConfig(db.cacheConfig as Record<string, unknown> | undefined),
            pool_config: toPoolConfig(db.poolConfig as Record<string, unknown> | undefined),
          },
        },
      });

      const project = result.project;
      const database = result.database as DatabaseData | undefined;

      return {
        id: project.id,
        outs: stripUndefined({
          ...projectToState(project, database?.id),
          database: inputs.database,
        }),
      };
    } catch (err) {
      // Adopt orphaned project on 409 Conflict (e.g. previous create succeeded
      // in the API but Pulumi state was lost due to serialization error).
      if (apiErrorStatus(err) === 409) {
        const orgId = String(inputs.orgId);
        const name = String(inputs.name);
        const list = (await api.projects.listProjects({
          queryParams: { org_id: orgId, page_size: 100 },
        })) as { projects: ProjectData[] };
        const existing = list.projects.find((p) => p.name === name);
        if (existing) {
          pulumi.log.info(`Adopting existing project "${name}" (${existing.id})`);
          return {
            id: existing.id,
            outs: stripUndefined({
              ...projectToState(existing),
              database: inputs.database,
            }),
          };
        }
      }
      handleApiError("create", "Project", err);
    }
  },

  async read(id: string, props: Record<string, unknown>) {
    const api = createClient();

    try {
      const project = (await api.projects.getProject({
        pathParams: { project_id: id },
      })) as ProjectData;

      return {
        id,
        props: stripUndefined({
          ...props,
          ...projectToState(project, props.primaryDatabaseId as string),
        }),
      };
    } catch (err) {
      // 404 means the project was deleted out-of-band. Try to find it by name
      // so Pulumi state stays in sync with the API.
      if (apiErrorStatus(err) === 404 && props.orgId && props.name) {
        const orgId = String(props.orgId);
        const name = String(props.name);
        const list = (await api.projects.listProjects({
          queryParams: { org_id: orgId, page_size: 100 },
        })) as { projects: ProjectData[] };
        const existing = list.projects.find((p) => p.name === name);
        if (existing) {
          pulumi.log.info(
            `Re-adopting project "${name}" (${existing.id}) during read after out-of-band deletion`,
          );
          return {
            id: existing.id,
            props: stripUndefined({
              ...props,
              ...projectToState(existing, props.primaryDatabaseId as string),
            }),
          };
        }
        // Project truly gone — let Pulumi know by returning the old props
        // so it can detect drift and recreate on next update.
        pulumi.log.warn(
          `Project "${name}" (${id}) not found during read — it may have been deleted out-of-band.`,
        );
        return { id, props };
      }
      handleApiError("read", "Project", err);
    }
  },

  async update(id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const api = createClient();

    try {
      const body: Record<string, unknown> = {};
      if (news.name !== olds.name) body.name = news.name;
      if (news.description !== olds.description) body.description = news.description;
      if (JSON.stringify(news.tags) !== JSON.stringify(olds.tags)) body.tags = news.tags;
      if (news.queriesPerSecond !== olds.queriesPerSecond)
        body.queries_per_second = news.queriesPerSecond;
      if (news.burstSize !== olds.burstSize) body.burst_size = news.burstSize;
      if (news.maxConnections !== olds.maxConnections) body.max_connections = news.maxConnections;

      if (Object.keys(body).length > 0) {
        await api.projects.updateProject({
          pathParams: { project_id: id },
          body: body as Parameters<typeof api.projects.updateProject>[0]["body"],
        });
      }

      const project = (await api.projects.getProject({
        pathParams: { project_id: id },
      })) as ProjectData;

      return {
        outs: stripUndefined({
          ...projectToState(project, olds.primaryDatabaseId as string),
          database: news.database,
        }),
      };
    } catch (err) {
      // 404 means project was deleted out-of-band. The update method cannot
      // change the resource ID in Pulumi state, so re-adopting or recreating
      // here would leave a stale ID and cause an infinite update loop.
      // Direct the user to `pulumi refresh` which calls `read` — the only
      // method that can correct the stored ID.
      if (apiErrorStatus(err) === 404) {
        throw new Error(
          `Project "${String(news.name)}" (${id}) was deleted out-of-band. ` +
            `Run \`pulumi refresh\` to reconcile state, then re-run \`pulumi up\`.`,
        );
      }
      handleApiError("update", "Project", err);
    }
  },

  async delete(id: string) {
    const api = createClient();
    try {
      await api.projects.deleteProject({
        pathParams: { project_id: id },
      });
    } catch (err) {
      // 404 means the project is already gone — treat as success.
      if (apiErrorStatus(err) === 404) return;
      handleApiError("delete", "Project", err);
    }
  },

  async diff(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const replaces: string[] = [];
    if (news.orgId !== olds.orgId) replaces.push("orgId");
    if ((news.cloud ?? "aws") !== (olds.cloud ?? "aws")) replaces.push("cloud");

    const changes =
      news.name !== olds.name ||
      news.description !== olds.description ||
      JSON.stringify(news.tags) !== JSON.stringify(olds.tags) ||
      (news.queriesPerSecond ?? 0) !== (olds.queriesPerSecond ?? 0) ||
      (news.burstSize ?? 0) !== (olds.burstSize ?? 0) ||
      (news.maxConnections ?? 0) !== (olds.maxConnections ?? 0) ||
      JSON.stringify(news.database) !== JSON.stringify(olds.database) ||
      replaces.length > 0;

    return { changes, replaces, deleteBeforeReplace: false };
  },
};

/**
 * A PgBeam Project with its primary database.
 *
 * Projects are the top-level organizational unit. Each project gets a unique
 * proxy hostname (e.g. `myproject.aws.pgbeam.app`) and is created atomically
 * with its primary upstream database.
 *
 * @example
 * ```typescript
 * const project = new pgbeam.Project("my-app", {
 *   orgId: "org_abc123",
 *   name: "my-app",
 *   database: {
 *     host: "my-rds.us-east-1.rds.amazonaws.com",
 *     port: 5432,
 *     name: "mydb",
 *     username: "pgbeam",
 *     password: secret.value,
 *   },
 * });
 *
 * export const proxyHost = project.proxyHost;
 * export const primaryDbId = project.primaryDatabaseId;
 * ```
 */
export class Project extends pulumi.dynamic.Resource {
  /** The organization that owns this project. */
  public readonly orgId!: pulumi.Output<string>;
  /** Project name. */
  public readonly name!: pulumi.Output<string>;
  /** Project description. */
  public readonly description!: pulumi.Output<string | undefined>;
  /** User-defined tags. */
  public readonly tags!: pulumi.Output<string[] | undefined>;
  /** Cloud provider (aws, azure, gcp). */
  public readonly cloud!: pulumi.Output<string>;
  /** PgBeam proxy hostname for this project. */
  public readonly proxyHost!: pulumi.Output<string>;
  /** Max sustained queries per second (0 = unlimited). */
  public readonly queriesPerSecond!: pulumi.Output<number>;
  /** Burst allowance above sustained QPS. */
  public readonly burstSize!: pulumi.Output<number>;
  /** Max concurrent connections (0 = unlimited). */
  public readonly maxConnections!: pulumi.Output<number>;
  /** Number of databases attached. */
  public readonly databaseCount!: pulumi.Output<number>;
  /** Current active connections from latest metrics. */
  public readonly activeConnections!: pulumi.Output<number>;
  /** Project status: active, suspended, or deleted. */
  public readonly status!: pulumi.Output<string>;
  /** ISO 8601 creation timestamp. */
  public readonly createdAt!: pulumi.Output<string>;
  /** ISO 8601 last-update timestamp. */
  public readonly updatedAt!: pulumi.Output<string>;
  /** ID of the primary database created with this project. */
  public readonly primaryDatabaseId!: pulumi.Output<string | undefined>;

  constructor(name: string, args: ProjectArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      projectProvider,
      name,
      {
        ...args,
        cloud: args.cloud ?? "aws",
        proxyHost: undefined,
        databaseCount: undefined,
        activeConnections: undefined,
        status: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        primaryDatabaseId: undefined,
      },
      opts,
    );
  }
}
