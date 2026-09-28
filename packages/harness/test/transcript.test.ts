import { describe, expect, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import { HarnessEvent, Transcript } from "@amends/harness";

const alice: Transcript.Author = { id: "alice", name: "Alice" };
const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: alice,
  content: [{ _tag: "Text", text }],
});
const call = (id: string, name = "lookup"): Transcript.ToolCall => ({
  _tag: "ToolCall",
  id: Transcript.ToolCallId.make(id),
  name,
  params: { query: id },
});
const response = (id: string, ...parts: ReadonlyArray<Transcript.ResponsePart>) =>
  ({ _tag: "Response", id: Transcript.ResponseId.make(id), parts }) satisfies Transcript.Response;
const result = (callId: string, name = "lookup"): Transcript.ToolResult => ({
  _tag: "ToolResult",
  callId: Transcript.ToolCallId.make(callId),
  name,
  isError: false,
  content: [{ _tag: "Text", text: `answer ${callId}` }],
});

const summary = (items: ReadonlyArray<Transcript.Item>) =>
  Result.getOrThrow(Transcript.summarize(items));
const problem = (items: ReadonlyArray<Transcript.Item>) => {
  const summarized = Transcript.summarize(items);
  return Result.isFailure(summarized) ? summarized.failure : undefined;
};

describe("Transcript.summarize", () => {
  it("says a transcript awaits a response until one answers its input or tool results", () => {
    expect(summary([])).toEqual({ pending: [], awaitsResponse: false });
    expect(summary([input("hi")])).toEqual({ pending: [], awaitsResponse: true });
    expect(summary([input("hi"), response("r1", { _tag: "Text", text: "hello" })])).toEqual({
      pending: [],
      awaitsResponse: false,
    });
    expect(summary([input("hi"), response("r1", call("c1")), result("c1")])).toEqual({
      pending: [],
      awaitsResponse: true,
    });
  });

  it("lists the last response's unanswered calls as pending", () => {
    expect(summary([input("hi"), response("r1", call("c1"), call("c2")), result("c2")])).toEqual({
      pending: [call("c1")],
      awaitsResponse: false,
    });
  });

  it("refuses orders a provider would reject", () => {
    expect(problem([response("r1", call("c1")), input("more")])).toMatch(/interrupts/);
    expect(problem([response("r1", call("c1")), response("r2")])).toMatch(/interrupts/);
    expect(problem([input("hi"), result("c1")])).toMatch(/no pending call/);
    expect(problem([response("r1", call("c1")), result("c1"), result("c1")])).toMatch(
      /no pending call/,
    );
    expect(problem([response("r1", call("c1")), result("c1", "search")])).toMatch(/names search/);
    expect(problem([response("r1", call("c1"), call("c1"))])).toMatch(/appears twice/);
    expect(problem([response("r1", call("c1")), result("c1"), response("r2", call("c1"))])).toMatch(
      /appears twice/,
    );
  });

  it("is the check the transcript schema applies", () => {
    const valid = [input("hi"), response("r1", call("c1")), result("c1")];
    expect(Schema.decodeSync(Transcript.Value)(valid)).toEqual(valid);
    expect(Schema.decodeOption(Transcript.Value)([input("hi"), result("c1")])._tag).toBe("None");
  });
});

describe("HarnessEvent", () => {
  const events: ReadonlyArray<HarnessEvent.Event> = [
    {
      _tag: "InputIncorporated",
      batch: { id: HarnessEvent.BatchId.make("b1"), items: [input("hi")] },
    },
    { _tag: "ReasoningDelta", responseId: Transcript.ResponseId.make("s/1"), part: 0, delta: "Hm" },
    { _tag: "TextDelta", responseId: Transcript.ResponseId.make("s/1"), part: 1, delta: "Let me" },
    {
      _tag: "ResponseCompleted",
      response: response(
        "s/1",
        { _tag: "Reasoning", text: "Hm", native: { amends: { anthropic: { signature: "sig" } } } },
        { _tag: "Text", text: "Let me look." },
        call("c1"),
      ),
      finish: "tool-calls",
      model: { provider: "anthropic", model: "claude" },
      usage: { inputTokens: 12, outputTokens: 7 },
    },
    { _tag: "ToolCallCompleted", result: { ...result("c1"), structured: { rows: [1, 2] } } },
    { _tag: "TextDelta", responseId: Transcript.ResponseId.make("s/2"), part: 0, delta: "Cut o" },
    { _tag: "Idle" },
  ];

  it("round-trips every kind through JSON unchanged", () => {
    const stored: Array<unknown> = JSON.parse(
      JSON.stringify(events.map((event) => Schema.encodeSync(HarnessEvent.Event)(event))),
    );
    expect(stored.map((event) => Schema.decodeUnknownSync(HarnessEvent.Event)(event))).toEqual(
      events,
    );
  });

  it("builds the transcript from history and completed entries only", () => {
    const history = [input("earlier"), response("h1", { _tag: "Text", text: "noted" })];
    expect(HarnessEvent.transcript(events, history)).toEqual([
      ...history,
      input("hi"),
      (events[3] as HarnessEvent.Event & { _tag: "ResponseCompleted" }).response,
      { ...result("c1"), structured: { rows: [1, 2] } },
    ]);
  });
});
