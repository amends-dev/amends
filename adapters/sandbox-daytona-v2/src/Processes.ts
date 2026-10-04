/**
 * A Daytona sandbox runs each process in a session of its own, a shell Daytona keeps for the
 * commands sent to it, and ends the process and its children by deleting the session. When the
 * scope that spawned a process closes, its session is deleted, unless its handle was unreferenced;
 * the process then runs until the sandbox stops.
 *
 * Daytona keeps what a session's command writes and its exit code. Output streams from Daytona as
 * the process writes it, and once the process exits, the rest is read from what Daytona kept; the
 * exit code is polled. Daytona takes a process's input a line at a time and never ends it, so a
 * command that reads its input to the end waits forever.
 */
import type { Sandbox as DaytonaSandbox } from "@daytona/sdk";
import {
  DaytonaAuthenticationError,
  DaytonaForbiddenError,
  DaytonaNotFoundError,
  DaytonaTimeoutError,
} from "@daytona/sdk";
import { Crypto, Data, Effect, PlatformError, Queue, Schedule, Sink, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** What became of a process: running, exited with a code, or ended without one. */
type Status = Data.TaggedEnum<{
  Running: {};
  Exited: { readonly exitCode: number };
  /** Killed, as deleting its session does, or ended with its sandbox. */
  Ended: {};
}>;
const Status = Data.taggedEnum<Status>();

/** Polls a process's status quickly at first, then once a second while it runs long. */
const untilExit = Schedule.min([Schedule.exponential("50 millis"), Schedule.spaced("1 second")]);

/** The process spawner of `sandbox`, whose commands start in `workingDirectory`. */
export const make = Effect.fn("Processes.make")(function* (
  sandbox: DaytonaSandbox,
  workingDirectory: string,
) {
  const crypto = yield* Crypto.Crypto;
  // Daytona gives no process ids, so each process is numbered by the spawner that started it.
  let lastPid = 0;

  const spawn = Effect.fnUntraced(function* (command: ChildProcess.Command) {
    const unsupported = unsupportedOption(command);
    if (unsupported !== undefined) {
      return yield* PlatformError.badArgument({
        module: "ChildProcess",
        method: "spawn",
        description: unsupported,
      });
    }
    const session = `amends-process-${yield* crypto.randomUUIDv4}`;
    let referenced = true;
    yield* Effect.acquireRelease(
      call("spawn", () => sandbox.process.createSession(session)),
      () =>
        referenced
          ? Effect.ignore(call("kill", () => sandbox.process.deleteSession(session)))
          : Effect.void,
    );
    // TODO: Keep environment values out of the command line, which Daytona keeps in its record of
    // the session, once a command's environment carries a secret.
    const { cmdId } = yield* call("spawn", () =>
      sandbox.process.executeSessionCommand(session, {
        // Sessions run the user's shell, zsh on Daytona's own image, whose redirections differ
        // from sh's. The line runs in sh as a child, since Daytona loses the exit code of a
        // command that replaces the session's shell.
        command: `sh -c ${quote(commandLine(command, workingDirectory))}`,
        runAsync: true,
        suppressInputEcho: true,
      }),
    );

    const readStatus = call("status", () => sandbox.process.getSessionCommand(session, cmdId)).pipe(
      Effect.map(({ exitCode }) =>
        exitCode === undefined ? Status.Running() : Status.Exited({ exitCode }),
      ),
      Effect.catch((error) => statusAfterFailure(sandbox, error)),
    );
    const awaitExit = Effect.repeat(readStatus, {
      until: (status) => status._tag !== "Running",
      schedule: untilExit,
    });

    /** What the process writes to `output`, ending once the process has exited. */
    const outputOf = (output: "stdout" | "stderr") =>
      Stream.callback<Uint8Array, PlatformError.PlatformError>((queue) => {
        const encoder = new TextEncoder();
        let delivered = 0;
        let ended = false;
        const deliver = (text: string) => {
          if (ended || text === "") return;
          delivered += text.length;
          Queue.offerUnsafe(queue, encoder.encode(text));
        };
        const ignore = () => {};
        return Effect.gen(function* () {
          // Daytona replays what the process wrote, then follows it, but keeps following after
          // the process exits, until its session is deleted. The stream ends on the exit code
          // instead, with whatever the connection has not yet delivered of what Daytona kept.
          yield* Effect.sync(() => {
            sandbox.process
              .getSessionCommandLogs(
                session,
                cmdId,
                output === "stdout" ? deliver : ignore,
                output === "stderr" ? deliver : ignore,
              )
              .catch(ignore);
          });
          const status = yield* awaitExit;
          if (status._tag === "Exited") {
            const kept = yield* call("logs", () =>
              sandbox.process.getSessionCommandLogs(session, cmdId),
            );
            deliver((kept[output] ?? "").slice(delivered));
          }
          ended = true;
          yield* Queue.end(queue);
        }).pipe(Effect.catch((error) => Queue.fail(queue, error)));
      });

    const input = stdinOf(command);
    const stdin =
      input === "ignore"
        ? Sink.drain
        : sendLines((lines) =>
            call("stdin", () => sandbox.process.sendSessionCommandInput(session, cmdId, lines)),
          );
    if (Stream.isStream(input)) yield* Effect.forkScoped(Stream.run(input, stdin));

    const stdout = outputStreamOf(command, "stdout", () => outputOf("stdout"));
    const stderr = outputStreamOf(command, "stderr", () => outputOf("stderr"));

    const reref = Effect.sync(() => {
      referenced = true;
    });
    return ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(++lastPid),
      exitCode: Effect.flatMap(awaitExit, (status) =>
        status._tag === "Exited"
          ? Effect.succeed(ChildProcessSpawner.ExitCode(status.exitCode))
          : Effect.fail(
              PlatformError.systemError({
                _tag: "Unknown",
                module: "ChildProcess",
                method: "exitCode",
                description: "The process was killed, or ended with its sandbox",
              }),
            ),
      ),
      isRunning: Effect.map(readStatus, (status) => status._tag === "Running"),
      // TODO: Send the kill signal asked for, once a caller asks for one other than SIGTERM.
      // Deleting the session sends SIGTERM to the process and its children, then SIGKILL.
      kill: () =>
        call("kill", () => sandbox.process.deleteSession(session)).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.void,
          ),
        ),
      stdin,
      stdout,
      stderr,
      all: Stream.merge(stdout, stderr),
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.sync(() => {
        referenced = false;
        return reref;
      }),
    });
  });

  return ChildProcessSpawner.make(spawn);
});

/**
 * Sends what is written a line at a time, as Daytona takes input, which ends each send with a
 * newline; a last line without one gets one when the writing ends.
 */
const sendLines = (send: (lines: string) => Effect.Effect<void, PlatformError.PlatformError>) =>
  Sink.suspend(() => {
    const decoder = new TextDecoder();
    let pending = "";
    return Sink.forEach((chunk: Uint8Array) => {
      pending += decoder.decode(chunk, { stream: true });
      const lastNewline = pending.lastIndexOf("\n");
      if (lastNewline === -1) return Effect.void;
      const lines = pending.slice(0, lastNewline);
      pending = pending.slice(lastNewline + 1);
      return send(lines);
    }).pipe(
      Sink.mapEffect(() => {
        pending += decoder.decode();
        return pending === "" ? Effect.void : send(pending);
      }),
    );
  });

/**
 * The status of a process Daytona failed to report on: ended when its session is gone, as killing
 * it deletes the session, or when its sandbox no longer runs, which answers nothing of its
 * processes.
 */
const statusAfterFailure = (sandbox: DaytonaSandbox, error: PlatformError.PlatformError) =>
  error.reason._tag === "NotFound"
    ? Effect.succeed(Status.Ended())
    : Effect.tryPromise(() => sandbox.refreshData()).pipe(
        Effect.map(() => sandbox.state === "started"),
        Effect.orElseSucceed(() => false),
        Effect.flatMap((started) =>
          started ? Effect.fail(error) : Effect.succeed(Status.Ended()),
        ),
      );

/** Why Daytona cannot run `command` as asked, or `undefined` when it can. */
const unsupportedOption = (command: ChildProcess.Command): string | undefined => {
  if (command._tag === "PipedCommand") {
    const { from = "stdout", to = "stdin" } = command.options;
    if (from.startsWith("fd") || to !== "stdin") {
      return "A Daytona sandbox pipes only stdout, stderr, or both into stdin";
    }
    return unsupportedOption(command.left) ?? unsupportedOption(command.right);
  }
  const { additionalFds = {}, stdout, stderr } = command.options;
  if (Object.keys(additionalFds).length > 0) {
    return "A Daytona sandbox gives processes no file descriptors beyond stdin, stdout, and stderr";
  }
  const streams = [stdinOf(command), outputOptionOf(stdout), outputOptionOf(stderr)];
  if (streams.some((stream) => stream === "inherit" || stream === "overlapped")) {
    return "A process in a Daytona sandbox cannot share the host's standard streams";
  }
  return undefined;
};

/**
 * The sh line that runs `command` in `workingDirectory`, or in the directory its `cwd` names,
 * resolved against `workingDirectory`, each command of a pipe in a subshell of its own.
 */
const commandLine = (command: ChildProcess.Command, workingDirectory: string): string => {
  if (command._tag === "PipedCommand") {
    const from = command.options.from ?? "stdout";
    const redirect = from === "stdout" ? "" : from === "all" ? " 2>&1" : " 2>&1 >/dev/null";
    return `${commandLine(command.left, workingDirectory)}${redirect} | ${commandLine(command.right, workingDirectory)}`;
  }
  const { cwd, env, extendEnv, shell, stdout, stderr } = command.options;
  const directory =
    cwd === undefined ? workingDirectory : cwd.startsWith("/") ? cwd : `${workingDirectory}/${cwd}`;
  const program =
    shell === undefined || shell === false
      ? [command.command, ...command.args]
      : [shell === true ? "/bin/sh" : shell, "-c", [command.command, ...command.args].join(" ")];
  const redirects = [
    stdinOf(command) === "ignore" ? " </dev/null" : "",
    outputOptionOf(stdout) === "ignore" ? " >/dev/null" : "",
    outputOptionOf(stderr) === "ignore" ? " 2>/dev/null" : "",
  ].join("");
  const words = [...environmentOf(env, extendEnv), ...program].map(quote).join(" ");
  return `(cd ${quote(directory)} && exec ${words}${redirects})`;
};

/**
 * The `env` words that give a command its environment: the sandbox's own, without any; only `env`,
 * without `extendEnv`; or the sandbox's with `env` over it. An undefined value unsets the variable.
 */
const environmentOf = (
  env: Readonly<Record<string, string | undefined>> | undefined,
  extendEnv: boolean | undefined,
): ReadonlyArray<string> => {
  if (env === undefined) return [];
  const entries = Object.entries(env);
  const set = entries.flatMap(([name, value]) => (value === undefined ? [] : [`${name}=${value}`]));
  const unset = entries.flatMap(([name, value]) => (value === undefined ? ["-u", name] : []));
  return ["env", ...(extendEnv === true ? unset : ["-i"]), ...set];
};

/** The input of the first command `command` runs. */
const stdinOf = (command: ChildProcess.Command): ChildProcess.CommandInput => {
  if (command._tag === "PipedCommand") return stdinOf(command.left);
  const { stdin } = command.options;
  if (stdin === undefined) return "pipe";
  return typeof stdin === "string" || Stream.isStream(stdin) ? stdin : stdin.stream;
};

const outputOptionOf = (
  option: ChildProcess.CommandOutput | ChildProcess.StdoutConfig | undefined,
): ChildProcess.CommandOutput => {
  if (option === undefined) return "pipe";
  return typeof option === "string" || Sink.isSink(option) ? option : (option.stream ?? "pipe");
};

/**
 * The handle's stream of what the last command `command` runs writes to `output`: nothing when it
 * is ignored, and passed through the sink the command gives for it.
 */
const outputStreamOf = (
  command: ChildProcess.Command,
  output: "stdout" | "stderr",
  stream: () => Stream.Stream<Uint8Array, PlatformError.PlatformError>,
): Stream.Stream<Uint8Array, PlatformError.PlatformError> => {
  if (command._tag === "PipedCommand") return outputStreamOf(command.right, output, stream);
  const option = outputOptionOf(command.options[output]);
  if (option === "ignore") return Stream.empty;
  return Sink.isSink(option) ? Stream.transduce(stream(), option) : stream();
};

const quote = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

/** Calls Daytona, failing with the platform error its failure amounts to. */
const call = <A>(method: string, request: () => Promise<A>) =>
  Effect.tryPromise({ try: request, catch: (error) => toPlatformError(method, error) });

const toPlatformError = (method: string, error: unknown) =>
  PlatformError.systemError({
    _tag: systemErrorTagOf(error),
    module: "ChildProcess",
    method,
    description: error instanceof Error ? error.message : String(error),
    cause: error,
  });

const systemErrorTagOf = (error: unknown): PlatformError.SystemErrorTag => {
  if (error instanceof DaytonaNotFoundError) return "NotFound";
  if (error instanceof DaytonaAuthenticationError || error instanceof DaytonaForbiddenError) {
    return "PermissionDenied";
  }
  if (error instanceof DaytonaTimeoutError) return "TimedOut";
  return "Unknown";
};
