import { HarnessEvent, Transcript } from "@amends/harness";
import { Support } from "@amends/harness-conformance";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { OpenCodeHarness } from "../src/index.ts";
import { chunk, fakeModel, finish, installed, textReply, workdir } from "./subject.ts";

describe.skipIf(!installed)("opencode", () => {
  it.live(
    "reports the tools it runs as calls with their results, which continue as a transcript",
    () =>
      Effect.gen(function* () {
        const command = JSON.stringify({ command: "echo hi from the tool", description: "Say hi" });
        const model = yield* fakeModel((index) =>
          index === 0
            ? chunk({
                index: 0,
                delta: {
                  role: "assistant",
                  content: "Running it.",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name: "bash", arguments: command },
                    },
                  ],
                },
                finish_reason: null,
              }) + finish("tool_calls")
            : textReply("It printed hi."),
        );
        const harness = OpenCodeHarness.make(yield* workdir);
        const session = yield* harness.start({ sessionId: "s1" }).pipe(Effect.provide(model.layer));
        yield* session.prepare([]);
        yield* session.submit(Support.batch("b1", "Say hi with a command."));
        const events = yield* Support.untilIdle(session);

        expect(Support.kinds(events)).toEqual([
          "InputIncorporated",
          "BlockCompleted",
          "BlockCompleted",
          "ToolCallStarted",
          "ToolCallCompleted",
          "ResponseFinished",
          "BlockCompleted",
          "ResponseFinished",
          "Idle",
        ]);
        const transcript = HarnessEvent.transcript(events);
        expect(Result.isSuccess(Transcript.summarize(transcript))).toBe(true);
        const [, first, result, second] = transcript;
        expect(first).toMatchObject({
          _tag: "Response",
          parts: [
            { _tag: "Text", text: "Running it." },
            { _tag: "ToolCall", id: "call_1", params: { command: "echo hi from the tool" } },
          ],
        });
        expect(result).toMatchObject({ _tag: "ToolResult", callId: "call_1", isError: false });
        expect(JSON.stringify(result)).toContain("hi from the tool");
        expect(second).toMatchObject({ parts: [{ _tag: "Text", text: "It printed hi." }] });
        expect((yield* model.requests)[1]).toContain("hi from the tool");
      }),
    30_000,
  );
});
