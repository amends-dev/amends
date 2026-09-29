import { HarnessEvent, Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";
import { TurnId } from "../../src/turn/id.ts";
import { TurnLog } from "../../src/turn/log.ts";

const at = DateTime.makeUnsafe("2026-09-29T12:00:00Z");
const turnId = TurnId.Id.make("t1");
const recorded = (...entries: ReadonlyArray<TurnLog.Entry>) =>
  entries.map((entry): TurnLog.Recorded => ({ entry, at }));
const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: { id: "alice", name: "Alice" },
  content: [{ _tag: "Text", text }],
});
const harness = (event: HarnessEvent.Event, turn = turnId): TurnLog.Entry => ({
  _tag: "Harness",
  turnId: turn,
  event,
});
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
      { _tag: "Submitted", turnId, batchId: HarnessEvent.BatchId.make("b1"), throughSequence: 3 },
      { _tag: "Submitted", turnId, batchId: HarnessEvent.BatchId.make("b2"), throughSequence: 5 },
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
        turnId,
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

describe("TurnLog.context", () => {
  const earlier = TurnId.Id.make("t0");
  const reasoning: Transcript.ResponsePart = { _tag: "Reasoning", text: "Thinking it over." };
  const response = (id: string, ...parts: ReadonlyArray<Transcript.ResponsePart>) =>
    ({ _tag: "Response", id: Transcript.ResponseId.make(id), parts }) satisfies Transcript.Response;
  const tookFor = (turn: TurnId.Id, id: string) =>
    harness(
      {
        _tag: "InputIncorporated",
        batch: { id: HarnessEvent.BatchId.make(id), items: [input(id)] },
      },
      turn,
    );
  const block = (turn: TurnId.Id, id: string, part: number, value: Transcript.ResponsePart) =>
    harness(
      { _tag: "BlockCompleted", responseId: Transcript.ResponseId.make(id), part, block: value },
      turn,
    );
  const finish = (turn: TurnId.Id, id: string) =>
    harness(
      { _tag: "ResponseFinished", responseId: Transcript.ResponseId.make(id), finish: "stop" },
      turn,
    );

  it("reads earlier turns as they left the conversation, without their reasoning", () => {
    const context = TurnLog.context(
      recorded(
        { _tag: "History", turnId: earlier, items: [input("before")] },
        tookFor(earlier, "question"),
        block(earlier, "r0", 0, reasoning),
        block(earlier, "r0", 1, text("An answer.")),
        finish(earlier, "r0"),
        tookFor(turnId, "follow-up"),
        block(turnId, "r1", 0, reasoning),
      ),
      turnId,
    );
    expect(context.begun).toBe(true);
    expect(context.history).toEqual([
      input("before"),
      input("question"),
      response("r0", text("An answer.")),
    ]);
    // The turn's own work continues; a response it has not finished is left out.
    expect(context.transcript).toEqual([...context.history, input("follow-up")]);
    expect(context.own.events).toHaveLength(2);
  });

  it("keeps what a stopped turn wrote, answering calls it left", () => {
    const call = {
      _tag: "ToolCall",
      id: Transcript.ToolCallId.make("c1"),
      name: "search",
      params: {},
    } satisfies Transcript.ToolCall;
    const stopped = TurnLog.context(
      recorded(
        tookFor(earlier, "question"),
        block(earlier, "r0", 0, text("Half an ans")),
        tookFor(turnId, "again"),
      ),
      turnId,
    );
    expect(stopped.history).toEqual([input("question"), response("r0", text("Half an ans"))]);
    const pending = TurnLog.context(
      recorded(tookFor(earlier, "question"), block(earlier, "r0", 0, call), finish(earlier, "r0")),
      turnId,
    );
    expect(pending.history.at(-1)).toEqual(HarnessEvent.notRun(call));
  });

  it("starts from the latest checkpoint, which replaces everything before it", () => {
    const context = TurnLog.context(
      recorded(
        tookFor(earlier, "old"),
        {
          _tag: "Checkpoint",
          turnId: earlier,
          summary: "They asked about the deploy.",
          kept: [],
          through: null,
        },
        tookFor(earlier, "newer"),
        {
          _tag: "Checkpoint",
          turnId,
          summary: "Deploy is Thursday.",
          kept: [input("latest")],
          through: null,
        },
        tookFor(turnId, "now"),
      ),
      turnId,
    );
    expect(context.transcript).toEqual([
      {
        _tag: "Input",
        author: TurnLog.checkpointAuthor,
        content: [{ _tag: "Text", text: "Deploy is Thursday." }],
      },
      input("latest"),
      input("now"),
    ]);
  });

  it("counts input a checkpoint's summary took in as taken in, owing the answer before it", () => {
    const reading = TurnLog.read(
      recorded(
        { _tag: "Submitted", turnId, batchId: HarnessEvent.BatchId.make("b1"), throughSequence: 3 },
        tookFor(turnId, "b1"),
        block(turnId, "r1", 0, text("First answer.")),
        finish(turnId, "r1"),
        { _tag: "Checkpoint", turnId, summary: "Earlier talk.", kept: [], through: 9 },
      ),
    );
    expect(reading.incorporatedThrough(1)).toBe(9);
    expect(reading.replies.map((reply) => reply.text)).toEqual(["First answer."]);
  });

  it("finds the log empty before a participation's first turn", () => {
    expect(TurnLog.context([], turnId).begun).toBe(false);
    expect(
      TurnLog.context(recorded({ _tag: "Requested", turnId, input: input("again") }), turnId),
    ).toMatchObject({ begun: false, own: { requested: [input("again")] } });
  });
});

describe("TurnLog.compaction", () => {
  const exchange = (question: string, answer: string): ReadonlyArray<Transcript.Item> => [
    input(question),
    { _tag: "Response", id: Transcript.ResponseId.make(answer), parts: [text(answer)] },
  ];
  const items = [...exchange("aaaa", "bbbb"), ...exchange("cccc", "dddd")];

  const waiting = (sequence: number, value: string): TurnLog.Waiting => ({
    sequence,
    item: input(value),
  });

  it("summarizes the older part only once the transcript and waiting input outgrow the budget", () => {
    expect(TurnLog.compaction(items, [], { budget: 100, keep: 10 })).toBeUndefined();
    expect(TurnLog.compaction(items, [], { budget: 100, keep: 10, fixed: 90 })).toEqual({
      summarize: items.slice(0, 2),
      kept: items.slice(2),
      through: null,
    });
  });

  it("summarizes waiting input too when it alone outgrows the budget, keeping the newest", () => {
    const backlog = [waiting(5, "eeee"), waiting(6, "ffff"), waiting(7, "gggg")];
    expect(TurnLog.compaction(items, backlog, { budget: 20, keep: 8 })).toEqual({
      summarize: [...items, backlog[0]!.item],
      kept: [],
      through: 5,
    });
  });

  it("proposes nothing when only an earlier summary would be summarized again", () => {
    const summary: Transcript.Input = {
      _tag: "Input",
      author: TurnLog.checkpointAuthor,
      content: [{ _tag: "Text", text: "Earlier: aaaa" }],
    };
    expect(
      TurnLog.compaction([summary, ...exchange("cccc", "dddd")], [], {
        budget: 20,
        keep: 10,
        fixed: 90,
      }),
    ).toBeUndefined();
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

  it("gives long text in pieces rather than cutting it", () => {
    expect(TurnLog.pieces("short", 10)).toEqual(["short"]);
    expect(TurnLog.pieces("", 10)).toEqual([""]);
    expect(TurnLog.pieces("0123456789abc", 5)).toEqual(["01234", "56789", "abc"]);
  });
});
