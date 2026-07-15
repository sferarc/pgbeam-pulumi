# PgBeam Pulumi Provider

Pulumi provider for [PgBeam](https://pgbeam.com) — manage your globally
distributed PostgreSQL proxy infrastructure as code using TypeScript, Python,
Go, or C#.

## Install

```bash
npm install @pgbeam/pulumi
```

## Usage

A project is created together with its primary database in one call, so pass the
upstream connection as the required `database` object. A project has no `region`;
PgBeam serves every project from every region and routes each client to the
nearest one automatically.

```typescript
import * as pulumi from "@pulumi/pulumi";
import * as pgbeam from "@pgbeam/pulumi";

const config = new pulumi.Config();

const project = new pgbeam.Project("my-project", {
  name: "my-project",
  orgId: "org_123",
  database: {
    host: "your-db-host.example.com",
    port: 5432,
    name: "mydb",
    username: "dbuser",
    password: config.requireSecret("dbPassword"),
    sslMode: "require",
  },
});
```

To attach more databases later (for example a read replica), use the standalone
`pgbeam.Database` resource with its own `projectId`, `name`, and credentials.

## Resources

| Resource                 | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `pgbeam.Project`         | PgBeam project                                             |
| `pgbeam.Database`        | PostgreSQL database connection                             |
| `pgbeam.Replica`         | Read replica configuration                                 |
| `pgbeam.CustomDomain`    | Custom domain for connection strings                       |
| `pgbeam.CacheRule`       | Query caching rule                                         |
| `pgbeam.SpendLimit`      | Budget controls                                            |
| `pgbeam.AgentCredential` | Scoped agent credential                                    |
| `pgbeam.WebhookEndpoint` | Event delivery endpoint                                    |
| `pgbeam.PolicyProfile`   | Policy profile (access mode, allowlists, masking, budgets) |

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

Manage policies as code with the `pgbeam.PolicyProfile` resource, then pass its
`id` wherever a profile is required (`policyProfileId` above, or
`defaultPolicyProfileId` on a `Project` to enforce a profile on
passthrough/human connections):

```typescript
const readOnly = new pgbeam.PolicyProfile("read-only", {
  projectId: project.id,
  name: "read-only",
  accessMode: "read_only",
});
```

Keeping the profile in Pulumi puts the most security-sensitive primitive under
`pulumi preview` drift detection.

## Authentication

Set the `PGBEAM_API_KEY` environment variable or configure it via Pulumi config:

```bash
pulumi config set pgbeam:apiKey --secret your-api-key
```

## Documentation

Full usage guide at [docs.pgbeam.com/pulumi](https://docs.pgbeam.com/pulumi).

## License

Apache 2.0 — see [LICENSE](LICENSE).
