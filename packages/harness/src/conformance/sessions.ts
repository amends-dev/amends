import { describe, expect, it } from "@effect/vitest";
import { HarnessErrors } from "../errors.ts";
import { Effect, Stream } from "effect";
import type { Subject } from "./subject.ts";
import { answers, batch, kinds, start, untilIdle } from "./support.ts";

/** A session's own work: input it is given, the model it calls, and the order of operations. */
export const sessions = <R>(subject: Subject<R>) =>
  describe.skipIf(!subject.available)(`${subject.name}: sessions`, () => {
    it.live(
      "answers input in a new session, saying who wrote it, and is idle after",
      () =>
        Effect.gen(function* () {
          const { session, requests } = yield* start(subject, { replies: ["Hello, Alice."] });
          yield* session.prepare([]);
          yield* session.submit(batch("b1", "Say hello to me."));
          const events = yield* untilIdle(session);

          expect(kinds(events)[0]).toBe("InputIncorporated");
          expect(kinds(events).at(-1)).toBe("Idle");
          expect(kinds(events)).toContain("ResponseFinished");
          expect(answers(events)).toEqual(["Hello, Alice."]);
          const sent = yield* requests;
          expect(sent).toHaveLength(1);
          expect(sent[0]).toContain("Say hello to me.");
          expect(sent[0]).toContain("Alice");
        }),
      subject.timeout,
    );

    it.live(
      "gives the model its instructions",
      () =>
        Effect.gen(function* () {
          const { session, requests } = yield* start(
            subject,
            { replies: ["Arr."] },
            { instructions: "Answer as a pirate would." },
          );
          yield* session.prepare([]);
          yield* session.submit(batch("b1", "Hi."));
          yield* untilIdle(session);

          expect((yield* requests)[0]).toContain("Answer as a pirate would.");
        }),
      subject.timeout,
    );

    it.live(
      "takes in input submitted while it works in order, and is idle only after answering it all",
      () =>
        Effect.gen(function* () {
          const { session, requests } = yield* start(subject, {
            replies: ["One.", "Two."],
          });
          yield* session.prepare([]);
          yield* session.submit(batch("b1", "First question."));
          yield* session.submit(batch("b2", "Second question."));
          const events = yield* untilIdle(session);

          const incorporated = events.flatMap((event) =>
            event._tag === "InputIncorporated" ? [event.batch.id] : [],
          );
          expect(incorporated).toEqual(["b1", "b2"]);
          expect(kinds(events).filter((kind) => kind === "Idle")).toHaveLength(1);
          const last = (yield* requests).at(-1);
          expect(last).toContain("First question.");
          expect(last).toContain("Second question.");
        }),
      subject.timeout,
    );

    it.live(
      "does nothing before it is prepared, and is prepared once",
      () =>
        Effect.gen(function* () {
          const { session } = yield* start(subject, { replies: [] });
          expect(yield* session.submit(batch("b1", "Too early.")).pipe(Effect.flip)).toEqual(
            new HarnessErrors.NotPrepared(),
          );
          expect(yield* session.resume.pipe(Effect.flip)).toEqual(new HarnessErrors.NotPrepared());
          yield* session.prepare([]);
          expect(yield* session.prepare([]).pipe(Effect.flip)).toEqual(
            new HarnessErrors.AlreadyPrepared(),
          );
        }),
      subject.timeout,
    );

    it.live(
      "stops when the model's provider refuses its key, saying so",
      () =>
        Effect.gen(function* () {
          const { session } = yield* start(subject, { replies: [], refuseKey: true });
          yield* session.prepare([]);
          yield* session.submit(batch("b1", "Hello?"));
          const failure = yield* session.events.pipe(Stream.runDrain, Effect.flip);

          expect(failure).toBeInstanceOf(HarnessErrors.ExecutionFailed);
          expect(failure.problem).toBe("model-access");
          expect(failure.retryable).toBe(false);
        }),
      subject.timeout,
    );
  });
