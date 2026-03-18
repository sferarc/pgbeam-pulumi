import * as pulumi from "@pulumi/pulumi";
import type { CustomDomain as CustomDomainData } from "pgbeam";
import { apiErrorStatus, createClient, handleApiError } from "./provider.js";
import { stripUndefined } from "./utils.js";

export interface CustomDomainArgs {
  /** ID of the project to attach this domain to. */
  projectId: pulumi.Input<string>;
  /** Fully qualified domain name (e.g. "db.example.com"). */
  domain: pulumi.Input<string>;
}

interface DnsInstructions {
  cnameHost?: string;
  cnameTarget?: string;
  txtHost?: string;
  txtValue?: string;
  acmeCnameHost?: string;
  acmeCnameTarget?: string;
}

function domainToState(d: CustomDomainData) {
  const dns = d.dns_instructions;
  return {
    projectId: d.project_id,
    domain: d.domain,
    verified: d.verified,
    verifiedAt: d.verified_at ?? undefined,
    tlsCertExpiry: d.tls_cert_expiry ?? undefined,
    dnsVerificationToken: d.dns_verification_token,
    dnsInstructions: dns
      ? {
          cnameHost: dns.cname_host,
          cnameTarget: dns.cname_target,
          txtHost: dns.txt_host,
          txtValue: dns.txt_value,
          acmeCnameHost: dns.acme_cname_host,
          acmeCnameTarget: dns.acme_cname_target,
        }
      : undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

const customDomainProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: Record<string, unknown>) {
    const api = createClient();

    try {
      const result = await api.projects.createCustomDomain({
        pathParams: { project_id: String(inputs.projectId) },
        body: { domain: String(inputs.domain) },
      });

      const domain = result as CustomDomainData;
      return {
        id: domain.id,
        outs: stripUndefined(domainToState(domain)),
      };
    } catch (err) {
      handleApiError("create", "CustomDomain", err);
    }
  },

  async read(id: string, props: Record<string, unknown>) {
    const api = createClient();

    try {
      // No getCustomDomain endpoint — list and filter with pagination
      let domain: CustomDomainData | undefined;
      let pageToken: string | undefined;

      do {
        const result = await api.projects.listCustomDomains({
          pathParams: { project_id: String(props.projectId) },
          queryParams: {
            page_size: 100,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        });

        const response = result as {
          domains: CustomDomainData[];
          next_page_token?: string;
        };
        domain = response.domains.find((d) => d.id === id);
        pageToken = response.next_page_token;
      } while (!domain && pageToken);

      if (!domain) {
        throw new Error(`Custom domain ${id} not found`);
      }

      return {
        id,
        props: stripUndefined({
          ...props,
          ...domainToState(domain),
        }),
      };
    } catch (err) {
      handleApiError("read", "CustomDomain", err);
    }
  },

  async delete(id: string, props: Record<string, unknown>) {
    const api = createClient();
    try {
      await api.projects.deleteCustomDomain({
        pathParams: {
          project_id: String(props.projectId),
          domain_id: id,
        },
      });
    } catch (err) {
      // 404 means the custom domain is already gone — treat as success.
      if (apiErrorStatus(err) === 404) return;
      handleApiError("delete", "CustomDomain", err);
    }
  },

  async diff(_id: string, olds: Record<string, unknown>, news: Record<string, unknown>) {
    // Custom domains are immutable — any change requires replacement
    const replaces: string[] = [];
    if (news.projectId !== olds.projectId) replaces.push("projectId");
    if (news.domain !== olds.domain) replaces.push("domain");

    return {
      changes: replaces.length > 0,
      replaces,
      deleteBeforeReplace: true,
    };
  },
};

/**
 * A custom domain attached to a PgBeam Project.
 *
 * Custom domains require the Scale or Enterprise plan. After creation, you must
 * configure DNS records according to the returned `dnsInstructions`, then call
 * `verifyCustomDomain()` or use the dashboard to verify ownership.
 *
 * Domains are immutable — changing the domain name triggers replacement.
 *
 * @example
 * ```typescript
 * const domain = new pgbeam.CustomDomain("prod-domain", {
 *   projectId: project.id,
 *   domain: "db.example.com",
 * });
 *
 * export const cnameTarget = domain.dnsInstructions.cnameTarget;
 * export const txtValue = domain.dnsInstructions.txtValue;
 * ```
 */
export class CustomDomain extends pulumi.dynamic.Resource {
  /** ID of the parent project. */
  public readonly projectId!: pulumi.Output<string>;
  /** The custom domain name. */
  public readonly domain!: pulumi.Output<string>;
  /** Whether DNS ownership has been verified. */
  public readonly verified!: pulumi.Output<boolean>;
  /** ISO 8601 timestamp when domain was verified. */
  public readonly verifiedAt!: pulumi.Output<string | undefined>;
  /** ISO 8601 timestamp when TLS certificate expires. */
  public readonly tlsCertExpiry!: pulumi.Output<string | undefined>;
  /** Token for DNS TXT record verification. */
  public readonly dnsVerificationToken!: pulumi.Output<string>;
  /** DNS records to configure for this domain. */
  public readonly dnsInstructions!: pulumi.Output<DnsInstructions | undefined>;
  /** ISO 8601 creation timestamp. */
  public readonly createdAt!: pulumi.Output<string>;
  /** ISO 8601 last-update timestamp. */
  public readonly updatedAt!: pulumi.Output<string>;

  constructor(name: string, args: CustomDomainArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      customDomainProvider,
      name,
      {
        ...args,
        verified: undefined,
        verifiedAt: undefined,
        tlsCertExpiry: undefined,
        dnsVerificationToken: undefined,
        dnsInstructions: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
      opts,
    );
  }
}

/**
 * Verify a custom domain's DNS configuration.
 *
 * Call this after configuring the DNS records returned by CustomDomain creation.
 * This is a runtime operation (not a Pulumi resource) — call it from an
 * `apply()` or after stack deployment.
 */
export async function verifyCustomDomain(
  projectId: string,
  domainId: string,
): Promise<{ verified: boolean; error?: string }> {
  const api = createClient();
  const result = await api.projects.verifyCustomDomain({
    pathParams: {
      project_id: projectId,
      domain_id: domainId,
    },
  });
  const response = result as { verified: boolean; error?: string };
  return { verified: response.verified, error: response.error };
}
