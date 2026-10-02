import type { Sandbox } from "@amends/sandbox";
import type { Effect, Layer, Scope } from "effect";
import type { HttpClient } from "effect/http";

/** What a sandbox provider adapter supplies to run the conformance suites against itself. */
export interface Harness {
  /** Names the provider in suite titles. */
  readonly name: string;
  /** False skips every suite, for a provider this machine cannot reach, such as without a key. */
  readonly available: boolean;
  /** The provider under test, for one test's scope. */
  readonly provider: Effect.Effect<Sandbox.Provider, never, Scope.Scope>;
  /**
   * Options for every sandbox the suites acquire. The sandbox needs `sh`, `cat`, `sleep`, and
   * `python3`.
   */
  readonly options?: Sandbox.AcquireOptions | undefined;
  /** A port no concurrent test listens on, for the port suite. */
  readonly port: Effect.Effect<number>;
  /** How long one test may take, in milliseconds; hosted providers need longer. */
  readonly timeout: number;
  /** HTTP for requests to exposed ports. */
  readonly http: Layer.Layer<HttpClient.HttpClient>;
}

export * as Harness from "./harness.ts";
