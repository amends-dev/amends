import { HarnessEvent, Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { Environment } from "@amends/environment";
import { DateTime, Schema } from "effect";
import { ConnectionId } from "../../src/connection/id.ts";
import { EnvironmentId } from "../../src/environment/id.ts";
import { Log } from "../../src/journal/log.ts";
import { TurnId } from "../../src/turn/id.ts";
import { TurnLog } from "../../src/turn/log.ts";

const at = DateTime.makeUnsafe("2026-09-29T12:00:00Z");
const turnId = TurnId.Id.make("t1");
const recorded = (...entries: ReadonlyArray<TurnLog.Entry>) =>
  entries.map((entry, index): TurnLog.Recorded => ({
    entry,
    at,
    position: Log.Position.make(index),
  }));
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
const selection = {
  connectionId: ConnectionId.Id.make("connection"),
  model: "model-x",
  reasoning: null,
  environmentId: EnvironmentId.Id.make("environment"),
};
const submitted = (id: string, throughSequence: number): TurnLog.Entry => ({
  _tag: "Submitted",
  turnId,
  batchId: HarnessEvent.BatchId.make(id),
  throughSequence,
  items: [input(id)],
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
  it("names the session the turn last started, with how many of its events the log has", () => {
    const session = (id: string): TurnLog.Entry => ({ _tag: "Session", turnId, sessionId: id });
    const attempt = (kind: "session" | "summary"): TurnLog.Entry => ({
      _tag: "Attempt",
      turnId,
      kind,
    });
    expect(TurnLog.read(recorded(took("b0"))).session).toBeUndefined();
    const started = [session("s1"), took("b1"), ...responded("r1", [text("Hi.")])];
    expect(TurnLog.read(recorded(...started)).session).toEqual({ sessionId: "s1", recorded: 3 });
    // Another attempt in the same session goes on counting; a new session starts again.
    expect(
      TurnLog.read(recorded(...started, attempt("session"), harness({ _tag: "Idle" }))).session,
    ).toEqual({ sessionId: "s1", recorded: 4 });
    expect(TurnLog.read(recorded(...started, session("s2"))).session).toEqual({
      sessionId: "s2",
      recorded: 0,
    });
    // A summary or a checkpoint ends it.
    expect(TurnLog.read(recorded(...started, attempt("summary"))).session).toBeUndefined();
    expect(
      TurnLog.read(
        recorded(...started, {
          _tag: "Checkpoint",
          turnId,
          summary: "Said hi.",
          kept: [],
          through: null,
        }),
      ).session,
    ).toBeUndefined();
  });

  it("keeps what was asked of the turn pending until a batch holding it is taken in", () => {
    const asked = (text: string): TurnLog.Entry => ({
      _tag: "Requested",
      turnId,
      input: input(text),
    });
    const tookItems = (id: string, ...texts: ReadonlyArray<string>) =>
      harness({
        _tag: "InputIncorporated",
        batch: {
          id: HarnessEvent.BatchId.make(id),
          items: [input(texts[0]!), ...texts.slice(1).map(input)],
        },
      });
    const reading = (...entries: ReadonlyArray<TurnLog.Entry>) =>
      TurnLog.read(recorded(...entries));
    expect(reading(asked("Retry, please.")).requested).toEqual([input("Retry, please.")]);
    expect(reading(asked("Retry, please.")).requestedAt).toBe(0);
    expect(reading(asked("Retry, please."), tookItems("b1", "Retry, please.")).requested).toEqual(
      [],
    );
    // Asked after a batch was taken in, it waits for the next one.
    const later = reading(
      asked("Retry, please."),
      tookItems("b1", "Retry, please."),
      asked("Your files are gone."),
    );
    expect(later.requested).toEqual([input("Your files are gone.")]);
    expect(later.requestedAt).toBe(2);
  });

  it("counts input as taken in only through batches the harness incorporated", () => {
    const entries: ReadonlyArray<TurnLog.Entry> = [
      submitted("b1", 3),
      submitted("b2", 5),
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
        problem: "model-unreachable",
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

describe("TurnLog.buildContext", () => {
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
    const context = TurnLog.buildContext(
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
    const stopped = TurnLog.buildContext(
      recorded(
        tookFor(earlier, "question"),
        block(earlier, "r0", 0, text("Half an ans")),
        tookFor(turnId, "again"),
      ),
      turnId,
    );
    expect(stopped.history).toEqual([input("question"), response("r0", text("Half an ans"))]);
    const pending = TurnLog.buildContext(
      recorded(tookFor(earlier, "question"), block(earlier, "r0", 0, call), finish(earlier, "r0")),
      turnId,
    );
    expect(pending.history.at(-1)).toEqual(HarnessEvent.notRun(call));
  });

  it("starts from the latest checkpoint, which replaces everything before it", () => {
    const context = TurnLog.buildContext(
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
        submitted("b1", 3),
        tookFor(turnId, "b1"),
        block(turnId, "r1", 0, text("First answer.")),
        finish(turnId, "r1"),
        { _tag: "Checkpoint", turnId, summary: "Earlier talk.", kept: [], through: 9 },
      ),
    );
    expect(reading.incorporatedThrough(1)).toBe(9);
    expect(reading.replies.map((reply) => reply.text)).toEqual(["First answer."]);
  });

  const started = (turn: TurnId.Id): TurnLog.Entry => ({
    _tag: "Started",
    turnId: turn,
    selection,
    instructions: "Help the team.",
  });
  const ended = (
    turn: TurnId.Id,
    ending: Pick<TurnLog.Ended, "outcome" | "reason" | "cancelReason">,
  ): TurnLog.Entry => ({ _tag: "Ended", turnId: turn, messageIds: [], ...ending });

  it("tells the agent when an earlier turn it started failed or was stopped", () => {
    const note = (text: string): Transcript.Input => ({
      _tag: "Input",
      author: TurnLog.noteAuthor,
      content: [{ _tag: "Text", text }],
    });
    const after = (ending: Pick<TurnLog.Ended, "outcome" | "reason" | "cancelReason">) =>
      TurnLog.buildContext(
        recorded(
          started(earlier),
          tookFor(earlier, "question"),
          block(earlier, "r0", 0, text("Half an ans")),
          ended(earlier, ending),
          tookFor(turnId, "again"),
        ),
        turnId,
      ).history;
    const left = [input("question"), response("r0", text("Half an ans"))];
    expect(
      after({ outcome: "failed", reason: "Models couldn't be reached.", cancelReason: null }),
    ).toEqual([...left, note("Your work here stopped: Models couldn't be reached.")]);
    expect(after({ outcome: "cancelled", reason: null, cancelReason: "requested" })).toEqual([
      ...left,
      note("Your work here was stopped before it finished, as someone asked."),
    ]);
    // Leaving the thread and finishing need no note.
    expect(
      after({ outcome: "cancelled", reason: null, cancelReason: "participation-ended" }),
    ).toEqual(left);
    expect(after({ outcome: "completed", reason: null, cancelReason: null })).toEqual(left);
  });

  it("begins the log with history, a start, or a checkpoint, not with a turn that never ran", () => {
    const unstarted = recorded(
      { _tag: "Requested", turnId: earlier, input: input("again") },
      ended(earlier, { outcome: "cancelled", reason: null, cancelReason: "requested" }),
    );
    const context = TurnLog.buildContext(unstarted, turnId);
    expect(context).toMatchObject({ begun: false, history: [] });
    expect(TurnLog.buildContext(recorded(started(earlier)), turnId).begun).toBe(true);
  });

  it("knows what a provider last measured, until a checkpoint replaces what it measured", () => {
    const measured = harness(
      {
        _tag: "ResponseFinished",
        responseId: Transcript.ResponseId.make("r0"),
        finish: "stop",
        usage: { inputTokens: 900, outputTokens: 100 },
      },
      earlier,
    );
    expect(
      TurnLog.buildContext(recorded(tookFor(earlier, "q"), measured), turnId).measured,
    ).toEqual({
      responseId: "r0",
      tokens: 1_000,
    });
    const checkpoint: TurnLog.Entry = {
      _tag: "Checkpoint",
      turnId: earlier,
      summary: "Earlier.",
      kept: [],
      through: null,
    };
    expect(
      TurnLog.buildContext(recorded(tookFor(earlier, "q"), measured, checkpoint), turnId).measured,
    ).toBeUndefined();
  });

  it("finds the log empty before a participation's first turn", () => {
    expect(TurnLog.buildContext([], turnId).begun).toBe(false);
    expect(
      TurnLog.buildContext(recorded({ _tag: "Requested", turnId, input: input("again") }), turnId),
    ).toMatchObject({ begun: false, own: { requested: [input("again")] } });
  });
});

describe("TurnLog.read attempts", () => {
  const attempt: TurnLog.Entry = { _tag: "Attempt", turnId, kind: "session" };
  const interrupted: TurnLog.Entry = {
    _tag: "Interrupted",
    turnId,
    reason: "Models are limiting requests.",
    retryable: true,
    problem: "model-rate-limit",
  };

  it("counts attempts since the turn last got further, and whether the last one died", () => {
    // Taking input in comes before the model answers, so it is not getting further.
    const stuck = TurnLog.read(recorded(attempt, took("b1"), interrupted, attempt, took("b1")));
    expect(stuck).toMatchObject({
      attempts: 2,
      interruption: { reason: "Models are limiting requests.", problem: "model-rate-limit" },
      diedLast: true,
    });
    expect(TurnLog.read(recorded(attempt, interrupted))).toMatchObject({
      attempts: 1,
      diedLast: false,
    });
    // A finished response is getting further: earlier attempts no longer count.
    const moved = TurnLog.read(
      recorded(attempt, interrupted, attempt, took("b1"), ...responded("r1", [text("Done.")])),
    );
    expect(moved).toMatchObject({ attempts: 0, interruption: undefined, diedLast: false });
  });

  it("says what the turn started with, how it ended, and where its checkpoint sits", () => {
    const reading = TurnLog.read(
      recorded(
        {
          _tag: "Started",
          turnId,
          selection,
          instructions: "Be brief.",
        },
        { _tag: "Checkpoint", turnId, summary: "Earlier talk.", kept: [], through: null },
        {
          _tag: "Ended",
          turnId,
          outcome: "failed",
          reason: "Stopped.",
          cancelReason: null,
          messageIds: [],
        },
      ),
    );
    expect(reading.started?.instructions).toBe("Be brief.");
    expect(reading.checkpoint).toBe(1);
    expect(reading.ended).toMatchObject({ outcome: "failed", reason: "Stopped." });
  });
});

describe("TurnLog.proposeCompaction", () => {
  // Four characters make about a token, so each of these is one token.
  const answer = (
    id: string,
    ...parts: ReadonlyArray<Transcript.ResponsePart>
  ): Transcript.Item => ({
    _tag: "Response",
    id: Transcript.ResponseId.make(id),
    parts,
  });
  const exchange = (question: string, reply: string): ReadonlyArray<Transcript.Item> => [
    input(question),
    answer(reply, text(reply)),
  ];
  const items = [...exchange("aaaa", "bbbb"), ...exchange("cccc", "dddd")];
  const waiting = (sequence: number, value: string): TurnLog.Waiting => ({
    sequence,
    item: input(value),
  });

  it("summarizes the older part only once the transcript and waiting input outgrow the budget", () => {
    expect(TurnLog.proposeCompaction(items, [], { budget: 10, keep: 2 })).toBeUndefined();
    expect(TurnLog.proposeCompaction(items, [], { budget: 10, keep: 2, fixed: 40 })).toEqual({
      summarize: items.slice(0, 2),
      kept: items.slice(2),
      through: null,
    });
  });

  it("counts what a provider measured, and the instructions when nothing did", () => {
    const measured = { responseId: Transcript.ResponseId.make("dddd"), tokens: 50 };
    expect(TurnLog.proposeCompaction(items, [], { budget: 10, keep: 3, measured })).toBeDefined();
    expect(
      TurnLog.proposeCompaction(items, [], { budget: 10, keep: 3, instructions: "x".repeat(40) }),
    ).toBeDefined();
  });

  it("cuts inside one long turn at a response, keeping its inputs and no reasoning", () => {
    const call = (id: string): Transcript.ToolCall => ({
      _tag: "ToolCall",
      id: Transcript.ToolCallId.make(id),
      name: "search",
      params: {},
    });
    const result = (id: string, value: string): Transcript.ToolResult =>
      Transcript.toolResult(call(id), { isError: false, content: [{ _tag: "Text", text: value }] });
    const reasoning: Transcript.ResponsePart = { _tag: "Reasoning", text: "thinking" };
    const turn: ReadonlyArray<Transcript.Item> = [
      input("find it"),
      answer("r1", reasoning, call("c1")),
      result("c1", "x".repeat(40)),
      answer("r2", reasoning, call("c2")),
      result("c2", "yyyy"),
    ];
    const found = TurnLog.proposeCompaction([...items, ...turn], [], {
      budget: 10,
      keep: 6,
      current: items.length,
    });
    expect(found).toEqual({
      summarize: [...items, ...turn.slice(0, 3)],
      kept: [input("find it"), answer("r2", call("c2")), result("c2", "yyyy")],
      through: null,
    });
  });

  it("summarizes waiting input too when it alone outgrows the budget, keeping the newest", () => {
    const backlog = [waiting(5, "eeee"), waiting(6, "ffff"), waiting(7, "gggg")];
    expect(TurnLog.proposeCompaction(items, backlog, { budget: 5, keep: 2 })).toEqual({
      summarize: [...items, backlog[0]!.item],
      kept: [],
      through: 5,
    });
  });

  it("never cuts between two pieces of one waiting message", () => {
    const pieces = [waiting(5, "eeee"), waiting(6, "ffff"), waiting(6, "gggg")];
    expect(TurnLog.proposeCompaction(items, pieces, { budget: 5, keep: 1 })).toEqual({
      summarize: [...items, pieces[0]!.item],
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
      TurnLog.proposeCompaction([summary, ...exchange("cccc", "dddd")], [], {
        budget: 2,
        keep: 10,
        force: true,
      }),
    ).toBeUndefined();
  });
});

describe("TurnLog.splitIntoPieces", () => {
  it("gives long text in pieces rather than cutting it", () => {
    expect(TurnLog.splitIntoPieces("short", 10)).toEqual(["short"]);
    expect(TurnLog.splitIntoPieces("", 10)).toEqual([""]);
    expect(TurnLog.splitIntoPieces("0123456789abc", 5)).toEqual(["01234", "56789", "abc"]);
  });
});

describe("TurnLog.lostFiles", () => {
  const reference = (sandboxId?: string) =>
    Schema.decodeUnknownSync(Environment.Reference)(
      sandboxId === undefined
        ? { definitionId: "environment" }
        : { definitionId: "environment", sandboxId },
    );
  const fresh = { _tag: "Fresh" } as const;

  it("tells the agent its files are gone only when a new sandbox took another's place", () => {
    expect(
      TurnLog.lostFiles(reference("box-1"), { reference: reference("box-2"), filesystem: fresh }),
    ).toBe(true);
    // The first sandbox, the same one again, or one without a sandbox, lost nothing it had.
    expect(TurnLog.lostFiles(undefined, { reference: reference("box-1"), filesystem: fresh })).toBe(
      false,
    );
    expect(
      TurnLog.lostFiles(reference("box-1"), {
        reference: reference("box-1"),
        filesystem: { _tag: "Retained" },
      }),
    ).toBe(false);
    expect(
      TurnLog.lostFiles(reference(), { reference: reference(), filesystem: { _tag: "None" } }),
    ).toBe(false);
  });
});
