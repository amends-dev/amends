/**
 * The parts of the Agent Client Protocol (https://agentclientprotocol.com) this client reads, as
 * the agent sends them. Each schema keeps only the fields the client uses; anything else an agent
 * sends is ignored, so a newer agent's additions do not break reading.
 */
import { Schema } from "effect";

/** The protocol version this client speaks. */
export const version = 1;

/** A piece of content: text is the only kind this client sends or reads. */
export const ContentBlock = Schema.Struct({
  type: Schema.String,
  text: Schema.optional(Schema.String),
});

/** Where a tool call stands. */
export const ToolCallStatus = Schema.Literals(["pending", "in_progress", "completed", "failed"]);
export type ToolCallStatus = typeof ToolCallStatus.Type;

/** Content a tool call produced: text, or something this client shows as nothing. */
const ToolCallContent = Schema.Struct({
  type: Schema.String,
  content: Schema.optional(ContentBlock),
});

const MessageId = Schema.optional(Schema.NullOr(Schema.String));

/** A piece of a message, from the agent or echoing the user, in the message its ID names. */
const Chunk = Schema.Struct({
  sessionUpdate: Schema.Literals([
    "agent_message_chunk",
    "agent_thought_chunk",
    "user_message_chunk",
  ]),
  content: ContentBlock,
  messageId: MessageId,
});

/** A tool call the agent began, with what it knows so far. */
const ToolCall = Schema.Struct({
  sessionUpdate: Schema.Literal("tool_call"),
  toolCallId: Schema.String,
  title: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  kind: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(ToolCallStatus)),
  rawInput: Schema.optional(Schema.Unknown),
});

/** More of a tool call: its input, its progress, or its outcome. */
const ToolCallUpdate = Schema.Struct({
  sessionUpdate: Schema.Literal("tool_call_update"),
  toolCallId: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  name: Schema.optional(Schema.NullOr(Schema.String)),
  kind: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(ToolCallStatus)),
  rawInput: Schema.optional(Schema.Unknown),
  rawOutput: Schema.optional(Schema.Unknown),
  content: Schema.optional(Schema.NullOr(Schema.Array(ToolCallContent))),
});

/** What the agent reports about a session, of the kinds this client reads. */
export const Update = Schema.Union([Chunk, ToolCall, ToolCallUpdate]);
export type Update = typeof Update.Type;

/** A `session/update` notification. */
export const SessionNotification = Schema.Struct({
  sessionId: Schema.String,
  update: Schema.Unknown,
});

const decodeUpdate = Schema.decodeUnknownOption(Update);

/** The update a notification carries, if it is of a kind this client reads. */
export const readUpdate = (update: unknown): Update | undefined => {
  const decoded = decodeUpdate(update);
  return decoded._tag === "Some" ? decoded.value : undefined;
};

/** Why the agent stopped answering a prompt. */
export const StopReason = Schema.Literals([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);
export type StopReason = typeof StopReason.Type;

const Count = Schema.optional(Schema.NullOr(Schema.Int));

/** Tokens the agent's model requests used while answering a prompt. */
export const Usage = Schema.Struct({
  inputTokens: Schema.Int,
  outputTokens: Schema.Int,
  thoughtTokens: Count,
  cachedReadTokens: Count,
  cachedWriteTokens: Count,
});
export type Usage = typeof Usage.Type;

/** The answer to `session/prompt`, once the agent finished working on it. */
export const PromptResponse = Schema.Struct({
  stopReason: StopReason,
  usage: Schema.optional(Schema.NullOr(Usage)),
});
export type PromptResponse = typeof PromptResponse.Type;

/** The answer to `initialize`: what the agent can do, and which agent and release it is. */
export const InitializeResponse = Schema.Struct({
  protocolVersion: Schema.Int,
  agentCapabilities: Schema.optional(
    Schema.Struct({ loadSession: Schema.optional(Schema.Boolean) }),
  ),
  agentInfo: Schema.optional(
    Schema.NullOr(Schema.Struct({ name: Schema.String, version: Schema.String })),
  ),
});

/** The answer to `session/new`. */
export const NewSessionResponse = Schema.Struct({ sessionId: Schema.String });

/** An option the agent offers when it asks permission for a tool call. */
const PermissionOption = Schema.Struct({
  optionId: Schema.String,
  kind: Schema.String,
});

/** A `session/request_permission` request. */
export const PermissionRequest = Schema.Struct({
  options: Schema.Array(PermissionOption),
});

/**
 * The answer that allows what the agent asked to do: its option to allow always, or else once.
 * The sandbox is the boundary, so everything inside it is allowed.
 */
export const allow = (request: typeof PermissionRequest.Type) => {
  const option =
    request.options.find((candidate) => candidate.kind === "allow_always") ??
    request.options.find((candidate) => candidate.kind === "allow_once");
  return option === undefined
    ? { outcome: { outcome: "cancelled" } }
    : { outcome: { outcome: "selected", optionId: option.optionId } };
};

export * as AcpProtocol from "./protocol.ts";
