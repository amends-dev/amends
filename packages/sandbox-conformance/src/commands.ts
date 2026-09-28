import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Harness } from "./harness.ts";
import { acquire, bytes } from "./support.ts";

export const commands = (harness: Harness) =>
  describe.skipIf(!harness.available)(`${harness.name}: commands`, () => {
    it.live(
      "reports the exit code and each stream separately, with a failure as a result",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          const result = yield* sandbox.exec({
            argv: ["sh", "-c", "echo out; echo err >&2; exit 3"],
          });
          expect(result).toEqual({ exitCode: 3, stdout: "out\n", stderr: "err\n" });
        }),
      harness.timeout,
    );

    it.live(
      "passes arguments as given, without a shell reading them",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          const argument = `it's "quoted" $HOME; ls`;
          const result = yield* sandbox.exec({
            argv: ["sh", "-c", 'printf %s "$1"', "sh", argument],
          });
          expect(result.stdout).toBe(argument);
        }),
      harness.timeout,
    );

    it.live(
      "runs in a directory relative to the working directory, with added environment",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          yield* sandbox.writeFile("nested/dir/file.txt", bytes("x"));
          const result = yield* sandbox.exec({
            argv: ["sh", "-c", "pwd; echo $GREETING"],
            cwd: "nested/dir",
            env: { GREETING: "hello" },
          });
          expect(result.stdout).toBe(`${sandbox.workdir}/nested/dir\nhello\n`);
        }),
      harness.timeout,
    );

    it.live(
      "sees the files the sandbox's file operations wrote, and the reverse",
      () =>
        Effect.gen(function* () {
          const provider = yield* harness.provider;
          const { sandbox } = yield* acquire(harness, provider);
          yield* sandbox.writeFile("from-files.txt", bytes("written"));
          expect((yield* sandbox.exec({ argv: ["cat", "from-files.txt"] })).stdout).toBe("written");
          yield* sandbox.exec({ argv: ["sh", "-c", "printf made > from-command.txt"] });
          expect(yield* sandbox.readFile("from-command.txt")).toEqual(bytes("made"));
        }),
      harness.timeout,
    );
  });
