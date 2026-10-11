import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect";
import { Draining, Streams } from "../src/index.ts";

class Unavailable {
  readonly _tag = "Unavailable";
}

/** Streams as a host that can drain serves them, with the drain it would complete. */
const served = Effect.gen(function* () {
  const streams = yield* Streams.Streams;
  const draining = yield* Draining.Draining;
  return { streams, draining };
}).pipe(Effect.provide(Streams.layer.pipe(Layer.provideMerge(Draining.layer))));

describe("Streams.serve", () => {
  it.effect("ends a stream that ends on its own, as a finished turn's log does", () =>
    Effect.gen(function* () {
      const { streams } = yield* served;
      const exit = yield* Effect.exit(
        Stream.runCollect(streams.serve(Stream.make("Opened", "Ended"), () => new Unavailable())),
      );
      expect(exit).toEqual(Exit.succeed(["Opened", "Ended"]));
    }),
  );

  it.effect("fails a stream the shutdown cuts short, so its client reconnects", () =>
    Effect.gen(function* () {
      const { streams, draining } = yield* served;
      const following = streams.serve(
        Stream.concat(Stream.make("Opened"), Stream.never),
        () => new Unavailable(),
      );
      const fiber = yield* Effect.forkChild(Effect.exit(Stream.runCollect(following)));
      yield* Effect.yieldNow;
      yield* Deferred.succeed(draining, undefined);
      const exit = yield* Fiber.join(fiber);
      expect(exit).toEqual(Exit.fail(new Unavailable()));
    }),
  );
});
