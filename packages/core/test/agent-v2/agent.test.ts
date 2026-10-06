import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { AgentV2 } from "../../src/agent-v2/agent.ts";

const accepts = (schema: Schema.Decoder<unknown>, value: unknown) =>
  Schema.decodeUnknownExit(schema)(value)._tag === "Success";

const create = (fields: Record<string, unknown> = {}) => ({
  name: "Reviewer",
  roleId: "builtin:member",
  instructions: "Review each change.\n\n- Say what breaks.",
  harness: { _tag: "Auto" },
  model: { connectionId: "conn-models", id: "claude-opus-5-5", effort: "high" },
  sandbox: null,
  ...fields,
});

describe("a new agent", () => {
  it("runs on a harness amends chooses or a connection's, with a model, in a sandbox or none", () => {
    expect(accepts(AgentV2.CreateInput, create())).toBe(true);
    expect(
      accepts(
        AgentV2.CreateInput,
        create({
          harness: { _tag: "Connection", connectionId: "conn-opencode" },
          model: { connectionId: "conn-models", id: "qwen-coder" },
          sandbox: { connectionId: "conn-daytona" },
        }),
      ),
    ).toBe(true);
    for (const refused of [
      { harness: { _tag: "Connection" } },
      { harness: { _tag: "Default" } },
      { harness: null },
      { sandbox: undefined },
      { sandbox: { connectionId: "" } },
    ]) {
      expect(accepts(AgentV2.CreateInput, create(refused)), JSON.stringify(refused)).toBe(false);
    }
  });

  it("works by instructions of up to 20,000 characters, without surrounding space", () => {
    expect(accepts(AgentV2.CreateInput, create({ instructions: "" }))).toBe(true);
    expect(accepts(AgentV2.CreateInput, create({ instructions: "x".repeat(20_000) }))).toBe(true);
    for (const refused of [" Review.", "Review.\n", "a\u0000b", "x".repeat(20_001)]) {
      expect(
        accepts(AgentV2.CreateInput, create({ instructions: refused })),
        JSON.stringify(refused.slice(0, 20)),
      ).toBe(false);
    }
  });

  it("names a model by its id, with an effort providers name", () => {
    const model = (fields: Record<string, unknown>) =>
      create({ model: { connectionId: "conn-models", id: "claude-opus-5-5", ...fields } });

    for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh", "max"]) {
      expect(accepts(AgentV2.CreateInput, model({ effort })), effort).toBe(true);
    }
    for (const refused of [
      { effort: "extreme" },
      { id: "" },
      { id: " claude-opus-5-5" },
      { id: "a\u0000b" },
      { id: "x".repeat(201) },
    ]) {
      expect(accepts(AgentV2.CreateInput, model(refused)), JSON.stringify(refused)).toBe(false);
    }
  });

  it("is named as members are", () => {
    for (const refused of ["", " Reviewer", "Re​viewer", "x".repeat(81)]) {
      expect(accepts(AgentV2.CreateInput, create({ name: refused })), refused).toBe(false);
    }
  });
});
