import * as pulumi from "@pulumi/pulumi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Real @pulumi/pulumi on purpose: the program-time path has to survive the real
// Output.get() restriction, which a mocked secret would hide.
const sdk = vi.hoisted(() => ({
  tokens: [] as string[],
  verify: vi.fn(async () => ({ verified: true })),
}));

vi.mock("pgbeam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pgbeam")>();

  class MockPgBeamClient {
    api = { projects: { verifyCustomDomain: sdk.verify } };
    constructor(opts: { token: string }) {
      sdk.tokens.push(opts.token);
    }
  }

  return { ...actual, PgBeamClient: MockPgBeamClient };
});

import { verifyCustomDomain } from "./customDomain.gen.js";
import { configure } from "./provider.js";

describe("program-time helpers after configure()", () => {
  beforeEach(() => {
    sdk.tokens.length = 0;
    sdk.verify.mockClear();
  });

  it("uses a real secret Output that get() rejects outside the provider host", () => {
    const secret = pulumi.secret({ apiKey: "pgb_program" });
    expect(() => secret.get()).toThrow(/Cannot call '\.get'/);
  });

  it("verifyCustomDomain resolves the configure() key without get()", async () => {
    configure({ apiKey: "pgb_program_key", baseUrl: "https://api.test.example" });

    await expect(verifyCustomDomain("prj_1", "dom_1")).resolves.toEqual({
      verified: true,
      error: undefined,
    });
    expect(sdk.tokens).toEqual(["pgb_program_key"]);
    expect(sdk.verify).toHaveBeenCalledWith({
      pathParams: { project_id: "prj_1", domain_id: "dom_1" },
    });
  });

  it("verifyCustomDomain resolves a secret Output key", async () => {
    configure({ apiKey: pulumi.secret("pgb_secret_output") });

    await verifyCustomDomain("prj_1", "dom_1");
    expect(sdk.tokens).toEqual(["pgb_secret_output"]);
  });

  // Last on purpose: setMocks switches the process-wide runtime to preview.
  it("rejects instead of hanging when the key is unknown during preview", async () => {
    await pulumi.runtime.setMocks(
      {
        newResource: (args) => ({ id: undefined as unknown as string, state: args.inputs }),
        call: (args) => args.inputs,
      },
      "proj",
      "stack",
      true,
    );
    class KeyResource extends pulumi.CustomResource {}
    const res = new KeyResource("test:index:Key", "key", {});
    configure({ apiKey: res.id });

    await expect(verifyCustomDomain("prj_1", "dom_1")).rejects.toThrow(/not known during preview/);
    expect(sdk.tokens).toEqual([]);
  });
});
