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
  const s1 = Transcript.ResponseId.make("s/1");
  const s2 = Transcript.ResponseId.make("s/2");
  const block = (
    responseId: Transcript.ResponseId,
    part: number,
    block: Transcript.ResponsePart,
  ): HarnessEvent.Event => ({ _tag: "BlockCompleted", responseId, part, block });
  const finished = (responseId: Transcript.ResponseId): HarnessEvent.Event => ({
    _tag: "ResponseFinished",
    responseId,
    finish: "stop",
  });
  const took = (text: string, id = text): HarnessEvent.Event => ({
    _tag: "InputIncorporated",
    batch: { id: HarnessEvent.BatchId.make(id), items: [input(text)] },
  });
  const reasoning: Transcript.ResponsePart = {
    _tag: "Reasoning",
    text: "Hm",
    native: { amends: { anthropic: { signature: "sig" } } },
  };
  const events: ReadonlyArray<HarnessEvent.Event> = [
    took("hi", "b1"),
    { _tag: "ReasoningDelta", responseId: s1, part: 0, delta: "Hm" },
    block(s1, 0, reasoning),
    { _tag: "TextDelta", responseId: s1, part: 1, delta: "Let me" },
    block(s1, 1, { _tag: "Text", text: "Let me look." }),
    block(s1, 2, call("c1")),
    {
      _tag: "ResponseFinished",
      responseId: s1,
      finish: "tool-calls",
      model: { provider: "anthropic", model: "claude" },
      usage: { inputTokens: 12, outputTokens: 7 },
    },
    { _tag: "ToolCallStarted", callId: Transcript.ToolCallId.make("c1") },
    { _tag: "ToolCallCompleted", result: { ...result("c1"), structured: { rows: [1, 2] } } },
    { _tag: "TextDelta", responseId: s2, part: 0, delta: "Cut o" },
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

  it("builds the transcript from history, finished responses' blocks in order, and results", () => {
    const history = [input("earlier"), response("h1", { _tag: "Text", text: "noted" })];
    expect(HarnessEvent.transcript(events, history)).toEqual([
      ...history,
      input("hi"),
      response("s/1", reasoning, { _tag: "Text", text: "Let me look." }, call("c1")),
      { ...result("c1"), structured: { rows: [1, 2] } },
    ]);
  });

  it("orders blocks by their part and puts results reported early after their response", () => {
    expect(
      HarnessEvent.transcript([
        took("hi"),
        block(s1, 1, call("c1")),
        block(s1, 0, { _tag: "Text", text: "Checking." }),
        { _tag: "ToolCallStarted", callId: Transcript.ToolCallId.make("c1") },
        { _tag: "ToolCallCompleted", result: result("c1") },
        finished(s1),
      ]),
    ).toEqual([
      input("hi"),
      response("s/1", { _tag: "Text", text: "Checking." }, call("c1")),
      result("c1"),
    ]);
  });

  it("leaves out an unfinished response that execution replaced or that the work goes on from", () => {
    const cut = [took("hi"), block(s1, 0, { _tag: "Text", text: "Half an ans" })];
    expect(HarnessEvent.transcript(cut)).toEqual([input("hi")]);
    expect(
      HarnessEvent.transcript([
        ...cut,
        block(s2, 0, { _tag: "Text", text: "A whole answer." }),
        finished(s2),
      ]),
    ).toEqual([input("hi"), response("s/2", { _tag: "Text", text: "A whole answer." })]);
    // Leaving it out when preparing means the model never saw it, even once more input follows.
    expect(HarnessEvent.transcript([...cut, took("more")])).toEqual([input("hi"), input("more")]);
  });

  it("keeps what an unfinished last response wrote when the work ended there", () => {
    expect(
      HarnessEvent.transcript(
        [took("hi"), block(s1, 0, reasoning), block(s1, 1, { _tag: "Text", text: "Half" })],
        [],
        { unfinished: "keep" },
      ),
    ).toEqual([input("hi"), response("s/1", reasoning, { _tag: "Text", text: "Half" })]);
  });

  it("drops calls that never started and answers started ones as cut short", () => {
    const events = [
      took("hi"),
      block(s1, 0, call("c1")),
      block(s1, 1, call("c2")),
      block(s1, 2, call("c3")),
      { _tag: "ToolCallStarted", callId: Transcript.ToolCallId.make("c1") },
      { _tag: "ToolCallStarted", callId: Transcript.ToolCallId.make("c2") },
      { _tag: "ToolCallCompleted", result: result("c2") },
    ] satisfies ReadonlyArray<HarnessEvent.Event>;
    const expected = [
      input("hi"),
      response("s/1", call("c1"), call("c2")),
      HarnessEvent.cutShort(call("c1")),
      result("c2"),
    ];
    // A started call may have had an effect, so it stays even when execution goes on.
    expect(HarnessEvent.transcript(events)).toEqual(expected);
    expect(HarnessEvent.transcript([...events, took("more")])).toEqual([
      ...expected,
      input("more"),
    ]);
    expect(Result.isSuccess(Transcript.summarize(HarnessEvent.transcript(events)))).toBe(true);
  });

  it("leaves a finished response's calls without results pending while the work goes on", () => {
    const items = HarnessEvent.transcript([took("hi"), block(s1, 0, call("c1")), finished(s1)]);
    expect(summary(items)).toEqual({ pending: [call("c1")], awaitsResponse: false });
  });

  it("answers calls still pending when the work ended, so later input can follow", () => {
    const events: ReadonlyArray<HarnessEvent.Event> = [
      took("hi"),
      block(s1, 0, call("c1")),
      block(s1, 1, call("c2")),
      finished(s1),
      { _tag: "ToolCallStarted", callId: Transcript.ToolCallId.make("c1") },
    ];
    const items = HarnessEvent.transcript(events, [], { unfinished: "keep" });
    expect(items.slice(-2)).toEqual([
      HarnessEvent.cutShort(call("c1")),
      HarnessEvent.notRun(call("c2")),
    ]);
    expect(summary([...items, input("next")])).toEqual({ pending: [], awaitsResponse: true });
  });
});

describe("Transcript sizes", () => {
  const long = (value: string): Transcript.ToolResult =>
    Transcript.toolResult(call("c1"), { isError: false, content: [{ _tag: "Text", text: value }] });

  it("clips a long text to its beginning and end, saying how much it left out", () => {
    expect(Transcript.clip("short", 10)).toBe("short");
    expect(Transcript.clip("abcdefghij", 4)).toBe("ab\n[… 6 of 10 characters left out …]\nij");
  });

  it("sends a long tool result clipped, and measures it as sent", () => {
    const whole = "x".repeat(Transcript.resultCharacters * 2);
    const sent = Transcript.sentResult(long(whole));
    expect(typeof sent).toBe("string");
    expect((sent as string).length).toBeLessThan(Transcript.resultCharacters + 60);
    expect(sent).toContain(`characters left out`);
    expect(Transcript.characters([long(whole)])).toBe((sent as string).length);
    // A structured result is sent as its value while it fits.
    expect(
      Transcript.sentResult(
        Transcript.toolResult(call("c2"), { isError: false, content: [], structured: { a: 1 } }),
      ),
    ).toEqual({ a: 1 });
  });

  it("estimates tokens from what a provider measured, and characters after it", () => {
    const items = [input("aaaa"), response("r1"), input("x".repeat(40))];
    expect(Transcript.estimate(items)).toBe(11);
    expect(
      Transcript.estimate(items, {
        measured: { responseId: Transcript.ResponseId.make("r1"), tokens: 100 },
      }),
    ).toBe(110);
    expect(Transcript.estimate(items, { instructions: "y".repeat(8) })).toBe(13);
  });
});
