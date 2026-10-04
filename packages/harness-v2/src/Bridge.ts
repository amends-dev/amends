/**
 * A bridge is the program through which hosts reach an agent that works in a sandbox, such as
 * opencode, Codex, or Claude Code. One bridge runs for the agent in each sandbox and serves every
 * session there. It is all the sandbox exposes of the agent: it listens on the agent's port, behind
 * a token that only hosts know, and runs the agent where nothing outside the sandbox reaches it.
 *
 * The bridge runs each turn itself, so that a turn goes on when a host's connection drops or the
 * host lets go, until it finishes or a host aborts it. It numbers each turn's parts and keeps them,
 * so that a host reads them from any number: again after its connection drops, or to `continue` a
 * turn that another host suspended. The agent behind it needs to do neither.
 *
 * An agent's adapter implements `Bridge.Agent` to run behind a bridge, `BridgeServer.serve` runs
 * the bridge in the sandbox, and `BridgeClient.make` is the `Agent.Agent` hosts use to reach it.
 * `Rpcs` is the protocol between them, over a WebSocket whose host presents the token as
 * `Authorization: Bearer <token>` when it connects.
 */
import { Network, Sandbox } from "@amends/sandbox-v2";
import { type Effect, Schema, type Scope, type Stream } from "effect";
import { Prompt } from "effect/ai";
import { Rpc, RpcGroup } from "effect/rpc";
import { type AgentSession as HostAgentSession, SessionId } from "./Agent.ts";
import { HarnessError } from "./HarnessError.ts";
import { StreamPart } from "./StreamPart.ts";

/** A tool the host runs, as the agent reads it: its name, what it does, and its parameters. */
export const ToolDefinition = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),

  /** The tool's parameters, as a JSON Schema. */
  parameters: Schema.Json,
});

export interface ToolDefinition extends Schema.Schema.Type<typeof ToolDefinition> {}

/** How a turn answers: in text, or in JSON that matches `schema`, a JSON Schema. */
export const ResponseFormat = Schema.Union([
  Schema.Struct({ type: Schema.tag("text") }),
  Schema.Struct({ type: Schema.tag("json"), objectName: Schema.String, schema: Schema.Json }),
]);

export type ResponseFormat = typeof ResponseFormat.Type;

/**
 * A turn's settings, as `Agent.TurnOptions` gives them, with the host's tools and the answer's
 * schema as JSON Schemas, since only data crosses into the sandbox.
 */
export const TurnOptions = Schema.Struct({
  prompt: Prompt.UserMessage,
  instructions: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  tools: Schema.Array(ToolDefinition),
  responseFormat: ResponseFormat,
});

export interface TurnOptions extends Schema.Schema.Type<typeof TurnOptions> {}

export interface StartOptions {
  readonly id: SessionId;

  /** The absolute directory the session works in. It exists before `start`. */
  readonly directory: string;

  /**
   * The conversation so far, empty for a new session. An agent given `agentState` has it already;
   * any other loads it before its first turn.
   */
  readonly history: Prompt.Prompt;

  /** What the session's `state` returned when it last ran on this agent. */
  readonly agentState?: Schema.Json;
}

/**
 * A session of an agent behind a bridge. The bridge runs one turn of it at a time, keeps its
 * turns' parts, and ends it by closing its scope.
 */
export interface AgentSession {
  /** Runs a turn, streaming its parts until `finish`. Interrupting the stream aborts the turn. */
  readonly prompt: (options: TurnOptions) => Stream.Stream<StreamPart, HarnessError>;

  readonly submitToolResult: HostAgentSession["submitToolResult"];

  readonly approve: HostAgentSession["approve"];

  readonly compact: HostAgentSession["compact"];

  /** What `start` takes as `agentState` to start the session again, as a restarted bridge does. */
  readonly state: Effect.Effect<Schema.Json, HarnessError>;

  /** Deletes what the agent keeps of the session. Its scope closes afterwards. */
  readonly destroy: Effect.Effect<void, HarnessError>;
}

export interface Agent {
  /** Names the agent, such as `opencode`, as its `Agent.Agent` for hosts does. */
  readonly id: string;

  /**
   * Starts a session: a new one, or one started again from its `state`. The session runs until its
   * scope closes, when a host stops or destroys it, or the bridge exits.
   */
  readonly start: (options: StartOptions) => Effect.Effect<AgentSession, HarnessError, Scope.Scope>;
}

/**
 * Names a turn, as `Sandbox.isName` checks. The host picks it, so that a request to start the turn
 * that it sends again, not knowing whether the first arrived, starts it once.
 */
export const TurnId = Schema.String.check(Sandbox.isName).pipe(Schema.brand("TurnId"));

export type TurnId = typeof TurnId.Type;

/** A part of a turn, numbered from 1 in the order the turn streamed it. */
export const NumberedPart = Schema.Struct({ seq: Schema.Int, part: StreamPart });

export interface NumberedPart extends Schema.Schema.Type<typeof NumberedPart> {}

/** The session a request is about. Every request but `StartSession` needs it started. */
const inSession = { session: SessionId };

// TODO: Add the protocol's version to `Hello`, once a host meets a bridge older than itself.
export class Rpcs extends RpcGroup.make(
  /** Answers which agent the bridge runs, once it is listening. */
  Rpc.make("Hello", { success: Schema.Struct({ agent: Schema.String }) }),

  /**
   * Starts the session, or takes up the one the bridge is running, which ignores `history` and
   * `agentState`. Answers whether the bridge has `unfinishedTurn`, for `ReadTurn` to stream.
   */
  Rpc.make("StartSession", {
    payload: {
      ...inSession,
      directory: Schema.String,
      history: Prompt.Prompt,
      agentState: Schema.optionalKey(Schema.Json),
      unfinishedTurn: Schema.optional(TurnId),
    },
    success: Schema.Struct({ hasUnfinishedTurn: Schema.Boolean }),
    error: HarnessError,
  }),

  /**
   * Starts a turn, which runs until it finishes or `AbortTurn`, whoever reads it. Starting a turn
   * the session already started does nothing; starting one while another runs fails with
   * `TurnInProgressError`.
   */
  Rpc.make("StartTurn", {
    payload: { ...inSession, turn: TurnId, options: TurnOptions },
    error: HarnessError,
  }),

  /**
   * Streams the turn's parts numbered after `after`, then each new one, until the turn's last.
   * Fails with what the turn failed with, after its parts, and with `NoTurnError` for a turn the
   * bridge does not have.
   */
  Rpc.make("ReadTurn", {
    payload: { ...inSession, turn: TurnId, after: Schema.Int },
    success: NumberedPart,
    error: HarnessError,
    stream: true,
  }),

  /** Aborts the turn. Aborting a turn that ended does nothing. */
  Rpc.make("AbortTurn", {
    payload: { ...inSession, turn: TurnId },
    error: HarnessError,
  }),

  Rpc.make("SubmitToolResult", {
    payload: {
      ...inSession,
      result: Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        result: Schema.Json,
        isFailure: Schema.Boolean,
      }),
    },
    error: HarnessError,
  }),

  Rpc.make("Approve", {
    payload: {
      ...inSession,
      response: Schema.Struct({
        approvalId: Schema.String,
        approved: Schema.Boolean,
        reason: Schema.optional(Schema.String),
      }),
    },
    error: HarnessError,
  }),

  Rpc.make("Compact", {
    payload: { ...inSession, instructions: Schema.optional(Schema.String) },
    error: HarnessError,
  }),

  /** What `StartSession` takes as `agentState` to start the session again. */
  Rpc.make("ReadState", {
    payload: inSession,
    success: Schema.Json,
    error: HarnessError,
  }),

  /** Aborts the running turn and ends the session, answering what `ReadState` would. */
  Rpc.make("StopSession", {
    payload: inSession,
    success: Schema.Json,
    error: HarnessError,
  }),

  /** Aborts the running turn, deletes the session and its turns, and ends it. */
  Rpc.make("DestroySession", {
    payload: inSession,
    error: HarnessError,
  }),
) {}

/**
 * What a host gives the bridge it launches, on the bridge's standard input, so that neither the
 * agent nor anything else in the sandbox can read the token or the agent's credentials.
 */
export const LaunchOptions = Schema.Struct({
  /** The token hosts present when they connect. */
  token: Schema.String,

  /** The port the bridge listens on, on every interface of the sandbox. */
  port: Network.Port,

  /** The absolute directory the bridge keeps its turns in, outside every session's directory. */
  stateDirectory: Schema.String,

  /** The adapter's own options, such as the agent's configuration and its model providers' keys. */
  agentOptions: Schema.Json,
});

export interface LaunchOptions extends Schema.Schema.Type<typeof LaunchOptions> {}
