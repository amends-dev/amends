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

  /** What each turn the agent ran was given, in order. */
  readonly turns: ReadonlyArray<TurnOptions>;

  /** The results the host submitted for its tools, in order. */
  readonly submitted: ReadonlyArray<unknown>;
}

/**
 * An agent whose turns follow `script`, recording what the harness asks of it. Like most agents, it
 * requires a sandbox unless `options` says otherwise. Its own state, which
 * `suspend`, `detach`, and `stop` return, names the agent, so tests can tell whose state reached
 * `start`. `continue` finishes the unfinished turn with an answer of its own.
 */
export const makeFakeAgent = (
  id: string,
  script: Script,
  options: { readonly requiresSandbox?: boolean } = {},
) =>
  Effect.gen(function* () {
    const starts: Array<StartOptions> = [];
    const turns: Array<TurnOptions> = [];
    const submitted: Array<unknown> = [];
    const toolResults = yield* Queue.unbounded<unknown>();

    const agent: Agent = {
      id,
      requiresSandbox: options.requiresSandbox ?? true,
      start: (options) =>
        Effect.gen(function* () {
          starts.push(options);
          const suspended = yield* Deferred.make<void>();
          const session: AgentSession = {
            prompt: (turn) =>
              Stream.suspend(() => {
                turns.push(turn);
                return script(textOf(turn.prompt), { toolResult: Queue.take(toolResults) });
              }).pipe(Stream.interruptWhen(Deferred.await(suspended))),
            continue: () => Stream.fromIterable(reply(`${id} finished the unfinished turn`)),
            submitToolResult: (result) =>
              Effect.andThen(
                Effect.sync(() => submitted.push(result.result)),
                Queue.offer(toolResults, result.result),
              ),
            approve: () => Effect.void,
            compact: () => Effect.void,
            suspend: Effect.as(Deferred.succeed(suspended, undefined), { agent: id, turn: true }),
            detach: Effect.succeed({ agent: id }),
            stop: Effect.succeed({ agent: id }),
            destroy: Effect.void,
          };
          return session;
        }),
    };

    const fake: FakeAgent = { agent, starts, turns, submitted };
    return fake;
  });

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
