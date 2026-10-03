import type { Harness } from "@amends/harness";
import type { Effect, Layer, Scope } from "effect";

/** What the model under a test does: answer each request with the next reply, or refuse its key. */
export interface Script {
  /** The text the model answers each request with, in order. */
  readonly replies: ReadonlyArray<string>;
  /** The model's provider refuses the key, so every request fails. */
  readonly refuseKey?: boolean | undefined;
}

/** Model access for one test, and what the harness sent it. */
export interface Model<R> {
  /** What the harness's sessions need to reach the model. */
  readonly layer: Layer.Layer<R>;
  /** Each request the model received so far, as text the suites search, in order. */
  readonly requests: Effect.Effect<ReadonlyArray<string>>;
}

/**
 * What a harness adapter supplies to run the conformance suites against itself. It is called the
 * subject, as `Harness` names what is under test.
 */
export interface Subject<R> {
  /** Names the harness in suite titles. */
  readonly name: string;
  /** False skips every suite, for a harness this machine cannot run, such as one not installed. */
  readonly available: boolean;
  /** The harness under test, for one test's scope. */
  readonly harness: Effect.Effect<Harness.Interface<R>, never, Scope.Scope>;
  /** A model following `script`, for one test's scope, which the harness reaches as it would a real one. */
  readonly model: (script: Script) => Effect.Effect<Model<R>, never, Scope.Scope>;
  /** How long one test may take, in milliseconds; a harness that runs a program needs longer. */
  readonly timeout: number;
}

export * as Subject from "./subject.ts";
