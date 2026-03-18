import { describe, expect, it } from "vitest";
import { stripUndefined, toCacheConfig, toPoolConfig } from "./utils";

// ---------------------------------------------------------------------------
// stripUndefined
// ---------------------------------------------------------------------------
describe("stripUndefined", () => {
  it("removes top-level undefined values", () => {
    const input = { a: 1, b: undefined, c: "hello" };
    expect(stripUndefined(input)).toEqual({ a: 1, c: "hello" });
  });

  it("preserves null values", () => {
    const input = { a: null, b: 2 };
    expect(stripUndefined(input)).toEqual({ a: null, b: 2 });
  });

  it("preserves arrays as-is", () => {
    const input = { a: [1, 2, 3], b: ["x"] };
    expect(stripUndefined(input)).toEqual({ a: [1, 2, 3], b: ["x"] });
  });

  it("recursively strips undefined from nested objects", () => {
    const input = {
      a: 1,
      nested: {
        b: 2,
        c: undefined,
        deep: {
          d: "keep",
          e: undefined,
        },
      },
    };
    expect(stripUndefined(input)).toEqual({
      a: 1,
      nested: {
        b: 2,
        deep: {
          d: "keep",
        },
      },
    });
  });

  it("handles empty objects", () => {
    expect(stripUndefined({})).toEqual({});
  });

  it("handles object where all values are undefined", () => {
    const input = { a: undefined, b: undefined };
    expect(stripUndefined(input)).toEqual({});
  });

  it("preserves booleans, numbers, and strings", () => {
    const input = { flag: false, count: 0, name: "" };
    expect(stripUndefined(input)).toEqual({ flag: false, count: 0, name: "" });
  });

  it("does not recurse into arrays (leaves array elements unchanged)", () => {
    const input = { items: [{ a: 1, b: undefined }] };
    // Arrays are not recursed into — they are kept as-is
    expect(stripUndefined(input)).toEqual({ items: [{ a: 1, b: undefined }] });
  });
});

// ---------------------------------------------------------------------------
// toCacheConfig
// ---------------------------------------------------------------------------
describe("toCacheConfig", () => {
  it("returns undefined when input is undefined", () => {
    expect(toCacheConfig(undefined)).toBeUndefined();
  });

  it("converts camelCase args to snake_case CacheConfig", () => {
    const result = toCacheConfig({
      enabled: true,
      ttlSeconds: 300,
      maxEntries: 1000,
      swrSeconds: 60,
    });
    expect(result).toEqual({
      enabled: true,
      ttl_seconds: 300,
      max_entries: 1000,
      swr_seconds: 60,
    });
  });

  it("coerces values to correct types", () => {
    const result = toCacheConfig({
      enabled: 1,
      ttlSeconds: "300",
      maxEntries: "1000",
      swrSeconds: "60",
    });
    expect(result).toEqual({
      enabled: true,
      ttl_seconds: 300,
      max_entries: 1000,
      swr_seconds: 60,
    });
  });

  it("handles falsy enabled value", () => {
    const result = toCacheConfig({
      enabled: 0,
      ttlSeconds: 300,
      maxEntries: 1000,
      swrSeconds: 60,
    });
    expect(result?.enabled).toBe(false);
  });

  it("handles missing properties (NaN for numbers, false for boolean)", () => {
    const result = toCacheConfig({});
    expect(result).toEqual({
      enabled: false,
      ttl_seconds: NaN,
      max_entries: NaN,
      swr_seconds: NaN,
    });
  });
});

// ---------------------------------------------------------------------------
// toPoolConfig
// ---------------------------------------------------------------------------
describe("toPoolConfig", () => {
  it("returns undefined when input is undefined", () => {
    expect(toPoolConfig(undefined)).toBeUndefined();
  });

  it("converts session pool config", () => {
    const result = toPoolConfig({
      poolSize: 10,
      minPoolSize: 2,
      poolMode: "session",
    });
    expect(result).toEqual({
      pool_size: 10,
      min_pool_size: 2,
      pool_mode: "session",
    });
  });

  it("converts transaction pool config", () => {
    const result = toPoolConfig({
      poolSize: 20,
      minPoolSize: 5,
      poolMode: "transaction",
    });
    expect(result).toEqual({
      pool_size: 20,
      min_pool_size: 5,
      pool_mode: "transaction",
    });
  });

  it("converts statement pool config", () => {
    const result = toPoolConfig({
      poolSize: 50,
      minPoolSize: 10,
      poolMode: "statement",
    });
    expect(result).toEqual({
      pool_size: 50,
      min_pool_size: 10,
      pool_mode: "statement",
    });
  });

  it("throws on invalid pool mode", () => {
    expect(() =>
      toPoolConfig({
        poolSize: 10,
        minPoolSize: 2,
        poolMode: "invalid",
      }),
    ).toThrow('Invalid pool mode: invalid. Must be "session", "transaction", or "statement".');
  });

  it("coerces numeric values", () => {
    const result = toPoolConfig({
      poolSize: "15",
      minPoolSize: "3",
      poolMode: "transaction",
    });
    expect(result).toEqual({
      pool_size: 15,
      min_pool_size: 3,
      pool_mode: "transaction",
    });
  });
});
