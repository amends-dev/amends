/**
 * A harness over an agent that speaks the Agent Client Protocol, such as opencode. For each session
 * it runs the agent in the working directory, sets up the conversation, as a new session of the
 * agent's own or by writing it as one and loading it, hands input over as prompts, and turns what
 * the agent reports into harness events. The agent runs its own tools, and is granted every
 * permission it asks for: the sandbox is the boundary.
 */
import { ModelInference } from "@amends/connection/model-inference";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import type { Harness, HarnessImplementation } from "@amends/harness";
import { Cause, Effect, FileSystem, Queue, Result, Schema, Scope, Stream } from "effect";
import type { Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { AcpConnection } from "./connection.ts";
import { AcpProtocol } from "./protocol.ts";
import { AcpTranslation } from "./translate.ts";

/** One session's run of the agent: how to start it, and how to write a conversation for it to load. */
export interface Run {
  /** The command that starts the agent speaking ACP on its standard input and output. */
  readonly argv: readonly [string, ...Array<string>];
  /** Variables the agent gets, beside the harness's own. */
  readonly env: Readonly<Record<string, string>>;
  /** Writes a conversation as a session of the agent's own, for `session/load` to load. */
  readonly writeSession: (
    items: ReadonlyArray<Transcript.Item>,
  ) => Effect.Effect<Written, HarnessErrors.Unsupported | HarnessErrors.ExecutionFailed>;
}

/** A conversation written as a session of the agent's own, and its messages as the agent replays them. */
export interface Written {
  readonly sessionId: string;
  readonly messages: ReadonlyArray<Message>;
}

/** A message's text, as written or as the agent replays it. */
export interface Message {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** What a session needs to run its agent: the processes and files of the machine it runs on. */
export type Services = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path;

/** What one agent needs beyond the protocol. */
export interface Agent {
  readonly declaration: HarnessImplementation.Declaration;
  /** The agent's release this harness configures and writes sessions for, as the agent reports it. */
  readonly version: string;
  /**
   * How to run the agent for a session, with the model endpoint and the agent's instructions. It
   * fails when the agent is not installed as the harness needs, or cannot use the model.
   */
  readonly prepareRun: (options: {
    readonly workdir: string;
    /** The session's own directory, for the agent's state and files; removed when it ends. */
    readonly directory: string;
    readonly endpoint: ModelInference.Endpoint["Service"];
    readonly instructions: string | undefined;
  }) => Effect.Effect<Run, HarnessErrors.ExecutionFailed, Services>;
}

/** Input to hand the agent as one prompt: batches it takes in now, or input taken in before. */
type Work =
  | { readonly _tag: "Batch"; readonly batch: HarnessEvent.InputBatch }
  | { readonly _tag: "Earlier"; readonly items: ReadonlyArray<Transcript.Input> };

/** An input as the agent reads it: its author's name, then what they said. */
export const promptOf = (input: Transcript.Input) =>
  input.content.map((content, index) => ({
    type: "text",
    text: index === 0 ? `${input.author.name}: ${content.text}` : content.text,
  }));

/**
 * The transcript before the input that ends it, which no response answers yet, and that input:
 * the agent loads the first, and is asked the second when the session resumes.
 */
export const splitTrailingInput = (items: ReadonlyArray<Transcript.Item>) => {
  let index = items.length;
  while (index > 0 && Transcript.Item.isAnyOf(["Input"])(items[index - 1]!)) index -= 1;
  return {
    history: items.slice(0, index),
    trailing: items.slice(index) as ReadonlyArray<Transcript.Input>,
  };
};

/** The messages an agent replayed while loading a session: each message's pieces, joined. */
export const replayedMessages = (updates: ReadonlyArray<AcpProtocol.Update>) => {
  const messages: Array<Message & { readonly messageId: string | undefined }> = [];
  for (const update of updates) {
    if (
      update.sessionUpdate !== "user_message_chunk" &&
      update.sessionUpdate !== "agent_message_chunk"
    )
      continue;
    const role = update.sessionUpdate === "user_message_chunk" ? "user" : "assistant";
    const messageId = update.messageId ?? undefined;
    const last = messages.at(-1);
    const text = update.content.text ?? "";
    if (last !== undefined && last.role === role && last.messageId === messageId)
      messages[messages.length - 1] = { ...last, text: last.text + text };
    else messages.push({ role, text, messageId });
  }
  return messages.map(({ role, text }): Message => ({ role, text: text.trim() }));
};

/** Whether the agent replayed the messages as they were written. */
export const replayedAsWritten = (
  written: ReadonlyArray<Message>,
  replayed: ReadonlyArray<Message>,
) =>
  written.length === replayed.length &&
  written.every(
    (message, index) =>
      message.role === replayed[index]!.role && message.text.trim() === replayed[index]!.text,
  );

/** The problem an agent's refusal of a prompt names, from its code and words. */
export const problemOf = (failure: AcpConnection.RequestFailed): HarnessErrors.Problem => {
  const text = failure.message;
  if (failure.code === -32000 || /\b401\b|unauthori[sz]ed|api[ _-]?key|authenticat/iu.test(text))
    return "model-access";
  if (/\b402\b|quota|insufficient (?:credits|funds|balance)|billing/iu.test(text))
    return "model-quota";
  if (/\b429\b|rate.?limit|too many requests/iu.test(text)) return "model-rate-limit";
  if (HarnessErrors.contextOverflow.test(text)) return "model-context";
  if (/\b5\d\d\b|internal server error|overloaded|unavailable/iu.test(text))
    return "model-provider";
  if (/econnrefused|enotfound|fetch failed|network|timed? ?out/iu.test(text))
    return "model-unreachable";
  return "model-request";
};

/** The problems trying the same work again can get past, as for Effect AI's failures. */
const retryable = new Set<HarnessErrors.Problem>([
  "model-rate-limit",
  "model-provider",
  "model-unreachable",
  "ended",
]);

/** A session failure from the agent's refusal or its end, with what it last wrote for the logs. */
export const failureOf = (
  error: AcpConnection.RequestFailed | AcpConnection.Closed,
  errorOutput: string,
): HarnessErrors.ExecutionFailed => {
  const problem = error._tag === "AcpConnection.Closed" ? "ended" : problemOf(error);
  const detail = errorOutput.trim() === "" ? "" : `\n${errorOutput.trim()}`;
  return new HarnessErrors.ExecutionFailed({
    reason: `${error.message}${detail}`,
    retryable: retryable.has(problem),
    problem,
  });
};

const decodeUnknown = <S extends Schema.Top>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(schema);
  return (value: unknown) =>
    decode(value).pipe(
      Effect.mapError(
        (error) =>
          new HarnessErrors.ExecutionFailed({
            reason: `The agent sent something this harness can't read: ${error.message}`,
            retryable: false,
            problem: "unexpected",
          }),
      ),
    );
};
const decodeInitialize = decodeUnknown(AcpProtocol.InitializeResponse);
const decodeNewSession = decodeUnknown(AcpProtocol.NewSessionResponse);
const decodePrompt = decodeUnknown(AcpProtocol.PromptResponse);
const decodeNotification = Schema.decodeUnknownOption(AcpProtocol.SessionNotification);
const decodePermission = Schema.decodeUnknownOption(AcpProtocol.PermissionRequest);

/** The most of the agent's error output kept, for the reason a session failed. */
const errorOutputLimit = 4_000;

/**
 * A harness over `agent`, running its sessions as processes in `workdir`.
 *
 * @category constructors
 */
export const make = (
  agent: Agent,
  workdir: string,
): Harness.Interface<ModelInference.Endpoint | Services> => {
  const start = Effect.fnUntraced(function* (options: Harness.StartOptions) {
    const endpoint = yield* ModelInference.Endpoint;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fs = yield* FileSystem.FileSystem;
    const context = yield* Effect.context<Services>();
    const scope = yield* Effect.scope;
    const events = yield* Queue.unbounded<
      HarnessEvent.Event,
      HarnessErrors.ExecutionFailed | Cause.Done
    >();
    yield* Scope.addFinalizer(scope, Queue.end(events));
    const work = yield* Queue.unbounded<Work>();
    const translation = AcpTranslation.make({
      sessionId: options.sessionId,
      model: { model: endpoint.model },
    });
    let phase: "new" | "preparing" | "prepared" = "new";
    let failure: HarnessErrors.ExecutionFailed | undefined;
    let errorOutput = "";
    /** The updates the agent replays while it loads a session; none while it works. */
    let replay: Array<AcpProtocol.Update> | undefined;
    let earlier: ReadonlyArray<Transcript.Input> = [];

    const offer = (reported: ReadonlyArray<HarnessEvent.Event>) =>
      Queue.offerAll(events, reported).pipe(Effect.asVoid);
    const stop = (error: HarnessErrors.ExecutionFailed) =>
      Effect.suspend(() => {
        failure ??= error;
        return Queue.fail(events, error);
      });
    /** `effect`, unless the session stopped, which fails it as the session failed. */
    const unlessStopped = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.suspend((): Effect.Effect<A, E | HarnessErrors.ExecutionFailed, R> =>
        failure === undefined ? effect : Effect.fail(failure),
      );

    const handlers: AcpConnection.Handlers = {
      notification: (method, params) =>
        Effect.suspend(() => {
          if (method !== "session/update") return Effect.void;
          const notification = decodeNotification(params);
          const update =
            notification._tag === "Some"
              ? AcpProtocol.readUpdate(notification.value.update)
              : undefined;
          if (update === undefined) return Effect.void;
          if (replay !== undefined) {
            replay.push(update);
            return Effect.void;
          }
          return offer(translation.update(update));
        }),
      request: (method, params) => {
        const request =
          method === "session/request_permission" ? decodePermission(params) : undefined;
        return request?._tag === "Some"
          ? Effect.succeed(AcpProtocol.allow(request.value))
          : Effect.fail(
              new AcpConnection.RequestFailed({
                method,
                code: -32601,
                message: "Method not found",
              }),
            );
      },
    };

    const acp = <A>(effect: Effect.Effect<A, AcpConnection.RequestFailed | AcpConnection.Closed>) =>
      Effect.mapError(effect, (error) => failureOf(error, errorOutput));

    /** A session the agent opened, whose prompt still running is cancelled when it ends. */
    const opened = (connection: AcpConnection.Connection, sessionId: string) =>
      Scope.addFinalizer(scope, connection.notify("session/cancel", { sessionId })).pipe(
        Effect.as({ connection, sessionId }),
      );

    /** Run the agent and set up its session for `history`, returning the session's ID. */
    const startAgent = Effect.fnUntraced(function* (history: ReadonlyArray<Transcript.Item>) {
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: "amends-acp-" })
        .pipe(Scope.provide(scope), Effect.orDie);
      const run = yield* agent
        .prepareRun({ workdir, directory, endpoint, instructions: options.instructions })
        .pipe(Effect.provideContext(context));
      const [command, ...args] = run.argv;
      const handle = yield* spawner
        .spawn(
          ChildProcess.make(command, args, {
            cwd: workdir,
            env: run.env,
            extendEnv: true,
            stdin: "pipe",
            // An agent signalled to end may take its time, or not end at all.
            forceKillAfter: "2 seconds",
          }),
        )
        .pipe(
          Scope.provide(scope),
          Effect.mapError(
            (error) =>
              new HarnessErrors.ExecutionFailed({
                reason: `The agent didn't start: ${error.message}`,
                retryable: false,
                problem: "unexpected",
              }),
          ),
        );
      yield* handle.stderr.pipe(
        Stream.decodeText(),
        Stream.runForEach((text) =>
          Effect.sync(() => {
            errorOutput = (errorOutput + text).slice(-errorOutputLimit);
          }),
        ),
        Effect.ignore,
        Effect.forkIn(scope),
      );
      // Once its input ends, the agent has a moment to end by itself before it is signalled.
      yield* Scope.addFinalizer(
        scope,
        handle.exitCode.pipe(Effect.timeoutOption("2 seconds"), Effect.ignore),
      );
      const connection = yield* AcpConnection.make(handle, handlers).pipe(Scope.provide(scope));
      const initialized = yield* acp(
        connection.request("initialize", {
          protocolVersion: AcpProtocol.version,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        }),
      ).pipe(Effect.flatMap(decodeInitialize));
      const reported = initialized.agentInfo?.version;
      if (reported !== agent.version)
        return yield* new HarnessErrors.ExecutionFailed({
          reason: `The sandbox has ${agent.declaration.name} ${reported ?? "of an unknown release"}; this harness needs ${agent.version}.`,
          retryable: false,
          problem: "unexpected",
        });
      if (history.length === 0) {
        const created = yield* acp(
          connection.request("session/new", { cwd: workdir, mcpServers: [] }),
        ).pipe(Effect.flatMap(decodeNewSession));
        return yield* opened(connection, created.sessionId);
      }
      if (initialized.agentCapabilities?.loadSession !== true)
        return yield* new HarnessErrors.Unsupported({
          reason: "The agent can't load a session, so it can only start a new conversation.",
        });
      const written = yield* run.writeSession(history);
      replay = [];
      yield* acp(
        connection.request("session/load", {
          sessionId: written.sessionId,
          cwd: workdir,
          mcpServers: [],
        }),
      );
      const replayed = replayedMessages(replay);
      replay = undefined;
      if (!replayedAsWritten(written.messages, replayed))
        return yield* new HarnessErrors.Unsupported({
          reason: "The agent loaded the conversation differently from how it was written.",
        });
      return yield* opened(connection, written.sessionId);
    });

    /** Hand the agent its input one prompt at a time, reporting what it does, until the session ends. */
    const prompts = Effect.fnUntraced(function* (
      connection: AcpConnection.Connection,
      sessionId: string,
    ) {
      for (;;) {
        const taken = yield* Queue.takeAll(work);
        const inputs: Array<Transcript.Input> = [];
        for (const item of taken) {
          if (item._tag === "Batch") {
            yield* offer([{ _tag: "InputIncorporated", batch: item.batch }]);
            inputs.push(...item.batch.items);
          } else inputs.push(...item.items);
        }
        const answer = yield* acp(
          connection.request("session/prompt", { sessionId, prompt: inputs.flatMap(promptOf) }),
        ).pipe(Effect.flatMap(decodePrompt));
        yield* offer(translation.promptEnded(answer));
        if ((yield* Queue.size(work)) === 0) yield* offer([{ _tag: "Idle" }]);
      }
    });

    const prepare = (items: ReadonlyArray<Transcript.Item>) =>
      Effect.gen(function* () {
        if (phase !== "new") return yield* new HarnessErrors.AlreadyPrepared();
        phase = "preparing";
        const summary = Transcript.summarize(items);
        if (Result.isFailure(summary))
          return yield* new HarnessErrors.InvalidTranscript({ reason: summary.failure });
        if (summary.success.pending.length > 0)
          return yield* new HarnessErrors.Unsupported({
            reason: "The agent can't take results for tool calls an earlier session made.",
          });
        const { history, trailing } = splitTrailingInput(items);
        if (summary.success.awaitsResponse && trailing.length === 0)
          return yield* new HarnessErrors.Unsupported({
            reason: "The agent can't continue a response from its tool results.",
          });
        const started = yield* startAgent(history);
        earlier = trailing;
        phase = "prepared";
        yield* prompts(started.connection, started.sessionId).pipe(
          Effect.catch((error) => stop(error)),
          Effect.forkIn(scope),
        );
      }).pipe(
        Effect.tapError((error) =>
          error._tag === "Harness.ExecutionFailed" ? stop(error) : Effect.void,
        ),
      );

    const requirePrepared = Effect.suspend(() =>
      phase === "prepared" ? Effect.void : Effect.fail(new HarnessErrors.NotPrepared()),
    );

    return {
      prepare,
      submit: (batch) =>
        requirePrepared.pipe(
          Effect.andThen(unlessStopped(Queue.offer(work, { _tag: "Batch", batch }))),
          Effect.asVoid,
        ),
      resolve: (callId) =>
        requirePrepared.pipe(Effect.andThen(Effect.fail(new HarnessErrors.NotPending({ callId })))),
      resume: requirePrepared.pipe(
        Effect.andThen(
          unlessStopped(
            Effect.suspend(() => {
              const items = earlier;
              earlier = [];
              return items.length > 0
                ? Queue.offer(work, { _tag: "Earlier", items }).pipe(Effect.asVoid)
                : offer([{ _tag: "Idle" }]);
            }),
          ),
        ),
      ),
      events: Stream.fromQueue(events),
    } satisfies Harness.Session;
  });

  return {
    declaration: agent.declaration,
    capabilities: { transcript: true, pendingToolCalls: false },
    start,
  };
};

export * as AcpHarness from "./harness.ts";
