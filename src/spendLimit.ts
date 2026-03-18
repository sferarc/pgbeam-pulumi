import * as pulumi from "@pulumi/pulumi";
import type { OrganizationPlan } from "pgbeam";
import { apiErrorStatus, createClient, handleApiError } from "./provider.js";
import { stripUndefined } from "./utils.js";

export interface SpendLimitArgs {
  /** Organization ID. */
  orgId: pulumi.Input<string>;
  /** Monthly spend limit in dollars. Null or undefined removes the limit. */
  spendLimit?: pulumi.Input<number | null>;
}

function planToState(p: OrganizationPlan) {
  return {
    orgId: p.org_id,
    plan: p.plan,
    billingProvider: p.billing_provider,
    subscriptionStatus: p.subscription_status,
    currentPeriodEnd: p.current_period_end,
    enabled: p.enabled,
    customPricing: p.custom_pricing,
    spendLimit: p.spend_limit ?? null,
    limits: p.limits
      ? {
          queriesPerDay: p.limits.queries_per_day,
          maxProjects: p.limits.max_projects,
          maxDatabases: p.limits.max_databases,
          maxConnections: p.limits.max_connections,
          queriesPerSecond: p.limits.queries_per_second,
          bytesPerMonth: p.limits.bytes_per_month,
          maxQueryShapes: p.limits.max_query_shapes,
          includedSeats: p.limits.included_seats,
        }
      : undefined,
  };
}

const spendLimitProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.analytics.updateSpendLimit({
        pathParams: { org_id: String(inputs.orgId) },
        body: {
          spend_limit: inputs.spendLimit as number | null | undefined,
        },
      });

      const plan = result as OrganizationPlan;
      return {
        id: String(inputs.orgId),
        outs: stripUndefined(planToState(plan)),
      };
    } catch (err) {
      handleApiError("create", "SpendLimit", err);
    }
  },

  async read(id: string, props: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.analytics.getOrganizationPlan({
        pathParams: { org_id: id },
      });

      const plan = result as OrganizationPlan;
      return {
        id,
        props: stripUndefined({
          ...props,
          ...planToState(plan),
        }),
      };
    } catch (err) {
      handleApiError("read", "SpendLimit", err);
    }
  },

  async update(id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.analytics.updateSpendLimit({
        pathParams: { org_id: id },
        body: {
          spend_limit: news.spendLimit as number | null | undefined,
        },
      });

      const plan = result as OrganizationPlan;
      return {
        outs: stripUndefined(planToState(plan)),
      };
    } catch (err) {
      const status = apiErrorStatus(err);
      if (status === undefined || status >= 500) {
        const detail = status ? `(${status})` : `(network error)`;
        pulumi.log.warn(
          `PgBeam API unavailable ${detail} during spend limit update — preserving previous state.`,
        );
        return { outs: stripUndefined({ ...(olds as Record<string, unknown>) }) };
      }
      handleApiError("update", "SpendLimit", err);
    }
  },

  async delete(id: string) {
    // Remove the spend limit on delete (set to null = no limit)
    const api = createClient();
    try {
      await api.analytics.updateSpendLimit({
        pathParams: { org_id: id },
        body: { spend_limit: null },
      });
    } catch (err) {
      // 404 means the spend limit is already gone — treat as success.
      if (apiErrorStatus(err) === 404) return;
      handleApiError("delete", "SpendLimit", err);
    }
  },

  async diff(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    const replaces: string[] = [];
    if (news.orgId !== olds.orgId) replaces.push("orgId");

    const changes = news.spendLimit !== olds.spendLimit || replaces.length > 0;

    return { changes, replaces, deleteBeforeReplace: false };
  },
};

/**
 * Manage the spend limit for a PgBeam organization.
 *
 * Sets a monthly spending cap in dollars. When the limit is reached, the
 * organization's projects are suspended until the next billing period.
 * Set to null to remove the limit.
 *
 * On deletion, the spend limit is removed (set to null).
 *
 * @example
 * ```typescript
 * const limit = new pgbeam.SpendLimit("prod-limit", {
 *   orgId: "org_abc123",
 *   spendLimit: 500,
 * });
 *
 * export const currentPlan = limit.plan;
 * export const enabled = limit.enabled;
 * ```
 */
export class SpendLimit extends pulumi.dynamic.Resource {
  /** Organization ID. */
  public readonly orgId!: pulumi.Output<string>;
  /** Current plan tier. */
  public readonly plan!: pulumi.Output<string>;
  /** Billing provider (stripe, vercel, aws). */
  public readonly billingProvider!: pulumi.Output<string | undefined>;
  /** Subscription status. */
  public readonly subscriptionStatus!: pulumi.Output<string | undefined>;
  /** End of current billing period. */
  public readonly currentPeriodEnd!: pulumi.Output<string | undefined>;
  /** Whether billing is active. */
  public readonly enabled!: pulumi.Output<boolean | undefined>;
  /** Whether this org has custom enterprise pricing. */
  public readonly customPricing!: pulumi.Output<boolean | undefined>;
  /** Monthly spend limit in dollars (null = no limit). */
  public readonly spendLimit!: pulumi.Output<number | null>;
  /** Effective usage limits for the org's plan. */
  public readonly limits!: pulumi.Output<
    | {
        queriesPerDay: number;
        maxProjects: number;
        maxDatabases: number;
        maxConnections: number;
        queriesPerSecond: number;
        bytesPerMonth: number;
        maxQueryShapes: number;
        includedSeats: number;
      }
    | undefined
  >;

  constructor(name: string, args: SpendLimitArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      spendLimitProvider,
      name,
      {
        ...args,
        plan: undefined,
        billingProvider: undefined,
        subscriptionStatus: undefined,
        currentPeriodEnd: undefined,
        enabled: undefined,
        customPricing: undefined,
        limits: undefined,
      },
      opts,
    );
  }
}
