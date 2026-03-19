/**
 * Recursively strips `undefined` values from an object.
 *
 * Pulumi dynamic providers serialize outputs via google-protobuf's
 * `Struct.fromJavaScript`, which only handles null, bool, number, string,
 * array, and object — `undefined` causes "Unexpected struct type".
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
