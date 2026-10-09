/**
 * What a provider gives the conformance suites, and what the suites make of it for each test: a
 * provider that destroys the sandboxes the test created when it ends, and names no other test or
 * run uses.
 *
 * @since 0.1.0
 */
import { Clock, Effect, type Layer, Random, type Scope } from "effect";
import type { HttpClient } from "effect/http";
import type { ChildProcess } from "effect/process";
import type { Port } from "../Network.ts";
import { type Sandbox, SandboxId } from "../Sandbox.ts";
import { SandboxProvider } from "../SandboxProvider.ts";

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

/**
 * The fixture's provider for one test, which destroys every sandbox the test created with it when
 * the test ends.
 */
export const useProvider = <R>(fixture: Fixture<R>) =>
  Effect.gen(function* () {
    const provider = yield* fixture.makeProvider;
    const created = new Set<Sandbox["Service"]["id"]>();
    yield* Effect.addFinalizer(() =>
      Effect.forEach(
        created,
        (id) =>
          provider.resume(id).pipe(
            Effect.flatMap((sandbox) => sandbox.destroy),
            Effect.ignore,
          ),
        { concurrency: "unbounded", discard: true },
      ),
    );
    return SandboxProvider.of({
      create: (options) =>
        Effect.tap(provider.create(options), (sandbox) =>
          Effect.sync(() => created.add(sandbox.id)),
        ),
      resume: provider.resume,
    });
  });

/** A name no other test or run uses, starting with `prefix`. */
const uniqueName = (prefix: string) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const random = yield* Random.nextIntBetween(0, 2 ** 31);
    return `${prefix}-${now.toString(36)}-${random.toString(36)}`;
  });

/** An id for a sandbox that no other test or run uses. */
export const newSandboxId = Effect.map(uniqueName("conformance"), (name) => SandboxId.make(name));

/** An identity for a template that no other test or run prepares. */
export const newIdentity = (name: string) => uniqueName(`conformance-${name}`);
