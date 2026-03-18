import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @pulumi/pulumi before importing provider
// ---------------------------------------------------------------------------
vi.mock("@pulumi/pulumi", () => ({
  Config: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(undefined),
  })),
}));

// Mock the PgBeam SDK
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
      this.api = { projects: {}, databases: {}, platform: {} };
    }
  }

  return {
    PgBeamClient: MockPgBeamClient,
    ApiError: MockApiError,
  };
});

import { ApiError } from "pgbeam";
import { apiErrorStatus, configure, createClient, handleApiError } from "./provider";

// ---------------------------------------------------------------------------
// configure
// ---------------------------------------------------------------------------
describe("configure", () => {
  beforeEach(() => {
    // Reset module state between tests — configure sets a global variable
    // We re-import fresh in tests that need it, but configure is idempotent
    // in practice so we just call it with different values.
  });

  it("sets global config with apiKey and default baseUrl", () => {
    configure({ apiKey: "test-key" });
    // Verify it doesn't throw and createClient works
    const client = createClient();
    expect(client).toBeDefined();
  });

  it("sets global config with explicit baseUrl", () => {
    configure({ apiKey: "test-key", baseUrl: "https://custom.example.com" });
    const client = createClient();
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createClient
// ---------------------------------------------------------------------------
describe("createClient", () => {
  it("returns an API client object", () => {
    configure({ apiKey: "test-key" });
    const client = createClient();
    expect(client).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// handleApiError
// ---------------------------------------------------------------------------
describe("handleApiError", () => {
  it("wraps ApiError with context information", () => {
    const err = new ApiError(404, "Not Found", { message: "not found" });
    expect(() => handleApiError("read", "Project", err)).toThrow(
      /PgBeam read Project failed \(404\): Not Found/,
    );
  });

  it("includes body in error message when present", () => {
    const err = new ApiError(400, "Bad Request", { detail: "invalid" });
    expect(() => handleApiError("create", "Database", err)).toThrow(/invalid/);
  });

  it("handles ApiError without body", () => {
    const err = new ApiError(500, "Internal Server Error", null);
    expect(() => handleApiError("update", "CacheRule", err)).toThrow(
      /PgBeam update CacheRule failed \(500\): Internal Server Error/,
    );
  });

  it("re-throws non-ApiError errors as-is", () => {
    const err = new Error("network failure");
    expect(() => handleApiError("delete", "Replica", err)).toThrow("network failure");
  });

  it("re-throws non-Error values", () => {
    expect(() => handleApiError("create", "Project", "string error")).toThrow("string error");
  });
});

// ---------------------------------------------------------------------------
// apiErrorStatus
// ---------------------------------------------------------------------------
describe("apiErrorStatus", () => {
  it("returns status from an ApiError instance", () => {
    const err = new ApiError(404, "Not Found", null);
    expect(apiErrorStatus(err)).toBe(404);
  });

  it("returns status from a duck-typed error with status property", () => {
    const err = { status: 503, message: "Service Unavailable" };
    expect(apiErrorStatus(err)).toBe(503);
  });

  it("returns undefined for a plain Error without status", () => {
    const err = new Error("boom");
    expect(apiErrorStatus(err)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(apiErrorStatus(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(apiErrorStatus(undefined)).toBeUndefined();
  });

  it("returns undefined for a string", () => {
    expect(apiErrorStatus("error")).toBeUndefined();
  });

  it("returns undefined for an object with non-numeric status", () => {
    const err = { status: "not-a-number" };
    expect(apiErrorStatus(err)).toBeUndefined();
  });

  it("returns status 0 (falsy but valid number)", () => {
    const err = { status: 0 };
    expect(apiErrorStatus(err)).toBe(0);
  });
});
