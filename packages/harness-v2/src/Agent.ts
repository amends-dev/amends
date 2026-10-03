/**
 * An agent is what a harness runs: opencode, Codex, Claude Code, or a loop of our own over an
 * Effect AI `LanguageModel`. Each agent's adapter implements `Agent`, and `Harness.make` turns it
 * into the `Harness` service callers use, which adds whole-turn results, objects, the host's tools,
 * and the record of the conversation that lets a session move from one agent to another.
 *
 * An agent session is one conversation with the agent, which works in a sandbox. Each turn streams
 * `StreamPart`s until its `finish` part, and interrupting the stream aborts the turn. The harness
 * runs one turn of a session at a time, so an agent never sees a turn start while another runs.
 * A session outlives the process that started it: the agent keeps running after `detach` or
 * `suspend`, and `start` picks the session up again from what those returned.
 */
import type { Sandbox, Template } from "@amends/sandbox-v2";
import { type Effect, Schema, type Stream } from "effect";
import type { LanguageModel, Prompt, Tool } from "effect/ai";
import type { HarnessError } from "./HarnessError.ts";
import type { StreamPart } from "./StreamPart.ts";

/**
 * Names a session with letters, digits, `-`, and `_`, starting with a letter or digit and at most
 * 63 characters long, so that it can name the session's directory and the agent's own session.
 */
export const SessionId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/),
).pipe(Schema.brand("SessionId"));

export type SessionId = typeof SessionId.Type;

// TODO: Add a permission mode for the agent's own tools, and which of them it may use, once an
// agent asks for approval before using its own tools.
export interface StartOptions {
  readonly id: SessionId;

  /** The sandbox the agent works in, prepared with its `template`. The agent never stops or destroys it. */
  readonly sandbox: Sandbox.Sandbox["Service"];

  /** The absolute directory in the sandbox that the agent works in for this session. It exists before `start`. */
  readonly workingDirectory: string;

  // TODO: Add a helper that writes a conversation as text into the first turn's instructions, for
  // agents that cannot load one natively.
  /**
   * The conversation so far, empty for a new session. An agent that last ran this session, and is
   * given `resume` or `unfinishedTurn`, has it already. Any other agent loads it before its first
   * turn, so that a session started on one agent can continue on another.
   */
  readonly history: Prompt.Prompt;

  /** What this agent's `detach` or `stop` returned when the session last ran on this agent. */
  readonly resume?: Schema.Json;

  /**
   * What this agent's `suspend` returned when the session's last turn was cut short on this agent.
   * The session starts ready for `continue` instead of a new turn.
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
   * `providerExecuted` and waits for `submitToolResult`.
   */
  readonly tools: ReadonlyArray<Tool.Any>;

  /** How the turn answers. JSON fails with `UnsupportedError` when the agent cannot answer in JSON. */
  readonly responseFormat: LanguageModel.ProviderOptions["responseFormat"];
}

/**
 * The settings the unfinished turn started with, given again: an agent that cannot reattach to the
 * turn runs it again with them.
 */
export type ContinueOptions = Omit<TurnOptions, "prompt">;

// TODO: Add `readHistory`, which reads the conversation from the agent's own store, including turns
// the harness did not run, such as ones a person continued in the agent's own interface.
// TODO: Add `sendMessage`, which gives the running turn another user message, for agents that take
// input while they work.
export interface AgentSession {
  /** Runs a turn, streaming its parts until `finish`. Interrupting the stream aborts the turn. */
  readonly prompt: (options: TurnOptions) => Stream.Stream<StreamPart, HarnessError>;

  /**
   * Streams the turn `suspend` cut short, in a session started with `unfinishedTurn`. An agent whose
   * turn kept running streams the parts it had not delivered yet; one whose turn could not outlive
   * its process runs it again from its own record, repeating the work that was in flight.
   */
  readonly continue: (options: ContinueOptions) => Stream.Stream<StreamPart, HarnessError>;

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
   * Asks the agent to replace its conversation so far with a summary, guided by `instructions`. The
   * summary arrives as a `compaction` part. Fails with `UnsupportedError` when the agent compacts
   * only by itself.
   */
  readonly compact: (instructions?: string) => Effect.Effect<void, HarnessError>;

  /**
   * Ends the running turn's stream after the parts delivered so far while the agent keeps working,
   * and returns what `start` takes as `unfinishedTurn` to continue the turn with no part missed or
   * repeated.
   */
  readonly suspend: Effect.Effect<Schema.Json, HarnessError>;

  /** Lets go of the session between turns while the agent keeps running, returning what `start` takes as `resume`. */
  readonly detach: Effect.Effect<Schema.Json, HarnessError>;

  /** Stops the agent, returning what `start` takes as `resume` to start it again with its conversation. */
  readonly stop: Effect.Effect<Schema.Json, HarnessError>;

  /** Stops the agent for good. */
  readonly destroy: Effect.Effect<void, HarnessError>;
}

export interface Agent {
  /** Names the agent, such as `opencode`. Errors and saved sessions carry it. */
  readonly id: string;

  /** Installs the agent in a sandbox. An agent that runs in the host's process has none. */
  readonly template?: Template.Template;

  /** Starts a session: a new one, or one picked up again from what an earlier session returned. */
  readonly start: (options: StartOptions) => Effect.Effect<AgentSession, HarnessError>;
}
