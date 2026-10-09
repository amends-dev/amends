/**
 * A session is one conversation with an agent, run a turn at a time. It is what callers hold:
 * `Harness.createSession` creates one over an agent session, and the session adds the host's tools,
 * whole-turn results, and the record of the conversation that `SessionState` keeps.
 *
 * `SessionState` is what `suspendTurn`, `detach`, and `stop` return for the caller to store. It
 * records the conversation as Effect AI `Prompt` messages, so that `Harness.createSession` can
 * resume the session from it on any agent: the agent that last ran it resumes from its own state,
 * and any other loads the conversation, and runs an unfinished turn again from its prompt.
 *
 * `suspendTurn`, `detach`, `stop`, and `destroy` release the session. Each takes hold of it
 * before it asks the agent, so that no turn starts meanwhile, and one that fails leaves the session
 * open, to be tried again.
 */
import { type Effect, Schema, type Stream } from "effect";
import type { AiError, Toolkit } from "effect/ai";
import { Prompt, type Tool } from "effect/ai";
import { type AgentSession, SessionId } from "./Agent.ts";
import type { GenerateObjectResult, GenerateResult } from "./GenerateResult.ts";
import type { HarnessError } from "./HarnessError.ts";
import { type CompactionPart, Step, type StreamPart } from "./StreamPart.ts";

/** A turn that `suspendTurn` cut short, kept so that the session can finish it later. */
export const UnfinishedTurn = Schema.Struct({
  prompt: Prompt.UserMessage,

  /**
   * The steps the turn finished before `suspendTurn`, their parts added up. The agent that cut the
   * turn short continues it after them; any other runs the turn again without them.
   */
  steps: Schema.Array(Step),

  /**
   * What the agent's `suspendTurn` returned. Without it, the next agent runs the turn again from
   * `prompt`.
   */
  agentState: Schema.optionalKey(Schema.Json),
});

export interface UnfinishedTurn extends Schema.Schema.Type<typeof UnfinishedTurn> {}

export const SessionState = Schema.Struct({
  id: SessionId,

  /** The agent that last ran the session, whose `agentState` only it can read. */
  agent: Schema.String,

  /**
   * The conversation so far: each turn's prompt, the tools its steps called, and its answer. A turn
   * that ended early, as when `stop` aborted it, is kept as far as it got. Once the agent compacts
   * the conversation, its summary stands in for everything before it.
   */
  history: Prompt.Prompt,

  /**
   * What the agent's `detach` or `stop` returned. It is left out rather than `undefined`, which
   * JSON saves as `null`, a state an agent could have returned.
   */
  agentState: Schema.optionalKey(Schema.Json),

  unfinishedTurn: Schema.optional(UnfinishedTurn),
});

export interface SessionState extends Schema.Schema.Type<typeof SessionState> {}

// TODO: Add `continueGenerate`, which finishes an unfinished turn and returns it whole, and let
// `continueStream` finish a turn that answers in JSON, once a caller continues such turns.
export interface StreamOptions<Tools extends Record<string, Tool.Any> = {}> {
  /** What the turn asks: text, or a user message that can also carry files. */
  readonly prompt: string | Prompt.UserMessage;

  /** Instructions for this turn, given as system or developer instructions where the agent has them. */
  readonly instructions?: string;

  /** The model for this turn, as the agent names models. The agent's default when omitted. */
  readonly model?: string;

  /**
   * The host's tools, with their handlers. When the agent calls one, the session runs its handler,
   * streams the result as a `tool-result` part, and gives the result back to the agent.
   *
   * A tool that needs approval, by its `needsApproval`, runs only once `approve` allows it: the turn
   * streams a `tool-approval-request` part after the call and waits, while the agent waits for the
   * result. A call `approve` refuses is answered as `execution-denied`, a failure the agent reads.
   * `needsApproval` as a function reads the call's decoded params and the conversation as the
   * session has recorded it, which lacks the parts the caller has not read yet.
   */
  readonly toolkit?: Toolkit.WithHandler<Tools>;
}

/** The settings the unfinished turn started with, given again for an agent that runs it again. */
export type ContinueOptions<Tools extends Record<string, Tool.Any> = {}> = Omit<
  StreamOptions<Tools>,
  "prompt"
>;

export interface GenerateObjectOptions<
  S extends Schema.Top,
  Tools extends Record<string, Tool.Any> = {},
> extends StreamOptions<Tools> {
  /** The schema the turn's answer decodes to, as JSON. */
  readonly schema: S;

  /** Names the object for agents that name the JSON they answer with. Defaults to `output`. */
  readonly objectName?: string;
}

/** What a turn fails with: the harness's errors, and those of the host's tools the agent called. */
export type TurnError<Tools extends Record<string, Tool.Any>> =
  | HarnessError
  | AiError.AiError
  | Tool.HandlerError<Tools[keyof Tools]>;

/** What the host's tools that a turn can call need. */
export type TurnServices<Tools extends Record<string, Tool.Any>> = Tool.HandlerServices<
  Tools[keyof Tools]
>;

export interface Session {
  readonly id: SessionId;

  /**
   * Whether the agent has the unfinished turn the session resumed with, which `continueStream`
   * then continues after the steps it finished. Otherwise `continueStream` runs the turn again from
   * its prompt, without them, for a caller that keeps the steps to set them aside.
   */
  readonly hasUnfinishedTurn: boolean;

  /**
   * Runs a turn, streaming its parts until `finish`. Interrupting the stream aborts the turn, which
   * the conversation keeps as far as it got. A failure the agent reports arrives as an `error` part,
   * and the turn finishes with `error`.
   */
  readonly stream: <Tools extends Record<string, Tool.Any> = {}>(
    options: StreamOptions<Tools>,
  ) => Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>>;

  /**
   * Runs a turn and returns it whole. Fails with `TurnFailedError` when the agent reports a failure.
   * Nothing can answer an approval request before the turn ends, so each is denied; `stream` is the
   * way to ask.
   */
  readonly generate: <Tools extends Record<string, Tool.Any> = {}>(
    options: StreamOptions<Tools>,
  ) => Effect.Effect<GenerateResult, TurnError<Tools>, TurnServices<Tools>>;

  /**
   * Runs a turn that answers in JSON and decodes the answer with `schema`. Fails with
   * `StructuredOutputError` when the answer does not decode, and with `UnsupportedError` when the
   * agent cannot answer in JSON. Like `generate`, it denies every approval request.
   */
  readonly generateObject: <S extends Schema.Top, Tools extends Record<string, Tool.Any> = {}>(
    options: GenerateObjectOptions<S, Tools>,
  ) => Effect.Effect<
    GenerateObjectResult<S["Type"]>,
    TurnError<Tools>,
    TurnServices<Tools> | S["DecodingServices"]
  >;

  /**
   * Streams the unfinished turn the session was started with, like `stream`, from the step that was
   * in flight when `suspendTurn` cut it short. That step starts over, so the parts of it delivered
   * before `suspendTurn` are replaced by the ones `continueStream` streams. An agent that does not
   * have the turn, such as another agent, runs it again from its prompt.
   */
  readonly continueStream: <Tools extends Record<string, Tool.Any> = {}>(
    options: ContinueOptions<Tools>,
  ) => Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>>;

  /**
   * Answers a `tool-approval-request` of the running turn: one the session made for a host tool
   * that needs approval, which `approved` allows or refuses, or else one from the agent for its own
   * tools. A request the session made is answered once, and ends with the stream that made it.
   */
  readonly approve: AgentSession["approve"];

  /**
   * Asks the agent to replace the conversation so far with a summary, guided by `instructions`, and
   * returns the compaction, which the conversation then starts from. It runs between turns, and no
   * turn starts meanwhile. Fails with `UnsupportedError` when the agent compacts only by itself.
   */
  readonly compact: AgentSession["compact"];

  /**
   * Ends the running turn's stream, while the agent keeps working where it can, and returns the
   * session with the turn unfinished, for `continueStream` to finish once
   * `Harness.createSession` resumes it.
   */
  readonly suspendTurn: Effect.Effect<SessionState, HarnessError>;

  /** Releases the session between turns while the agent keeps running. */
  readonly detach: Effect.Effect<SessionState, HarnessError>;

  /**
   * Stops the agent, aborting a running turn, whose stream ends with an error and which the
   * conversation keeps as far as it got, and returns the session to start again later.
   */
  readonly stop: Effect.Effect<SessionState, HarnessError>;

  /**
   * Stops the agent for good, aborting a running turn. It also destroys a session already released
   * of, and destroying it again succeeds.
   */
  readonly destroy: Effect.Effect<void, HarnessError>;
}

/**
 * `conversation` with `step` recorded after it, as `SessionState.history` records a conversation:
 * an assistant message with what the model wrote and the tools it called, followed by a tool
 * message with the results, and none for a step that wrote nothing and called none. A step that
 * compacted the conversation replaces it, and what the step had before, with the conversation the
 * compaction left, so that the conversation is the one the agent goes on with.
 */
export const recordStep = (conversation: Prompt.Prompt, step: Step): Prompt.Prompt => {
  const compactedAt = step.parts.findLastIndex((part) => part.type === "compaction");
  const compaction = step.parts[compactedAt];
  return compaction?.type === "compaction"
    ? Prompt.concat(
        conversationAfter(compaction),
        Prompt.fromMessages(messagesOfParts(step.parts.slice(compactedAt + 1))),
      )
    : Prompt.concat(conversation, Prompt.fromMessages(messagesOfParts(step.parts)));
};

/**
 * The conversation a compaction leaves: its summary, as a user message, then the messages it kept.
 * An agent that keeps its own conversation goes on from this one, so that it has what the session
 * records.
 */
export const conversationAfter = (
  compaction: Pick<CompactionPart, "summary" | "kept">,
): Prompt.Prompt =>
  Prompt.concat(
    Prompt.make(
      `This conversation continues from an earlier part, summarized below.\n\n${compaction.summary}`,
    ),
    compaction.kept ?? [],
  );

// TODO: Record what the model reasoned, and the files it wrote, once a model can read them back
// from another: providers read back only the reasoning they produced.
/**
 * The messages that record a step's parts. In a prompt, a `providerExecuted` call is one the
 * model's provider ran, so every call is recorded as one the model made, whoever ran the tool,
 * which any model reads.
 *
 * A step its turn ended partway through keeps what it wrote so far, and each call it left without a
 * result is answered as interrupted, as Effect AI answers the calls of a response cut short, since
 * models refuse a conversation with a call no result answers.
 */
const messagesOfParts = (parts: Step["parts"]): ReadonlyArray<Prompt.Message> => {
  const assistantParts: Array<Prompt.TextPart | Prompt.ToolCallPart> = [];
  const results: Array<Prompt.ToolResultPart> = [];
  for (const part of parts) {
    switch (part.type) {
      case "text":
        if (part.text !== "") assistantParts.push(Prompt.makePart("text", { text: part.text }));
        break;
      case "tool-call":
        assistantParts.push(
          Prompt.makePart("tool-call", {
            id: part.id,
            name: part.name,
            params: part.params,
            providerExecuted: false,
          }),
        );
        break;
      case "tool-result":
        results.push(
          Prompt.makePart("tool-result", {
            id: part.id,
            name: part.name,
            isFailure: part.isFailure,
            result: part.result,
            providerExecuted: false,
          }),
        );
        break;
    }
  }
  const answered = new Set(results.map((result) => result.id));
  for (const part of assistantParts) {
    if (part.type === "tool-call" && !answered.has(part.id)) {
      results.push(interruptedResultOf(part));
    }
  }
  return [
    ...(assistantParts.length === 0
      ? []
      : [Prompt.makeMessage("assistant", { content: assistantParts })]),
    ...(results.length === 0 ? [] : [Prompt.makeMessage("tool", { content: results })]),
  ];
};

/** The result of a call its turn ended before answering, as Effect AI writes one. */
const interruptedResultOf = (call: Prompt.ToolCallPart) =>
  Prompt.makePart("tool-result", {
    id: call.id,
    name: call.name,
    isFailure: true,
    result: { type: "execution-interrupted", reason: "The turn ended before the tool finished" },
    providerExecuted: false,
  });
