import { Schema } from "effect";
import { AiError } from "effect/ai";
import { Transcript } from "./transcript.ts";

/** A session was asked to act before its history was prepared. */
export class NotPrepared extends Schema.TaggedError<NotPrepared>()("Harness.NotPrepared", {}) {}

/** History is prepared once per session, before any work. */
export class AlreadyPrepared extends Schema.TaggedError<AlreadyPrepared>()(
  "Harness.AlreadyPrepared",
  {},
) {}

/** The transcript breaks the order every provider requires. */
export class InvalidTranscript extends Schema.TaggedError<InvalidTranscript>()(
  "Harness.InvalidTranscript",
  { reason: Schema.String },
) {}

/** The harness cannot prepare its native context from this transcript. */
export class Unsupported extends Schema.TaggedError<Unsupported>()("Harness.Unsupported", {
  reason: Schema.String,
}) {}

/** A result was supplied for a call that is not waiting for one from outside this session. */
export class NotPending extends Schema.TaggedError<NotPending>()("Harness.NotPending", {
  callId: Transcript.ToolCallId,
}) {}

/**
 * Why a session stopped, for the host to put in words for the turn's readers. The model's provider
 * refused the credential (`model-access`), has no quota left (`model-quota`), is limiting requests
 * (`model-rate-limit`), could not be reached (`model-unreachable`), failed on its side
 * (`model-provider`), declined the content (`model-content-policy`), refused a request longer than
 * its model's context window (`model-context`), or rejected the request otherwise
 * (`model-request`); the model's output could not be used (`model-output`), or it sent nothing for
 * too long (`model-silent`); the session or what it ran in ended first (`ended`); or something
 * else went wrong (`unexpected`).
 */
export const Problem = Schema.Literals([
  "model-access",
  "model-quota",
  "model-rate-limit",
  "model-unreachable",
  "model-provider",
  "model-content-policy",
  "model-context",
  "model-request",
  "model-output",
  "model-silent",
  "ended",
  "unexpected",
]);
export type Problem = typeof Problem.Type;

/**
 * The session stopped: its model or its own work failed. What it recorded before stopping stands,
 * so another session can continue from the transcript; `retryable` says whether trying the same
 * work again can succeed without a change. `problem` is what readers are told; `reason` is the
 * detail for the host's logs, which can name addresses and provider messages readers should not
 * see.
 */
export class ExecutionFailed extends Schema.TaggedError<ExecutionFailed>()(
  "Harness.ExecutionFailed",
  { reason: Schema.String, retryable: Schema.Boolean, problem: Problem },
) {}

/** How providers word refusing a request longer than their model's context window. */
const overflow =
  /prompt is too long|context[_ ]length|maximum context|context window|too many (?:input )?tokens|input is too long/iu;

const reasons: {
  readonly [Tag in AiError.AiErrorReason["_tag"]]: (
    reason: Extract<AiError.AiErrorReason, { readonly _tag: Tag }>,
  ) => Problem;
} = {
  AuthenticationError: () => "model-access",
  QuotaExhaustedError: () => "model-quota",
  RateLimitError: () => "model-rate-limit",
  NetworkError: (reason) =>
    reason.reason === "EncodeError" ? "model-request" : "model-unreachable",
  InternalProviderError: () => "model-provider",
  ContentPolicyError: () => "model-content-policy",
  InvalidRequestError: (reason) =>
    overflow.test([reason.description, reason.constraint, reason.http?.body].join(" "))
      ? "model-context"
      : "model-request",
  UnsupportedSchemaError: () => "model-request",
  ToolConfigurationError: () => "model-request",
  ToolkitRequiredError: () => "model-request",
  InvalidUserInputError: () => "model-request",
  InvalidOutputError: () => "model-output",
  StructuredOutputError: () => "model-output",
  ToolNotFoundError: () => "model-output",
  ToolParameterValidationError: () => "model-output",
  InvalidToolResultError: () => "model-output",
  ToolResultEncodingError: () => "model-output",
  UnknownError: () => "unexpected",
};

/** The problem a failure from Effect AI names, for harnesses and hosts that call models through it. */
export const modelProblem = (error: unknown): Problem =>
  AiError.isAiError(error)
    ? (reasons[error.reason._tag] as (reason: AiError.AiErrorReason) => Problem)(error.reason)
    : "unexpected";

/** A session failure from an Effect AI failure: its problem, and its message for the logs. */
export const fromModel = (error: unknown): ExecutionFailed =>
  new ExecutionFailed({
    reason: error instanceof Error ? error.message : String(error),
    retryable: AiError.isAiError(error) && error.isRetryable,
    problem: modelProblem(error),
  });

export * as HarnessErrors from "./errors.ts";
