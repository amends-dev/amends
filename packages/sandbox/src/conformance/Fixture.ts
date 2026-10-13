/**
 * What a provider gives the conformance suites: how to make the provider, and what the suites
 * cannot assume of every platform.
 *
 * @since 0.1.0
 */
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/http/HttpClient";
import type * as ChildProcess from "effect/process/ChildProcess";
import type { Port } from "../Network.ts";
import type { SandboxProvider } from "../SandboxProvider.ts";

/**
 * What a provider's tests give `run`: how to make the provider, and what the suites cannot assume
 * of every platform. `R` is what making the provider needs, which `layer` provides.
 *
 * @category testing
 * @since 0.1.0
 */
export interface Fixture<R> {
  /**
   * Provides what the fixture's effects need, and the HTTP client the network suite reaches ports
   * with.
   */
  readonly layer: Layer.Layer<R | HttpClient.HttpClient, unknown>;

  /** Makes the provider under test, for one test. */
  readonly makeProvider: Effect.Effect<SandboxProvider["Service"], unknown, R | Scope.Scope>;

  /** A port to create a sandbox with, on which nothing in that sandbox listens yet. */
  readonly freePort: Effect.Effect<Port, unknown, R>;

  /**
   * A command that serves HTTP on `port`, where the sandbox's endpoint for the port reaches it,
   * answering each request with its headers as a JSON object, under their names in lowercase.
   */
  readonly serveHeaders: (port: Port) => ChildProcess.Command;

  /** How many milliseconds a test may take, more than the default for a provider on the network. */
  readonly timeout?: number;
}
