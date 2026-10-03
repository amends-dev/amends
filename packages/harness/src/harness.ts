import { Schema } from "effect";
import type { Effect, Scope, Stream } from "effect";
import type { HarnessErrors } from "./errors.ts";
import type { HarnessEvent } from "./event.ts";
import type { HarnessImplementation } from "./implementation.ts";
import type { HarnessTool } from "./tool.ts";
import type { Transcript } from "./transcript.ts";

/** Identifies a harness implementation, such as `amends`; it keys the native data it records. */
export const Name = Schema.NonEmptyString.pipe(Schema.brand("HarnessName"));
export type Name = typeof Name.Type;

/** How a harness can continue work it did not start. */
export interface Capabilities {
  /** It prepares its native context from any valid transcript, including another harness's. */
  readonly transcript: boolean;
  /** It takes the result of a tool call that an earlier session left pending. */
  readonly pendingToolCalls: boolean;
}

export interface StartOptions {
  /**
   * Unique among the sessions whose events share one log; the IDs a session assigns begin with
   * it, so they stay unique when the log's transcript moves to another session.
   */
  readonly sessionId: string;
  readonly instructions?: string | undefined;
  readonly tools?: HarnessTool.Tools | undefined;
  /**
   * The most tokens one model request may carry. A harness that honors it reports `ContextFull`
   * instead of making a request it estimates over the limit, and does nothing more; one that does
   * not runs until its provider refuses.
   */
  readonly contextLimit?: number | undefined;
  /** What a provider measured of the transcript given to `prepare`, for estimating what follows. */
  readonly measured?: Transcript.Measured | undefined;
}

/**
 * A running harness. History is prepared first, then work arrives as input, as results for
 * calls an earlier session left pending, or as a request to resume. The session works whenever it
 * has something to do and reports everything through `events`.
 */
export interface Session {
  /**
   * Sets the conversation to continue, before any other operation. Preparing starts no work: a
   * transcript that awaits a response gets one after `resume`. It fails with `ExecutionFailed`
   * when the harness could not set up its own session, such as one running in a sandbox that ended.
   */
  readonly prepare: (
    transcript: ReadonlyArray<Transcript.Item>,
  ) => Effect.Effect<
    void,
    | HarnessErrors.AlreadyPrepared
    | HarnessErrors.InvalidTranscript
    | HarnessErrors.Unsupported
    | HarnessErrors.ExecutionFailed
  >;
  /**
   * Hands over input. The session takes it in once no tool call is waiting, before its next
   * model request, and reports `InputIncorporated`; input submitted meanwhile waits for that point.
   */
  readonly submit: (
    batch: HarnessEvent.InputBatch,
  ) => Effect.Effect<void, HarnessErrors.NotPrepared | HarnessErrors.ExecutionFailed>;
  /** Answers a call the prepared transcript left pending, and carries on from its result. */
  readonly resolve: (
    callId: Transcript.ToolCallId,
    outcome: Transcript.ToolOutcome,
  ) => Effect.Effect<
    void,
    HarnessErrors.NotPrepared | HarnessErrors.NotPending | HarnessErrors.ExecutionFailed
  >;
  /** Continues the prepared transcript, reporting `Idle` when nothing is owed. */
  readonly resume: Effect.Effect<void, HarnessErrors.NotPrepared | HarnessErrors.ExecutionFailed>;
  /**
   * Everything the session reports, in order, for one consumer. It fails when the session stops
   * and ends when the session's scope closes.
   */
  readonly events: Stream.Stream<HarnessEvent.Event, HarnessErrors.ExecutionFailed>;
}

/**
 * A harness implementation: what it declares to a host's catalog, and its code. `R` is what its
 * sessions need from their environment, such as model access; a session lives until its scope
 * closes.
 */
export interface Interface<R = never> {
  readonly declaration: HarnessImplementation.Declaration;
  readonly capabilities: Capabilities;
  readonly start: (options: StartOptions) => Effect.Effect<Session, never, Scope.Scope | R>;
}

export * as Harness from "./harness.ts";
