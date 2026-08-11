import { createRequire } from "node:module";
import * as pulumi from "@pulumi/pulumi";
import { describe, expect, it } from "vitest";
import { agentCredentialProvider } from "./agentCredential.gen.js";
import { cacheRuleProvider } from "./cacheRule.gen.js";
import { customDomainProvider } from "./customDomain.gen.js";
import { databaseProvider } from "./database.gen.js";
import { policyProfileProvider } from "./policyProfile.gen.js";
import { projectProvider } from "./project.gen.js";
import { apiErrorStatus, isApiUnreachable } from "./provider.js";
import { replicaProvider } from "./replica.gen.js";
import { selfHostEnrollmentProvider } from "./selfHostEnrollment.gen.js";
import { spendLimitProvider } from "./spendLimit.gen.js";
import { webhookEndpointProvider } from "./webhookEndpoint.gen.js";

/**
 * Dynamic providers must survive Pulumi's closure serializer.
 *
 * Pulumi keeps no reference to a dynamic provider's code. It serializes the
 * provider and everything its methods reach into stack state, and rebuilds that
 * graph from the state on the next create/update/delete/read. The serializer
 * understands primitives, arrays, plain objects, functions, RegExp and Promise.
 * It has no case for the built-ins that carry internal slots, so a `Set` is
 * rebuilt as `{}` with `Set.prototype.has` pinned onto it, and the first call
 * throws "Method Set.prototype.has called on incompatible receiver". Map,
 * WeakMap, WeakSet and Date fail the same way.
 *
 * This package is not exempt because it ships as a package. `infra` links it as
 * a workspace symlink, so its real path is outside `node_modules` and Pulumi
 * classifies it as a local module, which means by-value serialization rather
 * than a `require`.
 *
 * `pulumi preview` never serializes a provider, so nothing short of a real
 * `pulumi up` catches this. These tests run the real serializer instead.
 */

/**
 * Built-ins whose prototype methods need real internal slots. When one is
 * captured, the serializer emits `global.<Ctor>.prototype.<member>` onto a bare
 * object, which is exactly the shape that throws when it is called.
 *
 * RegExp is absent on purpose: the serializer has a case for it and re-emits a
 * real `new RegExp(...)`. So are plain class instances, which come back with
 * their prototype and data properties intact.
 */
const SLOTTED_BUILTINS = [
  "Set",
  "Map",
  "WeakSet",
  "WeakMap",
  "Date",
  "URL",
  "URLSearchParams",
  "Headers",
  "Request",
  "Response",
  "ArrayBuffer",
  "DataView",
  "AbortController",
  "AbortSignal",
] as const;

/** Serialize a value the way `pulumi.dynamic.Resource` serializes its provider. */
async function serialize(value: unknown): Promise<string> {
  const { text } = await pulumi.runtime.serializeFunction(() => value, { allowSecrets: true });
  return text;
}

/** Evaluate serialized closure text the way the dynamic provider host does. */
function evaluate<T>(text: string): T {
  const exports: { handler?: () => T } = {};
  const module = { exports };
  const factory = new Function("exports", "require", "module", "__filename", "__dirname", text);
  factory(exports, createRequire(import.meta.url), module, "closure.js", process.cwd());
  const handler = exports.handler;
  if (!handler) throw new Error("serialized closure did not export a handler");
  return handler();
}

/** Serialize a value and rebuild it, giving back the copy a deploy would run. */
async function roundTrip<T>(value: T): Promise<T> {
  return evaluate<T>(await serialize(value));
}

describe("dynamic provider closure serialization", () => {
  it("keeps the unreachable-API classifier working after a round trip", async () => {
    // `read()` calls this on every refresh failure to decide whether the API
    // said anything about the resource. A lookup that throws here turns a
    // recoverable refresh into a failed one.
    const rt = await roundTrip({ apiErrorStatus, isApiUnreachable });

    expect(rt.isApiUnreachable({ status: 503 })).toBe(true);
    expect(rt.isApiUnreachable({ status: 404 })).toBe(false);
    expect(rt.isApiUnreachable({ code: "ECONNRESET" })).toBe(true);
    expect(rt.isApiUnreachable({ name: "TimeoutError" })).toBe(true);
    expect(rt.isApiUnreachable({ code: "EACCES" })).toBe(false);
    expect(rt.apiErrorStatus({ status: 418 })).toBe(418);
  });

  it.each([
    ["project", projectProvider],
    ["database", databaseProvider],
    ["replica", replicaProvider],
    ["customDomain", customDomainProvider],
    ["cacheRule", cacheRuleProvider],
    ["spendLimit", spendLimitProvider],
    ["agentCredential", agentCredentialProvider],
    ["policyProfile", policyProfileProvider],
    ["webhookEndpoint", webhookEndpointProvider],
    ["selfHostEnrollment", selfHostEnrollmentProvider],
  ])("serializes the %s provider without a non-serializable built-in", async (_name, provider) => {
    const text = await serialize(provider);
    const offenders = SLOTTED_BUILTINS.filter((name) => text.includes(`global.${name}.prototype.`));
    expect(
      offenders,
      `the serialized closure captured ${offenders.join(", ")}. Pulumi rebuilds these as plain ` +
        `objects, so calling a method on one throws at deploy time. Use an array or a plain ` +
        `object at module scope, or build the value inside the function body.`,
    ).toEqual([]);
  });
});
