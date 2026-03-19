import { describe, expect, it } from "vitest";
import { stripUndefined } from "./utils";

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
