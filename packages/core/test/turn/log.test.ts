import { HarnessEvent, type Transcript } from "@amends/harness";
import { expect, it } from "@effect/vitest";
import { TurnLog } from "../../src/turn/log.ts";

const batch = (id: string): HarnessEvent.InputBatch => ({
  id: HarnessEvent.BatchId.make(id),
  items: [
    {
      _tag: "Input",
      author: { id: "alice", name: "Alice" },
      content: [{ _tag: "Text", text: id }],
    },
  ],
});
const response = (id: string, parts: ReadonlyArray<Transcript.ResponsePart>): TurnLog.Entry => ({
  _tag: "Harness",
  event: {
    _tag: "ResponseCompleted",
    response: { _tag: "Response", id: id as Transcript.ResponseId, parts: [...parts] },
    finish: "stop",
  },
});
const incorporated = (id: string): TurnLog.Entry => ({
  _tag: "Harness",
  event: { _tag: "InputIncorporated", batch: batch(id) },
});

it("counts input as taken in only through batches the harness incorporated", () => {
  const entries: ReadonlyArray<TurnLog.Entry> = [
    { _tag: "Submitted", batchId: HarnessEvent.BatchId.make("b1"), throughSequence: 3 },
    { _tag: "Submitted", batchId: HarnessEvent.BatchId.make("b2"), throughSequence: 5 },
    incorporated("b1"),
  ];
  expect(TurnLog.incorporatedThrough(entries, 1)).toBe(3);
  expect(TurnLog.incorporatedThrough([...entries, incorporated("b2")], 1)).toBe(5);
  // Nothing submitted and taken in leaves the boundary where it was.
  expect(TurnLog.incorporatedThrough([], 4)).toBe(4);
});

it("replies with the last response after the last input, verbatim, never one asking for tools", () => {
  const text = (value: string): Transcript.ResponsePart => ({ _tag: "Text", text: value });
  expect(TurnLog.finalResponse([incorporated("b1"), response("r1", [text("  First.\n")])])).toBe(
    "  First.\n",
  );
  // A later input needs its own response.
  expect(
    TurnLog.finalResponse([
      incorporated("b1"),
      response("r1", [text("First.")]),
      incorporated("b2"),
    ]),
  ).toBeUndefined();
  // The last response wins, and one asking for a tool call is not a reply.
  expect(
    TurnLog.finalResponse([
      incorporated("b1"),
      response("r1", [
        text("Checking."),
        { _tag: "ToolCall", id: "c1" as Transcript.ToolCallId, name: "search", params: {} },
      ]),
    ]),
  ).toBeUndefined();
  expect(
    TurnLog.finalResponse([
      incorporated("b1"),
      response("r1", [text("Draft.")]),
      response("r2", [{ _tag: "Reasoning", text: "Thinking" }, text("Final "), text("answer.")]),
    ]),
  ).toBe("Final answer.");
  // A response with no text is no reply.
  expect(TurnLog.finalResponse([incorporated("b1"), response("r1", [text("  ")])])).toBeUndefined();
});
