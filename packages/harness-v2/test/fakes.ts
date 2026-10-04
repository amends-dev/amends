import type { Port } from "@amends/sandbox-v2/Network";
import { Sandbox, SandboxId } from "@amends/sandbox-v2/Sandbox";
import { Deferred, Effect, FileSystem, Queue, Stream } from "effect";
import type { Prompt } from "effect/ai";
import { ChildProcessSpawner } from "effect/process";
import type { Agent, AgentSession, StartOptions, TurnOptions } from "../src/Agent.ts";
import type { HarnessError } from "../src/HarnessError.ts";
import type { StreamPart } from "../src/StreamPart.ts";

/**
 * The parts a fake agent streams for a turn, given the prompt's text. `toolResult` waits for the
 * next result the host submits.
 */
export type Script = (
  prompt: string,
  host: { readonly toolResult: Effect.Effect<unknown> },
) => Stream.Stream<StreamPart, HarnessError>;

export interface FakeAgent {
  readonly agent: Agent;

  /** What each `start` was given, in order. */
  readonly starts: ReadonlyArray<StartOptions>;

  /** What each turn the agent ran from its prompt was given, in order. */
  readonly turns: ReadonlyArray<TurnOptions>;

  /** How many steps the harness had of each turn the agent continued, in order. */
  readonly continued: ReadonlyArray<number>;

  /** The results the host submitted for its tools, in order. */
  readonly submitted: ReadonlyArray<unknown>;
}

export interface FakeAgentOptions {
  /** Whether every session needs a sandbox, as most agents do. True by default. */
  readonly requiresSandbox?: boolean;

  /** The ports the agent listens on in its sandbox. None by default. */
  readonly ports?: ReadonlyArray<Port>;

  /** Whether the agent loses the turns `suspend` cuts short, as opencode does in another sandbox. */
  readonly losesUnfinishedTurns?: boolean;

  /** Runs when the session suspends, before the agent lets go of the running turn. */
  readonly beforeSuspend?: Effect.Effect<void>;
}

/**
 * An agent whose turns follow `script`, recording what the harness asks of it. Its own state, which
 * `suspend`, `detach`, and `stop` return, names the agent, so tests can tell whose state reached
 * `start`. Like an agent whose turn keeps running, `continue` follows the script for the turn again
 * after the steps the harness has.
 */
export const makeFakeAgent = (id: string, script: Script, options: FakeAgentOptions = {}) =>
  Effect.gen(function* () {
    const starts: Array<StartOptions> = [];
    const turns: Array<TurnOptions> = [];
    const continued: Array<number> = [];
    const submitted: Array<unknown> = [];
    const toolResults = yield* Queue.unbounded<unknown>();

    const agent: Agent = {
      id,
      requiresSandbox: options.requiresSandbox ?? true,
      ports: options.ports,
      start: (startOptions) =>
        Effect.gen(function* () {
          starts.push(startOptions);
          /** Done once the session is suspended, stopped, or destroyed, ending the running turn. */
          const closed = yield* Deferred.make<void>();
          const close = Deferred.succeed(closed, undefined);
          const follow = (turn: TurnOptions) =>
            script(textOf(turn.prompt), { toolResult: Queue.take(toolResults) }).pipe(
              Stream.interruptWhen(Deferred.await(closed)),
            );
          const session: AgentSession = {
            hasUnfinishedTurn:
              startOptions.unfinishedTurn !== undefined && options.losesUnfinishedTurns !== true,
            prompt: (turn) =>
              Stream.suspend(() => {
                turns.push(turn);
                return follow(turn);
              }),
            continue: (turn, finishedSteps) =>
              Stream.suspend(() => {
                continued.push(finishedSteps);
                return follow(turn).pipe(afterSteps(finishedSteps));
              }),
            submitToolResult: (result) =>
              Effect.andThen(
                Effect.sync(() => submitted.push(result.result)),
                Queue.offer(toolResults, result.result),
              ),
            approve: () => Effect.void,
            compact: () => Effect.void,
            suspend: Effect.andThen(
              options.beforeSuspend ?? Effect.void,
              Effect.as(close, { agent: id, turn: true }),
            ),
            detach: Effect.succeed({ agent: id }),
            stop: Effect.as(close, { agent: id }),
            destroy: Effect.asVoid(close),
          };
          return session;
        }),
    };

    const fake: FakeAgent = { agent, starts, turns, continued, submitted };
    return fake;
  });

/**
 * Reads `turn` in the background, returning the fiber that collects its parts once the reader has
 * the part `reached` accepts. The session delivers a part the agent sent only when it is read, so a
 * test that lets go of a turn after a part waits for the reader, not the agent.
 */
export const readUntil = <E, R>(
  turn: Stream.Stream<StreamPart, E, R>,
  reached: (part: StreamPart) => boolean,
) =>
  Effect.gen(function* () {
    const read = yield* Deferred.make<void>();
    const reading = yield* turn.pipe(
      Stream.tap((part) => (reached(part) ? Deferred.succeed(read, undefined) : Effect.void)),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Deferred.await(read);
    return reading;
  });

/** Drops the parts of a turn's first `steps` steps. */
const afterSteps = (steps: number) =>
  Stream.mapAccum(
    () => 0,
    (finished: number, part: StreamPart) =>
      [
        part.type === "finish-step" ? finished + 1 : finished,
        finished < steps ? [] : [part],
      ] as const,
  );

/**
 * A sandbox that only creates directories, recording them, for agents that never touch the
 * sandbox. Its other operations are not meant to be reached.
 */
export interface FakeSandbox {
  readonly sandbox: Sandbox["Service"];

  /** The directories created in the sandbox, in order. */
  readonly directories: ReadonlyArray<string>;
}

export const makeFakeSandbox = Effect.sync((): FakeSandbox => {
  const directories: Array<string> = [];
  const sandbox = Sandbox.of({
    id: SandboxId.make("fake"),
    description: "A fake sandbox",
    workingDirectory: "/work",
    fileSystem: FileSystem.makeNoop({
      makeDirectory: (path) => Effect.sync(() => void directories.push(path)),
    }),
    childProcessSpawner: ChildProcessSpawner.make(() =>
      Effect.die("The fake sandbox runs no processes"),
    ),
    ports: [],
    endpoint: () => Effect.die("The fake sandbox exposes no ports"),
    stop: Effect.void,
    destroy: Effect.void,
    setNetworkPolicy: () => Effect.void,
    addRequestTransformations: () => Effect.void,
  });
  return { sandbox, directories };
});

/** A turn that answers `text` in one step. */
export const reply = (text: string): ReadonlyArray<StreamPart> => [
  { type: "text-start", id: "answer" },
  { type: "text-delta", id: "answer", delta: text },
  { type: "text-end", id: "answer" },
  { type: "finish-step", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
  { type: "finish", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
];

const textOf = (message: Prompt.UserMessage) =>
  message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
