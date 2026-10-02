import type { ModelInference } from "@amends/connection/model-inference";
import type { Harness, Transcript } from "@amends/harness";
import { Sandbox, SandboxErrors } from "@amends/sandbox";
import { Context, Crypto, Effect, Layer, Ref, Schema } from "effect";
import type { Scope } from "effect";
import { EnvironmentErrors } from "./errors.ts";

export const DefinitionId = Schema.NonEmptyString.pipe(Schema.brand("EnvironmentDefinitionId"));
export type DefinitionId = typeof DefinitionId.Type;

/**
 * What releasing a running environment does with its sandbox: stop it, keeping its files so it can
 * be acquired again, or destroy it. Provisional: the core model leaves retention settings open, and
 * these are the two the sandbox contract supports.
 */
export type Retention = "stop" | "destroy";

/** The sandbox a stored environment runs with. */
export interface SandboxDefinition {
  /** The sandbox provider, by the ID it declares, such as `daytona`. */
  readonly providerId: string;
  /** The provider's starting point for a new sandbox, such as an image or a snapshot name. */
  readonly template: string | null;
  /** Environment variables every command in a new sandbox receives. */
  readonly env: Readonly<Record<string, string>>;
  /**
   * Shell commands that install and initialize what the harness depends on, run in order on every
   * spawn before the harness starts. Each must succeed, and be safe to repeat on a sandbox acquired
   * again.
   */
  readonly setup: ReadonlyArray<string>;
  readonly retention: Retention;
}

/**
 * An environment as a workspace stores it: the harness it runs, by the ID the harness declares, and
 * the sandbox it runs with. Without a sandbox, the harness runs in process.
 */
export interface Definition {
  readonly id: string;
  readonly harnessId: string;
  readonly sandbox: SandboxDefinition | null;
}

/**
 * Identifies a running environment so it can be acquired again: the definition and, with a sandbox,
 * the sandbox's ID. It names what was asked for; it does not prove the sandbox or its files survived.
 */
export const Reference = Schema.Struct({
  definitionId: DefinitionId,
  sandboxId: Schema.optionalKey(Sandbox.Id),
});
export interface Reference extends Schema.Schema.Type<typeof Reference> {}

/** Where a running environment's files came from. */
export const Filesystem = Schema.TaggedUnion({
  /** The environment has no sandbox. */
  None: {},
  Retained: {},
  /** Restored from this snapshot, so the turn can compare it with the history it requires. */
  Restored: { snapshot: Sandbox.SnapshotReference },
  Fresh: {},
});
export type Filesystem = typeof Filesystem.Type;

export interface SpawnOptions {
  /** A running environment to acquire again, as recorded when it was spawned. */
  readonly reacquire?: Reference | undefined;
  /** A snapshot to restore when no sandbox is asked for, or the one asked for is gone. */
  readonly restore?: Sandbox.SnapshotReference | undefined;
}

/** What a harness session needs from the turn that starts it. */
export interface SessionOptions {
  /** The model access the session runs with: the connection's code and access, and the model. */
  readonly model: {
    readonly inference: ModelInference.Implementation;
    readonly access: ModelInference.Access;
    readonly selection: ModelInference.Selection;
  };
  readonly instructions?: string | undefined;
  /** The most tokens one model request may carry, for the harness to keep within. */
  readonly contextLimit?: number | undefined;
  /** What a provider measured of the transcript the session is prepared with. */
  readonly measured?: Transcript.Measured | undefined;
}

/**
 * A spawned environment. A turn starts a harness session in it for each attempt, and releases it
 * once the turn is done with it.
 */
export interface Running {
  readonly reference: Reference;
  readonly filesystem: Filesystem;
  /**
   * Starts a harness session with the turn's model access, under a session ID of its own. The
   * session lives until the caller's scope closes; the turn sets up its history with `prepare`.
   */
  readonly startSession: (
    options: SessionOptions,
  ) => Effect.Effect<Harness.Session, never, Scope.Scope>;
  /** Captures the sandbox's files. */
  readonly snapshot: Effect.Effect<
    Sandbox.SnapshotReference,
    SandboxErrors.Unsupported | SandboxErrors.ProviderFailure
  >;
  /**
   * Applies the environment's retention to its sandbox: stops it, keeping its files, or destroys
   * it. Repeating it after it succeeded does nothing, and after a failure retries. An environment
   * never released keeps its sandbox as it is, for a later run to acquire again.
   */
  readonly release: Effect.Effect<void, SandboxErrors.ProviderFailure>;
}

export type SpawnError =
  | EnvironmentErrors.HarnessUnavailable
  | EnvironmentErrors.SandboxUnavailable
  | EnvironmentErrors.ForeignReference
  | EnvironmentErrors.SetupFailed
  | SandboxErrors.SnapshotUnavailable
  | SandboxErrors.ProviderFailure;

export interface Interface {
  /**
   * Spawn a running environment for `definition`: find the harness and sandbox provider this host
   * installed, acquire the sandbox `reacquire` names if it still exists or a new one, restored
   * from `restore` when given, and run its setup. Spawning receives no conversation history or
   * work. A setup failure fails the spawn, stopping a reacquired sandbox or destroying a new one.
   */
  readonly spawn: (
    definition: Definition,
    options?: SpawnOptions,
  ) => Effect.Effect<Running, SpawnError>;
}

export class Service extends Context.Service<Service, Interface>()("@amends/environment/Service") {}

/**
 * The code a host runs environments with: the harnesses it runs in process, whose sessions use the
 * Effect AI model a connection supplies, and its sandbox providers, each found by its ID.
 */
export interface Installed {
  readonly harnesses: ReadonlyArray<Harness.Interface<ModelInference.Services>>;
  readonly sandboxes?: ReadonlyArray<Sandbox.Provider> | undefined;
}

const toFilesystem = (
  outcome: Sandbox.Filesystem,
  restore: Sandbox.SnapshotReference | undefined,
): Filesystem =>
  outcome === "restored" && restore !== undefined
    ? { _tag: "Restored", snapshot: restore }
    : { _tag: outcome === "retained" ? "Retained" : "Fresh" };

/** Undoes an acquisition spawning could not finish, without destroying a sandbox it only reacquired. */
const abandon = (acquired: Sandbox.Acquired) =>
  Effect.ignore(
    acquired.filesystem === "retained" ? acquired.sandbox.stop : acquired.sandbox.destroy,
  );

/** Acquires the sandbox a definition asks for and runs its setup in it, in order. */
const acquireSandbox = Effect.fnUntraced(function* (
  provider: Sandbox.Provider,
  definition: SandboxDefinition,
  options: SpawnOptions,
) {
  const acquired = yield* provider.acquire({
    id: options.reacquire?.sandboxId,
    snapshot: options.restore,
    template: definition.template ?? undefined,
    env: definition.env,
  });
  yield* Effect.forEach(
    definition.setup,
    (command) =>
      acquired.sandbox
        .exec({ argv: ["sh", "-c", command] })
        .pipe(
          Effect.flatMap((result) =>
            result.exitCode === 0
              ? Effect.void
              : Effect.fail(new EnvironmentErrors.SetupFailed({ command, ...result })),
          ),
        ),
    { discard: true },
  ).pipe(Effect.onError(() => abandon(acquired)));
  return acquired;
});

/** @category constructors */
export const make = Effect.fnUntraced(function* (installed: Installed) {
  const crypto = yield* Crypto.Crypto;
  const harnesses = new Map(
    installed.harnesses.map((harness) => [harness.declaration.id as string, harness]),
  );
  const sandboxes = new Map(
    (installed.sandboxes ?? []).map((provider) => [provider.name, provider]),
  );

  /** The running environment over a started harness and, if any, its acquired sandbox. */
  const makeRunning = Effect.fnUntraced(function* (
    harness: Harness.Interface<ModelInference.Services>,
    reference: Reference,
    filesystem: Filesystem,
    sandbox: { readonly running: Sandbox.Running; readonly retention: Retention } | undefined,
  ) {
    const released = yield* Ref.make(sandbox === undefined);
    const running: Running = {
      reference,
      filesystem,
      startSession: Effect.fnUntraced(function* (options: SessionOptions) {
        const sessionId = `session-${yield* Effect.orDie(crypto.randomUUIDv4)}`;
        const model = yield* Layer.build(
          options.model.inference.languageModel(options.model.access, options.model.selection),
        );
        return yield* harness
          .start({
            sessionId,
            instructions: options.instructions,
            contextLimit: options.contextLimit,
            measured: options.measured,
          })
          .pipe(Effect.provideContext(model));
      }),
      snapshot:
        sandbox === undefined
          ? Effect.fail(new SandboxErrors.Unsupported({ capability: "snapshots" }))
          : sandbox.running.snapshot,
      release: Effect.gen(function* () {
        if (sandbox === undefined || (yield* Ref.get(released))) return;
        yield* sandbox.retention === "destroy" ? sandbox.running.destroy : sandbox.running.stop;
        yield* Ref.set(released, true);
      }),
    };
    return running;
  });

  const spawn = Effect.fn("Environment.spawn")(function* (
    definition: Definition,
    options: SpawnOptions = {},
  ) {
    const harness = harnesses.get(definition.harnessId);
    if (harness === undefined)
      return yield* new EnvironmentErrors.HarnessUnavailable({ harnessId: definition.harnessId });
    const definitionId = DefinitionId.make(definition.id);
    const reacquire = options.reacquire;
    if (reacquire !== undefined && reacquire.definitionId !== definitionId)
      return yield* new EnvironmentErrors.ForeignReference({
        definitionId: reacquire.definitionId,
      });
    if (definition.sandbox === null) {
      if (options.restore !== undefined)
        return yield* new SandboxErrors.SnapshotUnavailable({
          reason: "This environment has no sandbox to restore into.",
        });
      return yield* makeRunning(harness, { definitionId }, { _tag: "None" }, undefined);
    }
    const provider = sandboxes.get(definition.sandbox.providerId);
    if (provider === undefined)
      return yield* new EnvironmentErrors.SandboxUnavailable({
        providerId: definition.sandbox.providerId,
      });
    const acquired = yield* acquireSandbox(provider, definition.sandbox, options);
    return yield* makeRunning(
      harness,
      { definitionId, sandboxId: acquired.sandbox.id },
      toFilesystem(acquired.filesystem, options.restore),
      { running: acquired.sandbox, retention: definition.sandbox.retention },
    );
  });

  return Service.of({ spawn });
});

/** @category layers */
export const layer = (installed: Installed) => Layer.effect(Service, make(installed));

export * as Environment from "./environment.ts";
