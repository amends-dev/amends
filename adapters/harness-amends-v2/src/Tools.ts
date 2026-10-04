/**
 * The tools the amends agent works with in a session's sandbox: reading, writing, and editing files,
 * and running shell commands. Their names and inputs are those AI SDK's harnesses share, so a model
 * meets the same tools whichever agent runs it.
 *
 * File paths resolve against the session's directory and cannot leave it. `bash` runs a shell in
 * that directory, which can reach anything the sandbox can, and kills a command that outruns its
 * timeout. A tool that cannot do what it was asked, such as an `edit` whose text is not in the file,
 * answers the model with why, so the model can try again, instead of failing the turn.
 */
import type { Agent } from "@amends/harness-v2";
import { Sandbox } from "@amends/sandbox-v2";
import { Duration, Effect, FileSystem, Option, Path, Ref, Schema, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// TODO: Add `offset` and `limit`, which read part of a long file, once files outgrow a turn.
export const Read = Tool.make("read", {
  description: "Reads a text file and returns its contents.",
  parameters: Schema.Struct({ file_path: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

export const Write = Tool.make("write", {
  description: "Writes a text file, replacing it if it exists and creating its directories if not.",
  parameters: Schema.Struct({ file_path: Schema.String, content: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

// TODO: Add `replace_all`, which replaces every occurrence, once a model needs to rename things.
export const Edit = Tool.make("edit", {
  description:
    "Replaces `old_string` in a text file with `new_string`. `old_string` must appear exactly once: " +
    "include enough of the text around it to pick out one place.",
  parameters: Schema.Struct({
    file_path: Schema.String,
    old_string: Schema.String,
    new_string: Schema.String,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

export const Bash = Tool.make("bash", {
  description:
    "Runs a shell command in the session's directory and returns its exit code and its output, " +
    "with stdout and stderr interleaved. Long output keeps its start and end. A command that runs " +
    "too long is killed.",
  parameters: Schema.Struct({ command: Schema.String }),
  success: Schema.Struct({ exitCode: Schema.Int, output: Schema.String }),
  failure: Schema.String,
  failureMode: "return",
});

// TODO: Add `grep` and `glob`, which AI SDK's harnesses also share, once `bash` is not enough to
// search with.
export const toolkit = Toolkit.make(Read, Write, Edit, Bash);

/** How long a `bash` command runs before it is killed, unless the layer is given another. */
export const defaultCommandTimeout = Duration.minutes(2);

/** The most characters of a command's output `bash` returns: the start and end, half each. */
export const maxOutputLength = 30_000;

/** How long a killed command has to exit before it is killed by force. */
const killGracePeriod = Duration.seconds(2);

/** The tools' handlers, working in `workspace`. */
export const layer = (
  workspace: Agent.Workspace,
  options: { readonly commandTimeout?: Duration.Duration | undefined } = {},
) =>
  toolkit.toLayer(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const commandTimeout = options.commandTimeout ?? defaultCommandTimeout;

      /** The absolute path `filePath` names, failing when it is outside the session's directory. */
      const resolve = (filePath: string) => {
        const resolved = path.resolve(workspace.directory, filePath);
        const relative = path.relative(workspace.directory, resolved);
        const outside =
          relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
        return outside
          ? Effect.fail(`${filePath} is outside the session's directory, ${workspace.directory}`)
          : Effect.succeed(resolved);
      };

      return toolkit.of({
        read: Effect.fn("Tools.read")(function* ({ file_path }) {
          const resolved = yield* resolve(file_path);
          return yield* fs.readFileString(resolved).pipe(Effect.mapError((error) => error.message));
        }),

        write: Effect.fn("Tools.write")(function* ({ file_path, content }) {
          const resolved = yield* resolve(file_path);
          yield* Effect.andThen(
            fs.makeDirectory(path.dirname(resolved), { recursive: true }),
            fs.writeFileString(resolved, content),
          ).pipe(Effect.mapError((error) => error.message));
          return `Wrote ${file_path}`;
        }),

        edit: Effect.fn("Tools.edit")(function* ({ file_path, old_string, new_string }) {
          const resolved = yield* resolve(file_path);
          const text = yield* fs
            .readFileString(resolved)
            .pipe(Effect.mapError((error) => error.message));
          const occurrences = text.split(old_string).length - 1;
          if (occurrences !== 1) {
            return yield* Effect.fail(
              occurrences === 0
                ? `old_string is not in ${file_path}`
                : `old_string appears ${occurrences} times in ${file_path}: include more of the text around it`,
            );
          }
          yield* fs
            .writeFileString(
              resolved,
              text.replace(old_string, () => new_string),
            )
            .pipe(Effect.mapError((error) => error.message));
          return `Edited ${file_path}`;
        }),

        bash: Effect.fn("Tools.bash")(function* ({ command }) {
          const output = yield* Ref.make(noOutput);
          // Closing the scope kills the command, with any processes it started, if it still runs.
          const exitCode = yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* spawner.spawn(
                ChildProcess.make("sh", ["-c", command], {
                  cwd: workspace.directory,
                  forceKillAfter: killGracePeriod,
                }),
              );
              const [, code] = yield* Effect.all(
                [
                  Stream.runForEach(Stream.decodeText(handle.all), (text) =>
                    Ref.update(output, (kept) => keepOutput(kept, text)),
                  ),
                  handle.exitCode,
                ],
                { concurrency: "unbounded" },
              );
              return code;
            }),
          ).pipe(
            Effect.mapError((error) => error.message),
            Effect.timeoutOption(commandTimeout),
          );
          const text = textOf(yield* Ref.get(output));
          if (Option.isNone(exitCode)) {
            return yield* Effect.fail(
              `The command did not finish within ${Duration.format(commandTimeout)} and was killed. ` +
                `Its output:\n${text}`,
            );
          }
          return { exitCode: exitCode.value, output: text };
        }),
      });
    }).pipe(Effect.provide(Sandbox.layerServices(workspace.sandbox))),
  );

/**
 * The output of a command that `bash` keeps: its start, its end so far, and how many characters
 * between them it dropped.
 */
interface Output {
  readonly start: string;
  readonly end: string;
  readonly dropped: number;
}

const noOutput: Output = { start: "", end: "", dropped: 0 };

/** `kept` followed by `text`, keeping at most half of `maxOutputLength` at each end. */
const keepOutput = (kept: Output, text: string): Output => {
  const half = maxOutputLength / 2;
  const toStart = text.slice(0, Math.max(half - kept.start.length, 0));
  const end = kept.end + text.slice(toStart.length);
  const dropped = Math.max(end.length - half, 0);
  return { start: kept.start + toStart, end: end.slice(dropped), dropped: kept.dropped + dropped };
};

/** The output `bash` returns, saying where it dropped some. */
const textOf = ({ start, end, dropped }: Output) =>
  dropped === 0 ? start + end : `${start}\n[${dropped} characters of output dropped]\n${end}`;
