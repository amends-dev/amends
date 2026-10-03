import { Transcript } from "@amends/harness";
import { Support } from "@amends/harness-conformance";
import { describe, expect, it } from "@effect/vitest";
import { Redacted } from "effect";
import { OpenCodeHarness } from "../src/index.ts";

const { input, response, text } = Support;
const model = { providerID: "amends", modelID: "fake-model" };
const options = { workdir: "/work", model, now: 1_790_000_000_000 };
const lookup: Transcript.ToolCall = {
  _tag: "ToolCall",
  id: Transcript.ToolCallId.make("c1"),
  name: "lookup",
  params: { query: "answer" },
};

/** The IDs of an export's messages and their parts, in the order written. */
const idsOf = (data: unknown) =>
  (
    data as { messages: Array<{ info: { id: string }; parts: Array<{ id: string }> }> }
  ).messages.flatMap((message) => [message.info.id, ...message.parts.map((part) => part.id)]);

describe("OpenCodeHarness.exportOf", () => {
  it("writes inputs as user messages and responses as assistant messages answering them", () => {
    const exported = OpenCodeHarness.exportOf(
      [input("Hi."), response("r1", { _tag: "Reasoning", text: "Hidden." }, text("Hello."))],
      options,
    )!;

    expect(exported.messages).toEqual([
      { role: "user", text: "Alice: Hi." },
      { role: "assistant", text: "Hello." },
    ]);
    const data = exported.data as {
      info: { id: string; version: string };
      messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>;
    };
    expect(data.info).toMatchObject({ id: exported.sessionId, version: OpenCodeHarness.version });
    const [user, assistant] = data.messages;
    expect(user!.info).toMatchObject({ role: "user", agent: "build", model });
    expect(assistant!.info).toMatchObject({
      role: "assistant",
      parentID: user!.info["id"],
      providerID: "amends",
      modelID: "fake-model",
      path: { cwd: "/work", root: "/work" },
    });
    expect(assistant!.parts.map((part) => part["type"])).toEqual([
      "step-start",
      "text",
      "step-finish",
    ]);
  });

  it("names IDs with opencode's prefixes, sorting in the order written", () => {
    const exported = OpenCodeHarness.exportOf(
      [input("One."), response("r1", text("Two.")), input("Three.")],
      options,
    )!;
    const ids = idsOf(exported.data);

    expect(exported.sessionId).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/u);
    expect(ids.every((id) => /^(?:msg|prt)_[0-9a-f]{12}[0-9A-Za-z]{14}$/u.test(id))).toBe(true);
    const suffixes = ids.map((id) => id.slice(4));
    expect([...suffixes].sort()).toEqual(suffixes);
  });

  it("writes tool calls and their results into the response's text", () => {
    const exported = OpenCodeHarness.exportOf(
      [
        input("Look it up."),
        response("r1", text("Looking."), lookup),
        Transcript.toolResult(lookup, {
          isError: false,
          content: [{ _tag: "Text", text: "It is 42." }],
        }),
      ],
      options,
    )!;

    expect(exported.messages[1]).toEqual({
      role: "assistant",
      text: 'Looking.\n\n[Earlier tool call: lookup {"query":"answer"}]\n[It returned: It is 42.]',
    });
  });

  it("leaves out a response with nothing to read, and refuses a transcript starting with one", () => {
    expect(
      OpenCodeHarness.exportOf(
        [input("Hi."), response("r1", { _tag: "Reasoning", text: "Only thinking." })],
        options,
      )!.messages,
    ).toEqual([{ role: "user", text: "Alice: Hi." }]);
    expect(OpenCodeHarness.exportOf([response("r1", text("First."))], options)).toBeUndefined();
  });
});

describe("OpenCodeHarness.configOf", () => {
  const endpoint = {
    apiKey: Redacted.make("key"),
    model: "the-model",
    limits: { contextTokens: 200_000, outputTokens: 8_000 },
  };

  it("configures Anthropic's provider, or a compatible one at the endpoint's URL", () => {
    expect(
      OpenCodeHarness.configOf(
        { ...endpoint, interface: "anthropic-messages", baseUrl: undefined },
        [],
      ),
    ).toMatchObject({
      model: { providerID: "anthropic", modelID: "the-model" },
      config: {
        enabled_providers: ["anthropic"],
        model: "anthropic/the-model",
        provider: {
          anthropic: {
            options: { apiKey: "key" },
            models: { "the-model": { limit: { context: 200_000, output: 8_000 } } },
          },
        },
      },
    });
    expect(
      OpenCodeHarness.configOf(
        { ...endpoint, interface: "openai-chat-completions", baseUrl: "http://models/v1" },
        ["/session/instructions.md"],
      ),
    ).toMatchObject({
      model: { providerID: "amends", modelID: "the-model" },
      config: {
        instructions: ["/session/instructions.md"],
        provider: {
          amends: {
            npm: "@ai-sdk/openai-compatible",
            options: { apiKey: "key", baseURL: "http://models/v1" },
          },
        },
      },
    });
  });

  it("has no configuration for an interface it doesn't speak, or a compatible one without a URL", () => {
    expect(
      OpenCodeHarness.configOf({ ...endpoint, interface: "other", baseUrl: "http://x" }, []),
    ).toBeUndefined();
    expect(
      OpenCodeHarness.configOf(
        { ...endpoint, interface: "openai-chat-completions", baseUrl: undefined },
        [],
      ),
    ).toBeUndefined();
  });
});
