import { describe, expect, it } from "@effect/vitest";
import { HarnessErrors } from "../errors.ts";
import { Transcript } from "../transcript.ts";
import { Effect, Result } from "effect";
import type { Subject } from "./subject.ts";
import { answers, batch, input, kinds, response, start, text, untilIdle } from "./support.ts";

const lookup: Transcript.ToolCall = {
  _tag: "ToolCall",
  id: Transcript.ToolCallId.make("c1"),
  name: "lookup",
  params: { query: "the answer" },
};

/**
 * Continuing a conversation from a transcript another session recorded, which may be another
 * harness's: the session reads it as its own context, and goes on from where it ends.
 */
export const continuation = <R>(subject: Subject<R>) =>
  describe.skipIf(!subject.available)(`${subject.name}: continuation`, () => {
    it.live(
      "answers the input a transcript ends with, knowing the conversation before it",
      () =>
        Effect.gen(function* () {
          const { session, requests } = yield* start(subject, { replies: ["Your name is Ada."] });
          yield* session.prepare([
            input("My name is Ada."),
            response("earlier/r1", text("Nice to meet you, Ada.")),
            input("What is my name?"),
          ]);
          yield* session.resume;
          const events = yield* untilIdle(session);

          expect(kinds(events)).not.toContain("InputIncorporated");
          expect(kinds(events).at(-1)).toBe("Idle");
          expect(answers(events)).toEqual(["Your name is Ada."]);
          const sent = yield* requests;
          expect(sent).toHaveLength(1);
          for (const said of ["My name is Ada.", "Nice to meet you, Ada.", "What is my name?"])
            expect(sent[0]).toContain(said);
        }),
      subject.timeout,
    );

    it.live(
      "shows the model the tool calls and results the transcript holds",
      () =>
        Effect.gen(function* () {
          const { session, requests } = yield* start(subject, { replies: ["It was 42."] });
          yield* session.prepare([
            input("Look up the answer."),
            response("earlier/r1", text("Looking it up."), lookup),
            Transcript.toolResult(lookup, {
              isError: false,
              content: [{ _tag: "Text", text: "The answer is 42." }],
            }),
            response("earlier/r2", text("Found it.")),
            input("What was the answer?"),
          ]);
          yield* session.resume;
          const events = yield* untilIdle(session);

          expect(answers(events)).toEqual(["It was 42."]);
          const sent = (yield* requests)[0];
          expect(sent).toContain("The answer is 42.");
          expect(sent).toContain("What was the answer?");
        }),
      subject.timeout,
    );

    it.live(
      "is idle when resumed with nothing owed, then answers new input in context",
      () =>
        Effect.gen(function* () {
          const { session, requests } = yield* start(subject, { replies: ["Blue."] });
          yield* session.prepare([
            input("My favourite colour is blue."),
            response("earlier/r1", text("Noted.")),
          ]);
          yield* session.resume;
          expect(kinds(yield* untilIdle(session))).toEqual(["Idle"]);
          expect(yield* requests).toEqual([]);

          yield* session.submit(batch("b1", "What is my favourite colour?"));
          const events = yield* untilIdle(session);
          expect(answers(events)).toEqual(["Blue."]);
          const sent = (yield* requests)[0];
          expect(sent).toContain("My favourite colour is blue.");
          expect(sent).toContain("What is my favourite colour?");
        }),
      subject.timeout,
    );

    it.live(
      "refuses a transcript in an order no provider accepts",
      () =>
        Effect.gen(function* () {
          const { session } = yield* start(subject, { replies: [] });
          const failure = yield* session
            .prepare([input("Hi."), Transcript.toolResult(lookup, { isError: false, content: [] })])
            .pipe(Effect.flip);
          expect(failure).toBeInstanceOf(HarnessErrors.InvalidTranscript);
        }),
      subject.timeout,
    );

    it.live(
      "takes a transcript whose last calls await results only when it says it can",
      () =>
        Effect.gen(function* () {
          const { harness, session } = yield* start(subject, { replies: [] });
          const prepared = yield* session
            .prepare([input("Look up the answer."), response("earlier/r1", lookup)])
            .pipe(Effect.result);
          if (harness.capabilities.pendingToolCalls) expect(Result.isSuccess(prepared)).toBe(true);
          else
            expect(Result.isFailure(prepared) && prepared.failure._tag).toBe("Harness.Unsupported");
        }),
      subject.timeout,
    );
  });
