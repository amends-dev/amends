/**
 * The events opencode records for a session in its v2 session API: the prompts the session took,
 * the steps of each turn, and the reasoning, text, and tool calls of each step. opencode numbers a
 * session's events from 0 and keeps them, so a client reads them again from any number, and another
 * opencode server rebuilds the session by replaying them.
 *
 * The schemas are opencode 1.18's, for the events this adapter reads and writes, with every field
 * opencode gives them, so that an event decodes and encodes again as it came. `durable.version`
 * names the version of an event's shape; these are version 1 of each, except `step.ended`, which is
 * version 2. Text, reasoning, and tool input are recorded whole when they end: the deltas opencode
 * streams while a step runs are not kept.
 */
import { Schema } from "effect";

/** Where an event falls in its session's numbered events. */
const Durable = Schema.Struct({
  /** The session's id. */
  aggregateID: Schema.String,

  seq: Schema.Int,

  /** The version of the event's shape. */
  version: Schema.Int,
});

const envelope = {
  id: Schema.String,
  durable: Durable,
};

/** Fields the data of every event in a session has. */
const inSession = {
  timestamp: Schema.Finite,
  sessionID: Schema.String,
};

/** What the model's provider reported beside a part, by provider, such as a reasoning signature. */
const ProviderMetadata = Schema.Record(Schema.String, Schema.Json);

/** A model, as opencode names one: its provider, its id there, and a variant such as `high`. */
export const ModelRef = Schema.Struct({
  id: Schema.String,
  providerID: Schema.String,
  variant: Schema.optionalKey(Schema.String),
});

export interface ModelRef extends Schema.Schema.Type<typeof ModelRef> {}

/** Where an attachment was mentioned in the prompt's text. */
const PromptSource = Schema.Struct({
  start: Schema.Int,
  end: Schema.Int,
  text: Schema.String,
});

const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        uri: Schema.String,
        mime: Schema.String,
        name: Schema.optionalKey(Schema.String),
        description: Schema.optionalKey(Schema.String),
        source: Schema.optionalKey(PromptSource),
      }),
    ),
  ),
  agents: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        source: Schema.optionalKey(PromptSource),
      }),
    ),
  ),
});

/** What a tool returned to the model: text, or a file. */
export const ToolContent = Schema.Union([
  Schema.Struct({ type: Schema.tag("text"), text: Schema.String }),
  Schema.Struct({
    type: Schema.tag("file"),
    uri: Schema.String,
    mime: Schema.String,
    name: Schema.optionalKey(Schema.String),
  }),
]);

export type ToolContent = typeof ToolContent.Type;

const Provider = Schema.Struct({
  /** Whether the model's provider ran the tool, instead of opencode. */
  executed: Schema.Boolean,
  metadata: Schema.optionalKey(ProviderMetadata),
});

const SessionError = Schema.Struct({
  type: Schema.Literal("unknown"),
  message: Schema.String,
});

const Tokens = Schema.Struct({
  input: Schema.Int,
  output: Schema.Int,
  reasoning: Schema.Int,
  cache: Schema.Struct({ read: Schema.Int, write: Schema.Int }),
});

/** The session took a prompt: the user's message that starts a turn. */
export const Prompted = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.prompted"),
  data: Schema.Struct({
    ...inSession,
    messageID: Schema.String,
    prompt: Prompt,
    delivery: Schema.Literals(["steer", "queue"]),
  }),
});

/** A step started: one response of the model, given as the assistant message `assistantMessageID`. */
export const StepStarted = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.step.started"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    agent: Schema.String,
    model: ModelRef,
    snapshot: Schema.optionalKey(Schema.String),
  }),
});

/** A step ended, `finish` saying why, as AI SDK's finish reasons do. */
export const StepEnded = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.step.ended"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    finish: Schema.String,
    cost: Schema.Finite,
    tokens: Tokens,
    snapshot: Schema.optionalKey(Schema.String),
    files: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
});

/** A step failed, ending the turn. */
export const StepFailed = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.step.failed"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    error: SessionError,
  }),
});

export const TextStarted = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.text.started"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    textID: Schema.String,
  }),
});

/** A text of the step ended, with the whole text. */
export const TextEnded = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.text.ended"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    textID: Schema.String,
    text: Schema.String,
  }),
});

export const ReasoningStarted = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.reasoning.started"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    reasoningID: Schema.String,
  }),
});

/** A reasoning of the step ended, with the whole reasoning. */
export const ReasoningEnded = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.reasoning.ended"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    reasoningID: Schema.String,
    text: Schema.String,
    providerMetadata: Schema.optionalKey(ProviderMetadata),
  }),
});

/** The model started writing the input of a call to the tool `name`. */
export const ToolInputStarted = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.tool.input.started"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    callID: Schema.String,
    name: Schema.String,
  }),
});

/** The model finished writing a call's input, with the whole input as JSON text. */
export const ToolInputEnded = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.tool.input.ended"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    callID: Schema.String,
    text: Schema.String,
  }),
});

/** The model called the tool `tool` with `input`. */
export const ToolCalled = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.tool.called"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    callID: Schema.String,
    tool: Schema.String,
    input: Schema.Record(Schema.String, Schema.Unknown),
    provider: Provider,
  }),
});

/** A call succeeded: `content` is what the model reads, and `structured` what the tool reported. */
export const ToolSucceeded = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.tool.success"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    callID: Schema.String,
    structured: Schema.Record(Schema.String, Schema.Unknown),
    content: Schema.Array(ToolContent),
    outputPaths: Schema.optionalKey(Schema.Array(Schema.String)),
    result: Schema.optionalKey(Schema.Unknown),
    provider: Provider,
  }),
});

export const ToolFailed = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.tool.failed"),
  data: Schema.Struct({
    ...inSession,
    assistantMessageID: Schema.String,
    callID: Schema.String,
    error: SessionError,
    result: Schema.optionalKey(Schema.Unknown),
    provider: Provider,
  }),
});

/** The session started replacing its conversation so far with a summary. */
export const CompactionStarted = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.compaction.started"),
  data: Schema.Struct({
    ...inSession,
    messageID: Schema.String,
    reason: Schema.Literals(["auto", "manual"]),
  }),
});

/** The session replaced its conversation so far with the summary `text`. */
export const CompactionEnded = Schema.Struct({
  ...envelope,
  type: Schema.tag("session.next.compaction.ended"),
  data: Schema.Struct({
    ...inSession,
    messageID: Schema.String,
    reason: Schema.Literals(["auto", "manual"]),
    text: Schema.String,
    recent: Schema.String,
  }),
});

// TODO: Add the events of a person working in the session through opencode itself, such as
// `shell.started` and `revert.committed`, and of a switched agent or model, once a turn needs them.
export const SessionEvent = Schema.Union([
  Prompted,
  StepStarted,
  StepEnded,
  StepFailed,
  TextStarted,
  TextEnded,
  ReasoningStarted,
  ReasoningEnded,
  ToolInputStarted,
  ToolInputEnded,
  ToolCalled,
  ToolSucceeded,
  ToolFailed,
  CompactionStarted,
  CompactionEnded,
]).pipe(Schema.toTaggedUnion("type"));

export type SessionEvent = typeof SessionEvent.Type;
