# PgBeam Pulumi Provider

Pulumi provider for [PgBeam](https://pgbeam.com) — manage your globally
distributed PostgreSQL proxy infrastructure as code using TypeScript, Python,
Go, or C#.

## Install

```bash
npm install @pgbeam/pulumi
```

## Usage

```typescript
import * as pgbeam from "@pgbeam/pulumi";

const project = new pgbeam.Project("my-project", {
  name: "my-project",
  orgId: "org_123",
  region: "us-east-1",
});

const database = new pgbeam.Database("primary", {
  projectId: project.id,
  name: "primary",
  host: "your-db-host.example.com",
  port: 5432,
  database: "mydb",
  username: "dbuser",
  password: config.requireSecret("dbPassword"),
});
```

## Resources

| Resource                 | Description                          |
| ------------------------ | ------------------------------------ |
| `pgbeam.Project`         | PgBeam project                       |
| `pgbeam.Database`        | PostgreSQL database connection       |
| `pgbeam.Replica`         | Read replica configuration           |
| `pgbeam.CustomDomain`    | Custom domain for connection strings |
| `pgbeam.CacheRule`       | Query caching rule                   |
| `pgbeam.SpendLimit`      | Budget controls                      |
| `pgbeam.AgentCredential` | Scoped agent credential              |
| `pgbeam.WebhookEndpoint` | Event delivery endpoint              |

## Agent gateway

The agent gateway issues scoped,
policy-enforced credentials for AI agents and delivers audit/anomaly events to
webhook endpoints.

```typescript
const audit = new pgbeam.WebhookEndpoint("audit", {
  projectId: project.id,
  url: "https://example.com/hooks/pgbeam",
  format: "json",
  eventTypes: ["blocked", "anomaly", "approval"],
  secret: config.requireSecret("webhookSecret"), // write-only
  enabled: true,
});

const agent = new pgbeam.AgentCredential("analytics", {
  projectId: project.id,
  policyProfileId: policyProfileId,
  name: "Claude Code (analytics)",
  principalType: "agent",
});

// One-time secrets, returned only at creation. connectionString and mcpToken are
// marked as Pulumi secrets (additionalSecretOutputs); mcpUrl is not secret.
export const agentConnectionString = agent.connectionString;
export const agentMcpUrl = agent.mcpUrl;
export const agentMcpToken = agent.mcpToken;
```

> **Agent credential secrets caveat.** `connectionString` and `mcpToken` are
> generated once at creation and never returned by subsequent reads. They are
> stored in Pulumi state as encrypted secret outputs. To rotate, replace the
> resource (`pulumi up` after `pulumi state delete` / a `replaceOnChanges`-style
> change to a `name`/immutable input).

> **Policy profiles are not yet managed as code.** `policyProfileId` (above, and
> `defaultPolicyProfileId` on a `Project`) is the ID of a policy profile that
> must be created out of band with `pgbeam policies create` or the dashboard —
> there is no `PolicyProfile` resource yet. The policy itself, the most
> security-sensitive primitive, therefore lives outside your reviewed IaC flow
> and is invisible to `pulumi preview` drift detection.

## Authentication

Set the `PGBEAM_API_TOKEN` environment variable or configure it via Pulumi
config:

```bash
pulumi config set pgbeam:apiToken --secret your-api-token
```

## Documentation

Full usage guide at [docs.pgbeam.com/pulumi](https://docs.pgbeam.com/pulumi).

## License

Apache 2.0 — see [LICENSE](LICENSE).
