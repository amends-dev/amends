import type { StreamPart } from "@amends-dev/harness";
import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";
import { Prompt } from "effect/ai";
import { SessionLog } from "../../src/turn/session-log.ts";
import { ThreadMessage } from "../../src/thread/ThreadMessage.ts";
import { Turn } from "../../src/turn/turn.ts";

const at = DateTime.makeUnsafe("2026-10-06T12:00:00.000Z");
/** A user message with the text `text`. */
const userMessage = (text: string) =>
  Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] });
const usage = { inputTokens: {}, outputTokens: {} };
const turnId = Turn.Id.make("turn-1");

/** A step that only reads the notes. */
const reading: StreamPart.Step = {
  parts: [{ type: "tool-call", id: "call-read", name: "read", params: {}, providerExecuted: true }],
  finish: { type: "finish-step", reason: "tool-calls", usage },
};

/** A step that writes `texts`, around a reasoning. */
const writing = (...texts: ReadonlyArray<string>): StreamPart.Step => ({
  parts: [
    { type: "reasoning", text: "Thinking." },
    ...texts.map((text) => ({ type: "text" as const, text })),
  ],
  finish: { type: "finish-step", reason: "stop", usage },
});

/** A step that starts by compacting the conversation into `summary`, then writes `text`. */
const compacting = (summary: string, text: string): StreamPart.Step => ({
  parts: [
    { type: "compaction", trigger: "auto", summary },
    { type: "text", text },
  ],
  finish: { type: "finish-step", reason: "stop", usage },
});

const step = (id: string, steps: StreamPart.Step, turn = turnId): SessionLog.Entry => ({
  _tag: "Step",
  turnId: turn,
  id,
  step: steps,
});
const prompted = (text = "Ada: What is 2 and 3?", turn = turnId): SessionLog.Entry => ({
  _tag: "Prompted",
  turnId: turn,
  prompt: userMessage(text),
  messages: 1,
});
const interrupted: SessionLog.Entry = {
  _tag: "Interrupted",
  turnId,
  reason: "The run stopped.",
};
/** A run started the turn from its prompt, on an agent that keeps the turn apart from the run. */
const started: SessionLog.Entry = {
  _tag: "Started",
  turnId,
  agent: "opencode",
  agentState: { turn: "turn-1" },
};

const itemsOf = (
  entries: ReadonlyArray<SessionLog.Entry>,
  ended?: ReadonlyArray<ThreadMessage.Id>,
) => {
  const reader = SessionLog.reader(turnId, 0);
  reader.add(entries.map((entry, index) => ({ position: index + 1, recordedAt: at, entry })));
  if (ended !== undefined) reader.end(ended);
  return reader.items();
};

describe("a turn's answer", () => {
  it("is the text of the last step of its latest run that has parts", () => {
    expect(
      SessionLog.answerOf([
        prompted(),
        step("one", reading),
        step("two", writing("The sum ", "is 5.")),
      ]),
    ).toBe("The sum is 5.");
    expect(
      SessionLog.answerOf([prompted(), step("one", writing("Reading.")), step("two", reading)]),
    ).toBe("");
    // A run that starts the turn again answers anew; one that continues it keeps the answer so far.
    expect(
      SessionLog.answerOf([
        prompted(),
        step("one", writing("Before.")),
        interrupted,
        started,
        step("two", reading),
      ]),
    ).toBe("");
    expect(SessionLog.answerOf([prompted(), step("one", writing("Before.")), interrupted])).toBe(
      "Before.",
    );
    expect(SessionLog.answerOf([prompted()])).toBe("");
  });
});

describe("a turn's log items", () => {
  it("show the prompt, each step that wrote text, and runs that stopped short", () => {
    expect(
      itemsOf([
        prompted(),
        started,
        step("one", reading),
        step("two", writing("Half")),
        interrupted,
      ]),
    ).toEqual([
      { _tag: "InputTaken", at, messages: 1 },
      { _tag: "Responded", at, responseId: "two", text: "Half", parts: [1], reply: false },
      { _tag: "Interrupted", at, reason: "The run stopped.", retryable: true },
    ]);
  });

  it("mark the response the turn posted as its reply once it ends", () => {
    const items = itemsOf(
      [prompted(), step("one", writing("Reading.")), step("two", writing("The sum ", "is 5."))],
      [ThreadMessage.Id.make("message-1")],
    );

    expect(items.map((item) => item._tag === "Responded" && item.reply)).toEqual([
      false,
      false,
      true,
    ]);
    expect(itemsOf([prompted(), step("one", writing("Done."))], [])[1]).toMatchObject({
      reply: false,
    });
  });

  it("take the turn's entries past where its log begins, and know how far they read", () => {
    const other = Turn.Id.make("turn-0");
    const reader = SessionLog.reader(turnId, 2);
    const recorded = [prompted("Ada: Earlier.", other), step("a", writing("Old."), other)].map(
      (entry, index) => ({ position: index + 1, recordedAt: at, entry }),
    );
    reader.add([...recorded, { position: 3, recordedAt: at, entry: prompted() }]);
    reader.add([{ position: 3, recordedAt: at, entry: prompted() }]);
    reader.add([{ position: 4, recordedAt: at, entry: step("b", writing("Half")) }]);
    expect(reader.position()).toBe(4);
    expect(reader.items().map(({ _tag }) => _tag)).toEqual(["InputTaken", "Responded"]);
  });

  it("change where an item is new or differs from what a reader was sent", () => {
    const before = itemsOf([prompted(), step("one", writing("Half"))]);
    const now = itemsOf(
      [prompted(), step("one", writing("Half")), step("two", writing("Whole."))],
      [ThreadMessage.Id.make("message-1")],
    );
    expect(SessionLog.changesSince(before, now).map(({ index }) => index)).toEqual([2]);
    expect(SessionLog.changesSince(now, now)).toEqual([]);
  });
});

describe("the conversation a session log records", () => {
  it("is the conversation joined, then each turn's prompt and the steps it took", () => {
    const later = Turn.Id.make("turn-2");
    const history = SessionLog.historyOf([
      { _tag: "Joined", conversation: [userMessage("Ada: Hello.")] },
      prompted(),
      step("one", reading),
      step("two", writing("The sum is 5.")),
      prompted("Ada: And 4 and 5?", later),
      step("three", writing("9."), later),
    ]);

    expect(history.content.map(({ role }) => role)).toEqual([
      "user",
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(history.content[5]).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "Ada: And 4 and 5?" }],
    });
  });

  it("starts from the latest compaction's summary", () => {
    const later = Turn.Id.make("turn-2");
    const history = SessionLog.historyOf([
      prompted(),
      step("one", writing("The sum is 5.")),
      prompted("Ada: And 4 and 5?", later),
      step("two", compacting("Ada asked for 2 and 3, then for 4 and 5.", "9."), later),
    ]);

    expect(history.content).toMatchObject([
      {
        role: "user",
        content: [{ type: "text", text: expect.stringContaining("Ada asked for 2 and 3") }],
      },
      { role: "assistant", content: [{ type: "text", text: "9." }] },
    ]);
  });

  it("drops a compaction with the run that made it, when the turn starts again", () => {
    const history = SessionLog.historyOf([
      prompted(),
      step("one", compacting("Ada asked for 2 and 3.", "Before.")),
      interrupted,
      started,
      step("two", writing("After.")),
    ]);

    expect(history.content).toMatchObject([
      { role: "user", content: [{ type: "text", text: "Ada: What is 2 and 3?" }] },
      { role: "assistant", content: [{ type: "reasoning" }, { type: "text", text: "After." }] },
    ]);
  });

  it("sets aside the steps of a run that stopped short, when the turn starts again", () => {
    const history = SessionLog.historyOf([
      prompted(),
      started,
      step("one", writing("Before.")),
      interrupted,
      started,
      step("two", writing("After.")),
    ]);

    expect(history.content).toMatchObject([
      { role: "user", content: [{ type: "text", text: "Ada: What is 2 and 3?" }] },
      { role: "assistant", content: [{ type: "reasoning" }, { type: "text", text: "After." }] },
    ]);
  });

  it("keeps the steps of a run that stopped short, when the next run continues the turn", () => {
    const history = SessionLog.historyOf([
      prompted(),
      started,
      step("one", writing("Before.")),
      interrupted,
      step("two", writing("After.")),
    ]);

    expect(history.content).toMatchObject([
      { role: "user", content: [{ type: "text", text: "Ada: What is 2 and 3?" }] },
      { role: "assistant", content: [{ type: "reasoning" }, { type: "text", text: "Before." }] },
      { role: "assistant", content: [{ type: "reasoning" }, { type: "text", text: "After." }] },
    ]);
  });
});
