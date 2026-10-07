/**
 * An agent is what a harness runs: opencode, Codex, Claude Code, or a loop of our own over an
 * Effect AI `LanguageModel`. Each agent's adapter implements `Agent`, and `Harness.make` turns it
 * into the `Harness` service callers use, which adds whole-turn results, objects, the host's tools,
 * and the record of the conversation that lets a session move from one agent to another.
 *
 * An agent session is one conversation with the agent. An agent that runs in a sandbox, as most
 * do, `requiresSandbox`; one that runs in the host's process can also work without one, answering
 * from its model alone. Each turn streams
 * `StreamPart`s until its `finish` part, and interrupting the stream aborts the turn. The harness
 * runs one turn of a session at a time, so an agent never sees a turn start while another runs.
 * A session outlives the process that started it: the agent keeps running after `detach` or
 * `suspendTurn`, and `createSession` picks the session up again from what those returned.
 *
 * Every agent is made with `Options`, the models it runs on, which its adapter extends with what
 * only that agent takes.
 */
import { Sandbox, type Template } from "@amends/sandbox";
import { type Effect, Schema, type Stream } from "effect";
import type { LanguageModel, Prompt, Tool } from "effect/ai";
import type { HarnessError } from "./HarnessError.ts";
import type { ModelEndpoint } from "./ModelEndpoint.ts";
import type { CompactionPart, StreamPart } from "./StreamPart.ts";

/**
 * What every agent is made with: the model a turn runs on when it names none, and the models a turn
 * can name, by name. A turn that names another fails with `UnsupportedError`.
 */
export interface Options {
  readonly model: ModelEndpoint;
  readonly models?: Readonly<Record<string, ModelEndpoint>>;
}

/**
 * Names a session, as `Sandbox.isName` checks, so that it can name the session's directory in the
 * sandbox and the agent's own session.
 */
export const SessionId = Schema.String.check(Sandbox.isName).pipe(Schema.brand("SessionId"));

export type SessionId = typeof SessionId.Type;

/** Where an agent works for a session: a sandbox, and the session's directory in it. */
export interface Workspace {
  /** The sandbox, prepared with the agent's `template`. The agent never stops or destroys it. */
  readonly sandbox: Sandbox.Sandbox["Service"];

  /** The absolute directory in the sandbox for this session. It exists before `createSession`. */
  readonly directory: string;
}

// TODO: Add a permission mode for the agent's own tools, and which of them it may use, once an
// agent asks for approval before using its own tools.
export interface CreateSessionOptions {
  readonly id: SessionId;

  /** Where the agent works. Absent only for an agent that does not require a sandbox. */
  readonly workspace?: Workspace;

  // TODO: Add a helper that writes a conversation as text into the first turn's instructions, for
  // agents that cannot load one natively.
  /**
   * The conversation so far, empty for a new session. An agent that last ran this session, and is
   * given `agentState` or `unfinishedTurn`, has it already. Any other agent loads it before its
   * first turn, so that a session started on one agent can continue on another.
   */
  readonly history: Prompt.Prompt;

  /** What this agent's `detach` or `stop` returned when the session last ran on this agent. */
  readonly agentState?: Schema.Json;

  /**
   * What this agent's `suspendTurn` returned when the session's last turn was cut short on this
   * agent. The session starts ready for `continueTurn` instead of a new turn, if the agent still
   * has the turn.
   */
  readonly unfinishedTurn?: Schema.Json;
}

// TODO: Add skills, which the agent loads before the turn, once an agent supports them.
export interface TurnOptions {
  /** What the turn asks. Earlier turns are in the agent's own conversation and are not sent again. */
  readonly prompt: Prompt.UserMessage;

  /** Instructions for this turn, given as system or developer instructions where the agent has them. */
  readonly instructions?: string;

  /** The model for this turn, as the agent names models. The agent's default when omitted. */
  readonly model?: string;

  /**
   * Tools the host runs. When the agent calls one, the turn streams a `tool-call` part that is not
   * `providerExecuted` and waits for `submitToolResult`. The host may ask for approval before it runs
   * a tool; the agent waits for the result either way, and gets `execution-denied` for a refusal.
   */
  readonly tools: ReadonlyArray<Tool.Any>;

  /** How the turn answers. JSON fails with `UnsupportedError` when the agent cannot answer in JSON. */
  readonly responseFormat: LanguageModel.ProviderOptions["responseFormat"];
}

// TODO: Add `readHistory`, which reads the conversation from the agent's own store, including turns
// the harness did not run, such as ones a person continued in the agent's own interface.
// TODO: Add `sendMessage`, which gives the running turn another user message, for agents that take
// input while they work.
export interface AgentSession {
  /**
   * Whether the session started with the turn `suspendTurn` cut short, for `continueTurn` to
   * finish. An agent given an `unfinishedTurn` it no longer has, such as opencode in a sandbox
   * other than the one the turn ran in, has none, and the harness runs the turn again from its
   * prompt.
   */
  readonly hasUnfinishedTurn: boolean;

  /** Runs a turn, streaming its parts until `finish`. Interrupting the stream aborts the turn. */
  readonly promptTurn: (options: TurnOptions) => Stream.Stream<StreamPart, HarnessError>;

  /**
   * Streams the turn `suspendTurn` cut short from the step after its first `finishedSteps`, which
   * the harness already has, given the settings the turn started with again. The step that was in
   * flight starts over: an agent whose turn kept running streams its parts again as they were, and
   * one whose turn could not outlive its process runs the step again.
   */
  readonly continueTurn: (
    options: TurnOptions,
    finishedSteps: number,
  ) => Stream.Stream<StreamPart, HarnessError>;

  /** Gives the running turn the result of a host tool it called. */
  readonly submitToolResult: (
    result: Pick<Prompt.ToolResultPart, "id" | "name" | "result" | "isFailure">,
  ) => Effect.Effect<void, HarnessError>;

  /**
   * Answers a `tool-approval-request` of the running turn. Fails with `UnsupportedError` for an
   * agent that never asks.
   */
  readonly approve: (
    response: Pick<Prompt.ToolApprovalResponsePart, "approvalId" | "approved" | "reason">,
  ) => Effect.Effect<void, HarnessError>;

  /**
   * Replaces the conversation so far with a summary, guided by `instructions`, and returns the
   * compaction. The session asks only between turns. Fails with `UnsupportedError` when the agent
   * compacts only by itself.
   */
  readonly compact: (instructions?: string) => Effect.Effect<CompactionPart, HarnessError>;

  /**
   * Ends the running turn's stream, while the agent keeps working where it can, and returns what
   * `createSession` takes as `unfinishedTurn` to continue the turn after any step whose
   * `finish-step` it delivered.
   */
  readonly suspendTurn: Effect.Effect<Schema.Json, HarnessError>;

  /**
   * Lets go of the session between turns while the agent keeps running, returning what
   * `createSession` takes as `agentState`.
   */
  readonly detach: Effect.Effect<Schema.Json, HarnessError>;

  /**
   * Stops the agent, returning what `createSession` takes as `agentState` to start it again with its
   * conversation.
   */
  readonly stop: Effect.Effect<Schema.Json, HarnessError>;

  /**
   * Stops the agent for good, deleting what it keeps of the session. It also destroys a session
   * `suspendTurn`, `detach`, or `stop` let go of, and destroying it again succeeds.
   */
  readonly destroy: Effect.Effect<void, HarnessError>;
}

export interface Agent {
  /** Names the agent, such as `opencode`. Errors and saved sessions carry it. */
  readonly id: string;

  /** Whether every session needs a sandbox. An agent that runs in the host's process may not. */
  readonly requiresSandbox: boolean;

  /** Installs the agent in a sandbox. An agent that runs in the host's process has none. */
  readonly template?: Template.Template;

  /**
   * The longest name of a host tool the agent takes, for an agent that adds to the names it is given
   * and so leaves a model API's 64 characters too few. A host names its tools to fit, with
   * `Assembly.toolkit`'s `maxNameLength`.
   */
  readonly maxToolNameLength?: number;

  /** Creates a session: a new one, or one picked up again from what an earlier session returned. */
  readonly createSession: (
    options: CreateSessionOptions,
  ) => Effect.Effect<AgentSession, HarnessError>;
}
