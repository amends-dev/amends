import { expect, layer } from "@effect/vitest";
import { type Cause, Effect, FileSystem, Path, Queue, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { layerServices, type Sandbox } from "../Sandbox.ts";
import { type Fixture, useProvider } from "./Fixture.ts";

/** A command that echoes two lines of its input, then exits without waiting for the input to end. */
const echoTwoLines = ChildProcess.make("sh", [
  "-c",
  'IFS= read -r line; printf "%s\\n" "$line"; IFS= read -r line; printf "%s\\n" "$line"',
]);

/** Running commands in a sandbox, through its process spawner and beside its files. */
export const processes = <R>(fixture: Fixture<R>) => {
  /** Runs `body` with a new sandbox's files, processes, and paths. */
  const inSandbox = <A, E, R2>(body: (sandbox: Sandbox["Service"]) => Effect.Effect<A, E, R2>) =>
    Effect.gen(function* () {
      const provider = yield* useProvider(fixture);
      const sandbox = yield* provider.create();
      return yield* body(sandbox).pipe(Effect.provide(layerServices(sandbox)));
    });

  layer(fixture.layer, { excludeTestServices: true })("sandbox processes", (it) => {
    it.effect(
      "shares files between the sandbox's file system and its processes",
      () =>
        inSandbox((sandbox) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const path = yield* Path.Path;
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            const fromFileSystem = path.join(sandbox.workingDirectory, "from-file-system.txt");
            const fromProcess = path.join(sandbox.workingDirectory, "from-process.txt");

            yield* fs.writeFileString(fromFileSystem, "written by the file system");
            yield* spawner.exitCode(
              ChildProcess.make("sh", [
                "-c",
                'printf "written by a process" > "$1"',
                "sh",
                fromProcess,
              ]),
            );

            expect(yield* spawner.string(ChildProcess.make("cat", [fromFileSystem]))).toBe(
              "written by the file system",
            );
            expect(yield* fs.readFileString(fromProcess)).toBe("written by a process");
          }),
        ),
      fixture.timeout,
    );

    it.effect(
      "starts commands in the working directory",
      () =>
        inSandbox((sandbox) =>
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

            const directory = yield* spawner.string(ChildProcess.make("pwd", ["-P"]));

            expect(directory.trim()).toBe(yield* fs.realPath(sandbox.workingDirectory));
          }),
        ),
      fixture.timeout,
    );

    it.effect(
      "reports a command's exit code and keeps its stderr apart from its stdout",
      () =>
        inSandbox(() =>
          Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            const handle = yield* spawner.spawn(
              ChildProcess.make("sh", ["-c", "echo out; echo err >&2; exit 3"]),
            );

            const [stdout, stderr, exitCode] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(handle.stdout)),
                Stream.mkString(Stream.decodeText(handle.stderr)),
                handle.exitCode,
              ],
              { concurrency: "unbounded" },
            );

            expect({ stdout, stderr, exitCode }).toEqual({
              stdout: "out\n",
              stderr: "err\n",
              exitCode: 3,
            });
          }),
        ),
      fixture.timeout,
    );

    it.effect(
      "gives a command's output byte for byte, with no newline added and bytes that are not text",
      () =>
        inSandbox(() =>
          Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            const handle = yield* spawner.spawn(
              ChildProcess.make("sh", ["-c", "printf 'line\\nno newline\\000\\377'"]),
            );

            const chunks = yield* Stream.runCollect(handle.stdout);

            expect(chunks.flatMap((chunk) => [...chunk])).toEqual([
              ...Array.from("line\nno newline", (character) => character.charCodeAt(0)),
              0,
              255,
            ]);
          }),
        ),
      fixture.timeout,
    );

    it.effect(
      "streams a running process's stdin and stdout one line at a time",
      () =>
        inSandbox(() =>
          Effect.gen(function* () {
            const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
            const handle = yield* spawner.spawn(echoTwoLines);
            const input = yield* Queue.unbounded<string, Cause.Done>();
            yield* Stream.fromQueue(input).pipe(
              Stream.encodeText,
              Stream.run(handle.stdin),
              Effect.forkScoped,
            );
            const output = yield* handle.stdout.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.toQueue({ capacity: "unbounded" }),
            );

            // Each line comes back while the process still runs, before the next is sent. A
            // process's input may never end, as on some providers, so the command exits by itself.
            yield* Queue.offer(input, "first\n");
            expect(yield* Queue.take(output)).toBe("first");
            yield* Queue.offer(input, "second\n");
            expect(yield* Queue.take(output)).toBe("second");

            expect(yield* handle.exitCode).toBe(0);
          }),
        ),
      fixture.timeout,
    );
  });
};
