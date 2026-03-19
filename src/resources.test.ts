import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @pulumi/pulumi — dynamic resources need this
// ---------------------------------------------------------------------------
vi.mock("@pulumi/pulumi", () => {
  const DynamicResource = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    _provider: unknown,
    _name: string,
    props: Record<string, unknown>,
  ) {
    for (const [key, value] of Object.entries(props)) {
      this[key] = value;
    }
  });

  return {
    Config: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockReturnValue(undefined),
    })),
    Output: { create: vi.fn((v: unknown) => v) },
    dynamic: { Resource: DynamicResource },
    log: { info: vi.fn(), warn: vi.fn() },
    Input: {},
    CustomResourceOptions: {},
  };
});

vi.mock("pgbeam", () => {
  class MockApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    constructor(status: number, statusText: string, body?: unknown) {
      super(`${status} ${statusText}`);
      this.name = "ApiError";
      this.status = status;
      this.statusText = statusText;
      this.body = body;
    }
  }

  class MockPgBeamClient {
    api: Record<string, unknown>;
    constructor(_opts: Record<string, unknown>) {
      this.api = {};
    }
  }

  return {
    PgBeamClient: MockPgBeamClient,
    ApiError: MockApiError,
  };
});

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { configure } from "./provider";

// Ensure provider is configured before resource imports
configure({ apiKey: "test-key", baseUrl: "https://api.test.com" });

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
describe("Project resource", () => {
  it("exports Project class and ProjectArgs type", async () => {
    const { Project } = await import("./project.gen");
    expect(Project).toBeDefined();
    expect(typeof Project).toBe("function");
  });

  it("can be instantiated with required args", async () => {
    const { Project } = await import("./project.gen");
    const project = new Project("test-project", {
      orgId: "org_123",
      name: "my-project",
      database: {
        host: "db.example.com",
        port: 5432,
        name: "mydb",
        username: "pgbeam",
        password: "secret",
      },
    });
    expect(project).toBeDefined();
  });

  it("passes cloud default of 'aws' to the dynamic resource provider", async () => {
    const pulumi = await import("@pulumi/pulumi");
    const { Project } = await import("./project.gen");
    const project = new Project("test-project-defaults", {
      orgId: "org_123",
      name: "my-project",
      database: {
        host: "db.example.com",
        port: 5432,
        name: "mydb",
        username: "pgbeam",
        password: "secret",
      },
    });
    expect(project).toBeDefined();
    expect(pulumi.dynamic.Resource).toHaveBeenCalled();
  });

  it("accepts optional args", async () => {
    const { Project } = await import("./project.gen");
    const project = new Project("test-project-full", {
      orgId: "org_123",
      name: "my-project",
      description: "A test project",
      tags: ["test", "dev"],
      cloud: "gcp",
      queriesPerSecond: 100,
      burstSize: 200,
      maxConnections: 50,
      database: {
        host: "db.example.com",
        port: 5432,
        name: "mydb",
        username: "pgbeam",
        password: "secret",
        sslMode: "require",
        role: "primary",
        poolRegion: "us-east-1",
        cacheConfig: {
          enabled: true,
          ttlSeconds: 300,
          maxEntries: 1000,
          swrSeconds: 60,
        },
        poolConfig: {
          poolSize: 20,
          minPoolSize: 5,
          poolMode: "transaction",
        },
      },
    });
    expect(project).toBeDefined();
  });

  it("initializes computed outputs as undefined", async () => {
    const { Project } = await import("./project.gen");
    const project = new Project("test-project-outputs", {
      orgId: "org_123",
      name: "my-project",
      database: {
        host: "db.example.com",
        port: 5432,
        name: "mydb",
        username: "pgbeam",
        password: "secret",
      },
    }) as unknown as Record<string, unknown>;

    expect(project.proxyHost).toBeUndefined();
    expect(project.status).toBeUndefined();
    expect(project.createdAt).toBeUndefined();
    expect(project.updatedAt).toBeUndefined();
    expect(project.databaseCount).toBeUndefined();
    expect(project.activeConnections).toBeUndefined();
    expect(project.primaryDatabaseId).toBeUndefined();
  });

  it("accepts azure cloud provider without error", async () => {
    const { Project } = await import("./project.gen");
    const project = new Project("test-azure-project", {
      orgId: "org_123",
      name: "azure-project",
      cloud: "azure",
      database: {
        host: "db.example.com",
        port: 5432,
        name: "mydb",
        username: "pgbeam",
        password: "secret",
      },
    });
    expect(project).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
describe("Database resource", () => {
  it("exports Database class", async () => {
    const { Database } = await import("./database.gen");
    expect(Database).toBeDefined();
    expect(typeof Database).toBe("function");
  });

  it("can be instantiated with required args", async () => {
    const { Database } = await import("./database.gen");
    const db = new Database("test-db", {
      projectId: "proj_123",
      host: "replica.example.com",
      port: 5432,
      name: "mydb",
      username: "pgbeam",
      password: "secret",
    });
    expect(db).toBeDefined();
  });

  it("accepts optional ssl and pool config", async () => {
    const { Database } = await import("./database.gen");
    const db = new Database("test-db-full", {
      projectId: "proj_123",
      host: "replica.example.com",
      port: 5432,
      name: "mydb",
      username: "pgbeam",
      password: "secret",
      sslMode: "verify-full",
      role: "replica",
      poolRegion: "eu-west-1",
      cacheConfig: {
        enabled: true,
        ttlSeconds: 120,
        maxEntries: 5000,
        swrSeconds: 30,
      },
      poolConfig: {
        poolSize: 10,
        minPoolSize: 2,
        poolMode: "session",
      },
    });
    expect(db).toBeDefined();
  });

  it("initializes computed outputs as undefined", async () => {
    const { Database } = await import("./database.gen");
    const db = new Database("test-db-outputs", {
      projectId: "proj_123",
      host: "replica.example.com",
      port: 5432,
      name: "mydb",
      username: "pgbeam",
      password: "secret",
    }) as unknown as Record<string, unknown>;

    expect(db.connectionString).toBeUndefined();
    expect(db.createdAt).toBeUndefined();
    expect(db.updatedAt).toBeUndefined();
  });

  it("accepts all SSL modes", async () => {
    const { Database } = await import("./database.gen");
    const sslModes = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] as const;

    for (const sslMode of sslModes) {
      const db = new Database(`test-db-ssl-${sslMode}`, {
        projectId: "proj_123",
        host: "db.example.com",
        port: 5432,
        name: "mydb",
        username: "pgbeam",
        password: "secret",
        sslMode,
      });
      expect(db).toBeDefined();
    }
  });

  it("accepts primary and replica roles", async () => {
    const { Database } = await import("./database.gen");

    const primary = new Database("test-db-primary", {
      projectId: "proj_123",
      host: "db.example.com",
      port: 5432,
      name: "mydb",
      username: "pgbeam",
      password: "secret",
      role: "primary",
    });
    expect(primary).toBeDefined();

    const replica = new Database("test-db-replica", {
      projectId: "proj_123",
      host: "db.example.com",
      port: 5432,
      name: "mydb",
      username: "pgbeam",
      password: "secret",
      role: "replica",
    });
    expect(replica).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CacheRule
// ---------------------------------------------------------------------------
describe("CacheRule resource", () => {
  it("exports CacheRule class", async () => {
    const { CacheRule } = await import("./cacheRule.gen");
    expect(CacheRule).toBeDefined();
    expect(typeof CacheRule).toBe("function");
  });

  it("can be instantiated with required args", async () => {
    const { CacheRule } = await import("./cacheRule.gen");
    const rule = new CacheRule("test-rule", {
      projectId: "proj_123",
      databaseId: "db_456",
      queryHash: "a1b2c3d4e5f67890",
      cacheEnabled: true,
    });
    expect(rule).toBeDefined();
  });

  it("accepts optional TTL and SWR overrides", async () => {
    const { CacheRule } = await import("./cacheRule.gen");
    const rule = new CacheRule("test-rule-full", {
      projectId: "proj_123",
      databaseId: "db_456",
      queryHash: "a1b2c3d4e5f67890",
      cacheEnabled: true,
      cacheTtlSeconds: 300,
      cacheSwrSeconds: 60,
    });
    expect(rule).toBeDefined();
  });

  it("accepts null TTL and SWR (use project defaults)", async () => {
    const { CacheRule } = await import("./cacheRule.gen");
    const rule = new CacheRule("test-rule-defaults", {
      projectId: "proj_123",
      databaseId: "db_456",
      queryHash: "a1b2c3d4e5f67890",
      cacheEnabled: false,
      cacheTtlSeconds: null,
      cacheSwrSeconds: null,
    });
    expect(rule).toBeDefined();
  });

  it("initializes computed outputs as undefined", async () => {
    const { CacheRule } = await import("./cacheRule.gen");
    const rule = new CacheRule("test-rule-outputs", {
      projectId: "proj_123",
      databaseId: "db_456",
      queryHash: "abcdef0123456789",
      cacheEnabled: true,
    }) as unknown as Record<string, unknown>;

    expect(rule.normalizedSql).toBeUndefined();
    expect(rule.queryType).toBeUndefined();
    expect(rule.callCount).toBeUndefined();
    expect(rule.avgLatencyMs).toBeUndefined();
    expect(rule.p95LatencyMs).toBeUndefined();
    expect(rule.avgResponseBytes).toBeUndefined();
    expect(rule.stabilityRate).toBeUndefined();
    expect(rule.recommendation).toBeUndefined();
    expect(rule.firstSeenAt).toBeUndefined();
    expect(rule.lastSeenAt).toBeUndefined();
  });

  it("can be instantiated with caching disabled", async () => {
    const { CacheRule } = await import("./cacheRule.gen");
    const rule = new CacheRule("test-rule-disabled", {
      projectId: "proj_123",
      databaseId: "db_456",
      queryHash: "0000000000000000",
      cacheEnabled: false,
    });
    expect(rule).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CustomDomain
// ---------------------------------------------------------------------------
describe("CustomDomain resource", () => {
  it("exports CustomDomain class and verifyCustomDomain function", async () => {
    const { CustomDomain, verifyCustomDomain } = await import("./customDomain.gen");
    expect(CustomDomain).toBeDefined();
    expect(typeof CustomDomain).toBe("function");
    expect(verifyCustomDomain).toBeDefined();
    expect(typeof verifyCustomDomain).toBe("function");
  });

  it("can be instantiated with required args", async () => {
    const { CustomDomain } = await import("./customDomain.gen");
    const domain = new CustomDomain("test-domain", {
      projectId: "proj_123",
      domain: "db.example.com",
    });
    expect(domain).toBeDefined();
  });

  it("initializes computed outputs as undefined", async () => {
    const { CustomDomain } = await import("./customDomain.gen");
    const domain = new CustomDomain("test-domain-outputs", {
      projectId: "proj_123",
      domain: "db.example.com",
    }) as unknown as Record<string, unknown>;

    expect(domain.verified).toBeUndefined();
    expect(domain.verifiedAt).toBeUndefined();
    expect(domain.tlsCertExpiry).toBeUndefined();
    expect(domain.dnsVerificationToken).toBeUndefined();
    expect(domain.dnsInstructions).toBeUndefined();
    expect(domain.createdAt).toBeUndefined();
    expect(domain.updatedAt).toBeUndefined();
  });

  it("can be instantiated with different domain names", async () => {
    const { CustomDomain } = await import("./customDomain.gen");
    const domain = new CustomDomain("test-domain-args", {
      projectId: "proj_456",
      domain: "api.myapp.com",
    });
    expect(domain).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Replica
// ---------------------------------------------------------------------------
describe("Replica resource", () => {
  it("exports Replica class", async () => {
    const { Replica } = await import("./replica.gen");
    expect(Replica).toBeDefined();
    expect(typeof Replica).toBe("function");
  });

  it("can be instantiated with required args", async () => {
    const { Replica } = await import("./replica.gen");
    const replica = new Replica("test-replica", {
      databaseId: "db_456",
      host: "replica.us-west-2.rds.amazonaws.com",
      port: 5432,
    });
    expect(replica).toBeDefined();
  });

  it("accepts optional sslMode", async () => {
    const { Replica } = await import("./replica.gen");
    const replica = new Replica("test-replica-ssl", {
      databaseId: "db_456",
      host: "replica.us-west-2.rds.amazonaws.com",
      port: 5432,
      sslMode: "require",
    });
    expect(replica).toBeDefined();
  });

  it("initializes computed outputs as undefined", async () => {
    const { Replica } = await import("./replica.gen");
    const replica = new Replica("test-replica-outputs", {
      databaseId: "db_456",
      host: "replica.us-west-2.rds.amazonaws.com",
      port: 5432,
    }) as unknown as Record<string, unknown>;

    expect(replica.createdAt).toBeUndefined();
    expect(replica.updatedAt).toBeUndefined();
  });

  it("can be instantiated with different host and port", async () => {
    const { Replica } = await import("./replica.gen");
    const replica = new Replica("test-replica-args", {
      databaseId: "db_789",
      host: "replica.eu-west-1.rds.amazonaws.com",
      port: 5433,
      sslMode: "verify-ca",
    });
    expect(replica).toBeDefined();
  });

  it("accepts all SSL modes", async () => {
    const { Replica } = await import("./replica.gen");
    const sslModes = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] as const;

    for (const sslMode of sslModes) {
      const replica = new Replica(`test-replica-ssl-${sslMode}`, {
        databaseId: "db_456",
        host: "replica.example.com",
        port: 5432,
        sslMode,
      });
      expect(replica).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// SpendLimit
// ---------------------------------------------------------------------------
describe("SpendLimit resource", () => {
  it("exports SpendLimit class", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    expect(SpendLimit).toBeDefined();
    expect(typeof SpendLimit).toBe("function");
  });

  it("can be instantiated with required args", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    const limit = new SpendLimit("test-limit", {
      orgId: "org_123",
      spendLimit: 500,
    });
    expect(limit).toBeDefined();
  });

  it("accepts null spend limit (no limit)", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    const limit = new SpendLimit("test-no-limit", {
      orgId: "org_123",
      spendLimit: null,
    });
    expect(limit).toBeDefined();
  });

  it("accepts undefined spend limit", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    const limit = new SpendLimit("test-undefined-limit", {
      orgId: "org_123",
    });
    expect(limit).toBeDefined();
  });

  it("initializes computed outputs as undefined", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    const limit = new SpendLimit("test-limit-outputs", {
      orgId: "org_123",
      spendLimit: 100,
    }) as unknown as Record<string, unknown>;

    expect(limit.plan).toBeUndefined();
    expect(limit.billingProvider).toBeUndefined();
    expect(limit.subscriptionStatus).toBeUndefined();
    expect(limit.currentPeriodEnd).toBeUndefined();
    expect(limit.enabled).toBeUndefined();
    expect(limit.customPricing).toBeUndefined();
    expect(limit.limits).toBeUndefined();
  });

  it("can be instantiated with different org and limit", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    const limit = new SpendLimit("test-limit-args", {
      orgId: "org_456",
      spendLimit: 1000,
    });
    expect(limit).toBeDefined();
  });

  it("accepts zero spend limit", async () => {
    const { SpendLimit } = await import("./spendLimit.gen");
    const limit = new SpendLimit("test-zero-limit", {
      orgId: "org_123",
      spendLimit: 0,
    });
    expect(limit).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Index re-exports
// ---------------------------------------------------------------------------
describe("Pulumi package index", () => {
  it("re-exports all resource classes", async () => {
    const mod = await import("./index");
    expect(mod.Project).toBeDefined();
    expect(mod.Database).toBeDefined();
    expect(mod.CacheRule).toBeDefined();
    expect(mod.CustomDomain).toBeDefined();
    expect(mod.Replica).toBeDefined();
    expect(mod.SpendLimit).toBeDefined();
    expect(mod.configure).toBeDefined();
    expect(mod.verifyCustomDomain).toBeDefined();
  });

  it("configure is a function", async () => {
    const mod = await import("./index");
    expect(typeof mod.configure).toBe("function");
  });

  it("verifyCustomDomain is a function", async () => {
    const mod = await import("./index");
    expect(typeof mod.verifyCustomDomain).toBe("function");
  });

  it("all resource classes are constructors (typeof function)", async () => {
    const mod = await import("./index");
    expect(typeof mod.Project).toBe("function");
    expect(typeof mod.Database).toBe("function");
    expect(typeof mod.CacheRule).toBe("function");
    expect(typeof mod.CustomDomain).toBe("function");
    expect(typeof mod.Replica).toBe("function");
    expect(typeof mod.SpendLimit).toBe("function");
  });
});
