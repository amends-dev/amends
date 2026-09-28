import { SandboxErrors } from "@amends/sandbox";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Harness } from "./harness.ts";
import { acquire, collect } from "./support.ts";

export const processes = (harness: Harness) =>
  describe.skipIf(!harness.available)(`${harness.name}: processes`, () => {
    it.live(
      "streams a background process's output and reports its exit",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          if (!provider.capabilities.stdin) {
            const process = yield* sandbox.spawn({
              argv: ["sh", "-c", "echo started; sleep 1; echo done >&2; exit 4"],
            });
            expect(yield* collect(process)).toEqual({ stdout: "started\n", stderr: "done\n" });
            expect(yield* process.exit).toBe(4);
            expect(yield* process.write("ignored\n").pipe(Effect.flip)).toBeInstanceOf(
              SandboxErrors.Unsupported,
            );
            return;
          }
          const process = yield* sandbox.spawn({
            argv: ["sh", "-c", "echo ready; read line; echo got:$line; echo done >&2; exit 4"],
          });
          yield* process.write("hello\n");
          expect(yield* collect(process)).toEqual({
            stdout: "ready\ngot:hello\n",
            stderr: "done\n",
          });
          expect(yield* process.exit).toBe(4);
        }),
      harness.timeout,
    );

    it.live(
      "ends a process it kills",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          const process = yield* sandbox.spawn({ argv: ["sleep", "600"] });
          yield* process.kill;
          expect(yield* process.exit).not.toBe(0);
        }),
      harness.timeout,
    );

    it.live(
      "runs a process in the given directory with its environment",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          yield* sandbox.exec({ argv: ["mkdir", "-p", "work"] });
          const process = yield* sandbox.spawn({
            argv: ["sh", "-c", "pwd; echo $NAME"],
            cwd: "work",
            env: { NAME: "background" },
          });
          expect((yield* collect(process)).stdout).toBe(`${sandbox.workdir}/work\nbackground\n`);
          expect(yield* process.exit).toBe(0);
        }),
      harness.timeout,
    );
  });
