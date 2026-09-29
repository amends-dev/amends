import { HarnessEvent, Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";
import { TurnLog } from "../../src/turn/log.ts";

const at = DateTime.makeUnsafe("2026-09-29T12:00:00Z");
const recorded = (...entries: ReadonlyArray<TurnLog.Entry>) =>
  entries.map((entry): TurnLog.Recorded => ({ entry, at }));
const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: { id: "alice", name: "Alice" },
  content: [{ _tag: "Text", text }],
});
const harness = (event: HarnessEvent.Event): TurnLog.Entry => ({ _tag: "Harness", event });
const took = (id: string) =>
  harness({
    _tag: "InputIncorporated",
    batch: { id: HarnessEvent.BatchId.make(id), items: [input(id)] },
  });
const text = (value: string): Transcript.ResponsePart => ({ _tag: "Text", text: value });
const call = (id: string): Transcript.ToolCall => ({
  _tag: "ToolCall",
  id: Transcript.ToolCallId.make(id),
  name: "search",
  params: {},
});
/** A response's blocks, each recorded as it completed, then the response as finished. */
const responded = (
  id: string,
  parts: ReadonlyArray<Transcript.ResponsePart>,
  finished = true,
): ReadonlyArray<TurnLog.Entry> => [
  ...parts.map((block, part) =>
    harness({ _tag: "BlockCompleted", responseId: Transcript.ResponseId.make(id), part, block }),
  ),
  ...(finished
    ? [
        harness({
          _tag: "ResponseFinished",
          responseId: Transcript.ResponseId.make(id),
          finish: "stop",
        }),
      ]
    : []),
];
const replies = (...entries: ReadonlyArray<TurnLog.Entry>) =>
  TurnLog.read(recorded(...entries)).replies.map((reply) => reply.text);

describe("TurnLog.read", () => {
  it("counts input as taken in only through batches the harness incorporated", () => {
    const entries: ReadonlyArray<TurnLog.Entry> = [
      { _tag: "Submitted", batchId: HarnessEvent.BatchId.make("b1"), throughSequence: 3 },
      { _tag: "Submitted", batchId: HarnessEvent.BatchId.make("b2"), throughSequence: 5 },
      took("b1"),
    ];
    expect(TurnLog.read(recorded(...entries)).incorporatedThrough(1)).toBe(3);
    expect(TurnLog.read(recorded(...entries, took("b2"))).incorporatedThrough(1)).toBe(5);
    // Nothing submitted and taken in leaves the boundary where it was.
    expect(TurnLog.read([]).incorporatedThrough(4)).toBe(4);
  });

  it("owes the last answer, verbatim, and every answer that more input followed", () => {
    expect(replies(took("b1"), ...responded("r1", [text("  First.\n")]))).toEqual(["  First.\n"]);
    // An answer the agent finished before more input came is still owed, before the next one.
    expect(
      replies(
        took("b1"),
        ...responded("r1", [text("Deploy is Thursday.")]),
        took("b2"),
        ...responded("r2", [text("Budget is fine.")]),
      ),
    ).toEqual(["Deploy is Thursday.", "Budget is fine."]);
    // Input still unanswered at the end leaves nothing owed for it.
    expect(replies(took("b1"), ...responded("r1", [text("First.")]), took("b2"))).toEqual([
      "First.",
    ]);
  });

  it("owes no response that asks for tools, is unfinished, or has no text", () => {
    expect(replies(took("b1"), ...responded("r1", [text("Checking."), call("c1")]))).toEqual([]);
    expect(replies(took("b1"), ...responded("r1", [text("Half an ans")], false))).toEqual([]);
    expect(replies(took("b1"), ...responded("r1", [text("  ")]))).toEqual([]);
    // Text blocks join in order; reasoning is never part of a reply.
    expect(
      replies(
        took("b1"),
        ...responded("r1", [
          { _tag: "Reasoning", text: "Thinking" },
          text("Final "),
          text("answer."),
        ]),
      ),
    ).toEqual(["Final answer."]);
  });

  it("shows readers each response's text as its blocks complete, marking the replies", () => {
    const partial = TurnLog.read(
      recorded(took("b1"), ...responded("r1", [text("Looking"), call("c1"), text(" up.")], false)),
    );
    expect(partial.items).toEqual([
      { _tag: "InputTaken", at, messages: 1 },
      { _tag: "Responded", at, responseId: "r1", text: "Looking up.", parts: [0, 2], reply: false },
    ]);
    const finished = TurnLog.read(
      recorded(took("b1"), ...responded("r1", [text("Done.")]), {
        _tag: "Interrupted",
        reason: "Lost the connection.",
        retryable: true,
      }),
    );
    expect(finished.items.slice(1)).toEqual([
      { _tag: "Responded", at, responseId: "r1", text: "Done.", parts: [0], reply: true },
      { _tag: "Interrupted", at, reason: "Lost the connection.", retryable: true },
    ]);
  });

  it("continues without an unfinished response, and hands on what it wrote", () => {
    const reading = TurnLog.read(
      recorded(took("b1"), ...responded("r1", [text("Half an ans")], false)),
    );
    expect(reading.transcript([])).toEqual([input("b1")]);
    expect(reading.view([])).toEqual([
      input("b1"),
      { _tag: "Response", id: "r1", parts: [text("Half an ans")] },
    ]);
  });
});

describe("TurnLog.fit", () => {
  const exchange = (question: string, answer: string): ReadonlyArray<Transcript.Item> => [
    input(question),
    { _tag: "Response", id: Transcript.ResponseId.make(answer), parts: [text(answer)] },
  ];

  it("keeps the newest exchanges that fit, starting at an input", () => {
    const items = [...exchange("aaaa", "bbbb"), ...exchange("cccc", "dddd")];
    expect(TurnLog.fit(items, 100)).toEqual(items);
    expect(TurnLog.fit(items, 10)).toEqual(items.slice(2));
    // The last exchange stays even when it alone is larger.
    expect(TurnLog.fit(items, 3)).toEqual(items.slice(2));
  });

  it("shortens long text, saying how much was left out", () => {
    expect(TurnLog.shorten("short", 10)).toBe("short");
    expect(TurnLog.shorten("0123456789abc", 10)).toBe(
      "0123456789\n\n[3 more characters were left out.]",
    );
  });
});
