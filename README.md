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

| Resource              | Description                          |
| --------------------- | ------------------------------------ |
| `pgbeam.Project`      | PgBeam project                       |
| `pgbeam.Database`     | PostgreSQL database connection       |
| `pgbeam.Replica`      | Read replica configuration           |
| `pgbeam.CustomDomain` | Custom domain for connection strings |
| `pgbeam.CacheRule`    | Query caching rule                   |
| `pgbeam.SpendLimit`   | Budget controls                      |

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
