import * as pulumi from "@pulumi/pulumi";
import type { Replica as ReplicaData } from "pgbeam";
import { apiErrorStatus, createClient, handleApiError } from "./provider.js";
import { stripUndefined } from "./utils.js";

export interface ReplicaArgs {
  /** ID of the parent database. */
  databaseId: pulumi.Input<string>;
  /** PostgreSQL replica host. */
  host: pulumi.Input<string>;
  /** PostgreSQL replica port (1–65535). */
  port: pulumi.Input<number>;
  /** SSL connection mode. */
  sslMode?: pulumi.Input<"disable" | "allow" | "prefer" | "require" | "verify-ca" | "verify-full">;
}

function replicaToState(r: ReplicaData) {
  return {
    databaseId: r.database_id,
    host: r.host,
    port: r.port,
    sslMode: r.ssl_mode,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const replicaProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.projects.createReplica({
        pathParams: { database_id: String(inputs.databaseId) },
        body: {
          host: String(inputs.host),
          port: Number(inputs.port),
          ssl_mode: inputs.sslMode as
            | "disable"
            | "allow"
            | "prefer"
            | "require"
            | "verify-ca"
            | "verify-full"
            | undefined,
        },
      });

      const replica = result as ReplicaData;
      return {
        id: replica.id,
        outs: stripUndefined(replicaToState(replica)),
      };
    } catch (err) {
      handleApiError("create", "Replica", err);
    }
  },

  async read(id: string, props: Record<string, unknown>) {
    const api = createClient();

    try {
      // No getReplica endpoint — list and filter
      const result = await api.projects.listReplicas({
        pathParams: { database_id: String(props.databaseId) },
      });

      const replicas = (result as { replicas: ReplicaData[] }).replicas;
      const replica = replicas.find((r) => r.id === id);
      if (!replica) {
        throw new Error(`Replica ${id} not found`);
      }

      return {
        id,
        props: stripUndefined({
          ...props,
          ...replicaToState(replica),
        }),
      };
    } catch (err) {
      handleApiError("read", "Replica", err);
    }
  },

  async delete(id: string, props: Record<string, unknown>) {
    const api = createClient();
    try {
      await api.projects.deleteReplica({
        pathParams: {
          database_id: String(props.databaseId),
          replica_id: id,
        },
      });
    } catch (err) {
      // 404 means the replica is already gone — treat as success.
      if (apiErrorStatus(err) === 404) return;
      handleApiError("delete", "Replica", err);
    }
  },

  async diff(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    // Replicas don't support update — any change requires replacement
    const replaces: string[] = [];
    if (news.databaseId !== olds.databaseId) replaces.push("databaseId");
    if (news.host !== olds.host) replaces.push("host");
    if (news.port !== olds.port) replaces.push("port");
    if (news.sslMode !== olds.sslMode) replaces.push("sslMode");

    return {
      changes: replaces.length > 0,
      replaces,
      deleteBeforeReplace: true,
    };
  },
};

/**
 * A read replica registered under a PgBeam Database.
 *
 * Replicas are immutable — any property change triggers replacement.
 * PgBeam routes read queries to replicas automatically based on proximity.
 *
 * @example
 * ```typescript
 * const replica = new pgbeam.Replica("us-west-replica", {
 *   databaseId: db.id,
 *   host: "replica.us-west-2.rds.amazonaws.com",
 *   port: 5432,
 *   sslMode: "require",
 * });
 * ```
 */
export class Replica extends pulumi.dynamic.Resource {
  /** ID of the parent database. */
  public readonly databaseId!: pulumi.Output<string>;
  /** PostgreSQL replica host. */
  public readonly host!: pulumi.Output<string>;
  /** PostgreSQL replica port. */
  public readonly port!: pulumi.Output<number>;
  /** SSL connection mode. */
  public readonly sslMode!: pulumi.Output<string>;
  /** ISO 8601 creation timestamp. */
  public readonly createdAt!: pulumi.Output<string>;
  /** ISO 8601 last-update timestamp. */
  public readonly updatedAt!: pulumi.Output<string>;

  constructor(name: string, args: ReplicaArgs, opts?: pulumi.CustomResourceOptions) {
    super(replicaProvider, name, { ...args, createdAt: undefined, updatedAt: undefined }, opts);
  }
}
