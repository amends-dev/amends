import type { StreamPart } from "@amends/harness-v2";
import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";
import { TurnLog } from "../../src/turn/log.ts";
import { ThreadMessage } from "../../src/thread/message/message.ts";

const at = DateTime.makeUnsafe("2026-10-06T12:00:00.000Z");
const usage = { inputTokens: {}, outputTokens: {} };

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

const step = (id: string, steps: StreamPart.Step): TurnLog.Entry => ({
  _tag: "Step",
  id,
  step: steps,
});
const prompted: TurnLog.Entry = { _tag: "Prompted", messages: 2 };
const interrupted: TurnLog.Entry = { _tag: "Interrupted", reason: "The run stopped." };
const completed = (messageIds: ReadonlyArray<string>): TurnLog.Entry => ({
  _tag: "Ended",
  outcome: "completed",
  reason: null,
  cancelReason: null,
  messageIds: messageIds.map((id) => ThreadMessage.Id.make(id)),
});

const itemsOf = (entries: ReadonlyArray<TurnLog.Entry>) => {
  const reader = TurnLog.reader();
  for (const entry of entries) reader.add({ entry, at });
  return reader.items();
};

describe("a turn's answer", () => {
  it("is the text of the last step of its latest run that has parts", () => {
    expect(
      TurnLog.answerOf([prompted, step("one", reading), step("two", writing("The sum ", "is 5."))]),
    ).toBe("The sum is 5.");
    expect(
      TurnLog.answerOf([prompted, step("one", writing("Reading.")), step("two", reading)]),
    ).toBe("");
    expect(
      TurnLog.answerOf([
        prompted,
        step("one", writing("Before.")),
        interrupted,
        step("two", reading),
      ]),
    ).toBe("");
    expect(TurnLog.answerOf([prompted])).toBe("");
  });
});

describe("a turn's log items", () => {
  it("show the prompt, each step that wrote text, and runs that stopped short", () => {
    expect(
      itemsOf([prompted, step("one", reading), step("two", writing("Half")), interrupted]),
    ).toEqual([
      { _tag: "InputTaken", at, messages: 2 },
      { _tag: "Responded", at, responseId: "two", text: "Half", parts: [1], reply: false },
      { _tag: "Interrupted", at, reason: "The run stopped.", retryable: true },
    ]);
  });

  it("mark the response the turn posted as its reply once it ends", () => {
    const items = itemsOf([
      prompted,
      step("one", writing("Reading.")),
      step("two", writing("The sum ", "is 5.")),
      completed(["message-1"]),
    ]);

    expect(items.map((item) => item._tag === "Responded" && item.reply)).toEqual([
      false,
      false,
      true,
    ]);
    expect(itemsOf([prompted, step("one", writing("Done.")), completed([])])[1]).toMatchObject({
      reply: false,
    });
  });
});
