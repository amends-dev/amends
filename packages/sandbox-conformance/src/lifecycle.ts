import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Harness } from "./harness.ts";
import { acquire, bytes, text } from "./support.ts";

export const lifecycle = (harness: Harness) =>
  describe.skipIf(!harness.available)(`${harness.name}: lifecycle`, () => {
    it.live(
      "acquires a fresh sandbox with an absolute working directory",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox, filesystem } = yield* acquire(harness, provider);
          expect(filesystem).toBe("fresh");
          expect(sandbox.workdir.startsWith("/")).toBe(true);
          expect((yield* sandbox.exec({ argv: ["pwd"] })).stdout.trim()).toBe(sandbox.workdir);
        }),
      harness.timeout,
    );

    it.live(
      "acquires a stopped sandbox again with its files",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const first = yield* acquire(harness, provider);
          yield* first.sandbox.writeFile("kept.txt", bytes("still here"));
          yield* first.sandbox.stop;

          const again = yield* acquire(harness, provider, { id: first.sandbox.id });
          expect(again.filesystem).toBe("retained");
          expect(again.sandbox.id).toBe(first.sandbox.id);
          expect(text(yield* again.sandbox.readFile("kept.txt"))).toBe("still here");
        }),
      harness.timeout,
    );

    it.live(
      "provides a fresh sandbox, and says so, when the one asked for is gone",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const gone = yield* acquire(harness, provider);
          yield* gone.sandbox.destroy;
          const missing = gone.sandbox.id;

          const acquired = yield* acquire(harness, provider, { id: missing });
          expect(acquired.filesystem).toBe("fresh");
          expect(acquired.sandbox.id).not.toBe(missing);
        }),
      harness.timeout,
    );

    it.live(
      "gives every command the sandbox's environment",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider, {
            env: { AMENDS_SANDBOX_TEST: "set" },
          });
          const result = yield* sandbox.exec({ argv: ["sh", "-c", "echo $AMENDS_SANDBOX_TEST"] });
          expect(result.stdout.trim()).toBe("set");
        }),
      harness.timeout,
    );
  });
