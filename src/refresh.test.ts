import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

/**
 * Refresh behaviour of the generated dynamic providers.
 *
 * `read()` is what `pulumi refresh` calls, and refresh exists only to detect
 * drift. These tests pin the two halves of that: an API that never answered
 * leaves the recorded state alone, and an API that did answer with a real
 * failure still fails the run.
 */

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  listProjects: vi.fn(),
  getDatabase: vi.fn(),
}));

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
    Config: vi.fn().mockImplementation(() => ({ get: vi.fn().mockReturnValue(undefined) })),
    Output: { create: vi.fn((v: unknown) => v) },
    secret: vi.fn((v: unknown) => ({ get: () => v })),
    dynamic: { Resource: DynamicResource },
    log: { info: vi.fn(), warn: vi.fn() },
    Input: {},
    CustomResourceOptions: {},
  };
});

// Only the transport is faked. ApiError and the error-description helpers stay
// real so the provider classifies the same error shapes the SDK throws.
vi.mock("pgbeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pgbeam")>();

  class MockPgBeamClient {
    api = { projects: api, databases: api };
  }

  return { ...actual, PgBeamClient: MockPgBeamClient };
});

import * as pulumi from "@pulumi/pulumi";
import { ApiError, NetworkError } from "pgbeam";
import { configure } from "./provider";

configure({ apiKey: "test-key", baseUrl: "https://api.test.example" });

interface ReadResult {
  id?: string;
  props?: Record<string, unknown>;
}

interface TestProvider {
  read(id: string, props: Record<string, unknown>): Promise<ReadResult>;
}

/**
 * The generated provider object is module-private; it only ever leaves the
 * module as the first argument to `pulumi.dynamic.Resource`. Instantiating the
 * resource against the mocked base class hands it over.
 */
type DynamicResourceCall = (
  provider: unknown,
  name: string,
  props: Record<string, unknown>,
) => void;

function capturedProvider(): TestProvider {
  const resourceMock = pulumi.dynamic.Resource as unknown as Mock<DynamicResourceCall>;
  const provider = resourceMock.mock.calls.at(-1)?.[0];
  if (!provider) throw new Error("dynamic provider was not captured");
  return provider as unknown as TestProvider;
}

async function projectProvider(): Promise<TestProvider> {
  const { Project } = await import("./project.gen");

  new Project("test-project", {
    orgId: "org_1",
    name: "e2e-staging",
    database: {
      host: "db.example.com",
      port: 5432,
      name: "mydb",
      username: "pgbeam",
      password: "secret",
    },
  });

  return capturedProvider();
}

async function databaseProvider(): Promise<TestProvider> {
  const { Database } = await import("./database.gen");

  new Database("test-db", {
    projectId: "prj_1",
    host: "db.example.com",
    port: 5432,
    name: "mydb",
    username: "pgbeam",
    password: "secret",
  });

  return capturedProvider();
}

const notFound = () => new ApiError(404, "Not Found", null);

const recordedProps = {
  orgId: "org_1",
  name: "e2e-staging",
  proxyHost: "prj_1.proxy.pgbeam.app",
};

describe("Project read during refresh", () => {
  beforeEach(() => {
    api.getProject.mockReset();
    api.listProjects.mockReset();
  });

  it("keeps the recorded state when the API never answered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cause = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), {
        code: "ECONNREFUSED",
      });
      api.getProject.mockRejectedValue(
        new NetworkError({
          method: "GET",
          url: "https://api.test.example/v1/projects/prj_1",
          attempts: 5,
          elapsedMs: 42,
          timedOut: false,
          timeoutMs: 15_000,
          cause: new TypeError("fetch failed", { cause }),
        }),
      );

      const provider = await projectProvider();
      const result = await provider.read("prj_1", { ...recordedProps });

      expect(result).toEqual({ id: "prj_1", props: recordedProps });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain("could not reach the API");
      // Refresh must not go looking for a replacement project when it cannot
      // even reach the API.
      expect(api.listProjects).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps the recorded state when a gateway answered instead of the API", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      api.getProject.mockRejectedValue(new ApiError(503, "Service Unavailable", null));

      const provider = await projectProvider();
      const result = await provider.read("prj_1", { ...recordedProps });

      expect(result).toEqual({ id: "prj_1", props: recordedProps });
    } finally {
      warn.mockRestore();
    }
  });

  it("still fails on a real API error", async () => {
    api.getProject.mockRejectedValue(new ApiError(500, "Internal Server Error", null));

    const provider = await projectProvider();

    await expect(provider.read("prj_1", { ...recordedProps })).rejects.toThrow(
      /PgBeam read Project failed \(500\)/,
    );
  });

  it("reports the resource state when the API does answer", async () => {
    api.getProject.mockResolvedValue({
      org_id: "org_1",
      name: "e2e-staging",
      proxy_host: "prj_1.proxy.pgbeam.app",
      status: "active",
    });

    const provider = await projectProvider();
    const result = await provider.read("prj_1", { ...recordedProps });

    expect(result.id).toBe("prj_1");
    expect(result.props?.status).toBe("active");
  });
});

describe("read of a resource deleted out-of-band", () => {
  beforeEach(() => {
    api.getProject.mockReset();
    api.listProjects.mockReset();
    api.getDatabase.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops a project from state when no project with its name remains", async () => {
    api.getProject.mockRejectedValue(notFound());
    api.listProjects.mockResolvedValue({
      projects: [{ id: "prj_9", org_id: "org_1", name: "other" }],
    });

    const provider = await projectProvider();
    const result = await provider.read("prj_1", { ...recordedProps });

    expect(result).toEqual({});
  });

  it("drops a resource without adoption config instead of failing", async () => {
    api.getDatabase.mockRejectedValue(notFound());

    const provider = await databaseProvider();
    const result = await provider.read("db_1", { projectId: "prj_1", name: "mydb" });

    expect(result).toEqual({});
  });

  it("re-adopts a project found on a later page of the list", async () => {
    api.getProject.mockRejectedValue(notFound());
    api.listProjects
      .mockResolvedValueOnce({
        projects: [{ id: "prj_8", org_id: "org_1", name: "other" }],
        next_page_token: "page-2",
      })
      .mockResolvedValueOnce({
        projects: [{ id: "prj_2", org_id: "org_1", name: "e2e-staging", status: "active" }],
      });

    const provider = await projectProvider();
    const result = await provider.read("prj_1", { ...recordedProps });

    expect(result.id).toBe("prj_2");
    expect(result.props?.status).toBe("active");
    expect(api.listProjects).toHaveBeenCalledTimes(2);
    expect(api.listProjects.mock.calls[1][0].queryParams.page_token).toBe("page-2");
  });

  it("keeps the recorded state when a gateway answered with 502", async () => {
    api.getProject.mockRejectedValue(new ApiError(502, "Bad Gateway", null));

    const provider = await projectProvider();
    const result = await provider.read("prj_1", { ...recordedProps });

    expect(result).toEqual({ id: "prj_1", props: recordedProps });
    expect(api.listProjects).not.toHaveBeenCalled();
  });
});
