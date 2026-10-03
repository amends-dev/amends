/**
 * The tools the amends agent works with in a session's sandbox: reading, writing, and editing files,
 * and running shell commands. Their names and inputs are those AI SDK's harnesses share, so a model
 * meets the same tools whichever agent runs it.
 *
 * File paths resolve against the session's directory and cannot leave it. `bash` runs a shell in
 * that directory, which can reach anything the sandbox can. A tool that cannot do what it was asked,
 * such as an `edit` whose text is not in the file, answers the model with why, so the model can try
 * again, instead of failing the turn.
 */
import type { Agent } from "@amends/harness-v2";
import { Sandbox } from "@amends/sandbox-v2";
import { Effect, FileSystem, Path, Schema, Stream } from "effect";
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

// TODO: Add a timeout and a limit on the output kept, once commands outrun or flood a turn.
export const Bash = Tool.make("bash", {
  description:
    "Runs a shell command in the session's directory and returns its exit code and its output, " +
    "with stdout and stderr interleaved.",
  parameters: Schema.Struct({ command: Schema.String }),
  success: Schema.Struct({ exitCode: Schema.Int, output: Schema.String }),
  failure: Schema.String,
  failureMode: "return",
});

// TODO: Add `grep` and `glob`, which AI SDK's harnesses also share, once `bash` is not enough to
// search with.
export const toolkit = Toolkit.make(Read, Write, Edit, Bash);

/** The tools' handlers, working in `workspace`. */
export const layer = (workspace: Agent.Workspace) =>
  toolkit.toLayer(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

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

        bash: Effect.fn("Tools.bash")(
          function* ({ command }) {
            const handle = yield* spawner.spawn(
              ChildProcess.make("sh", ["-c", command], { cwd: workspace.directory }),
            );
            const [output, exitCode] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.all)), handle.exitCode],
              { concurrency: "unbounded" },
            );
            return { exitCode, output };
          },
          Effect.scoped,
          Effect.mapError((error) => error.message),
        ),
      });
    }).pipe(Effect.provide(Sandbox.layerServices(workspace.sandbox))),
  );
