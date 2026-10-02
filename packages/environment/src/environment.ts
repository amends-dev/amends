import type { ModelInference } from "@amends/connection/model-inference";
import { Harness, HarnessErrors } from "@amends/harness";
import type { HarnessImplementation, Transcript } from "@amends/harness";
import { Sandbox, SandboxErrors } from "@amends/sandbox";
import { Context, Crypto, Effect, Layer, Ref, Schema } from "effect";
import type { Scope } from "effect";
import { EnvironmentErrors } from "./errors.ts";
import { HarnessServer } from "./harness-server.ts";

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
  /**
   * Where the harness runs: in process, where the sandbox is only where its tools act, or inside
   * the sandbox, served by the harness server.
   */
  readonly harness: HarnessImplementation.Placement;
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
   * Starting one in the sandbox fails with `ExecutionFailed` when the harness server cannot start.
   */
  readonly startSession: (
    options: SessionOptions,
  ) => Effect.Effect<Harness.Session, HarnessErrors.ExecutionFailed, Scope.Scope>;
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
  | EnvironmentErrors.UnsupportedPlatform
  | SandboxErrors.SnapshotUnavailable
  | SandboxErrors.ProviderFailure;

export interface Interface {
  /**
   * Spawn a running environment for `definition`: find the harness and sandbox provider this host
   * installed, acquire the sandbox `reacquire` names if it still exists or a new one, restored
   * from `restore` when given, run its setup, and upload the harness server when the harness runs
   * inside it. Spawning receives no conversation history or work. A failure after acquiring fails
   * the spawn, stopping a reacquired sandbox or destroying a new one.
   */
  readonly spawn: (
    definition: Definition,
    options?: SpawnOptions,
  ) => Effect.Effect<Running, SpawnError>;
}

export class Service extends Context.Service<Service, Interface>()("@amends/environment/Service") {}

/**
 * The code a host runs environments with: the harnesses it runs in process, whose sessions use the
 * Effect AI model a connection supplies, its sandbox providers, each found by its ID, and the
 * harness server it uploads to run harnesses inside sandboxes.
 */
export interface Installed {
  readonly harnesses: ReadonlyArray<Harness.Interface<ModelInference.Services>>;
  readonly sandboxes?: ReadonlyArray<Sandbox.Provider> | undefined;
  readonly harnessServer?: HarnessServer.Program | undefined;
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

/** Runs a definition's setup commands in a sandbox, in order, each with `sh -c`. */
const runSetup = (sandbox: Sandbox.Running, setup: ReadonlyArray<string>) =>
  Effect.forEach(
    setup,
    (command) =>
      sandbox
        .exec({ argv: ["sh", "-c", command] })
        .pipe(
          Effect.flatMap((result) =>
            result.exitCode === 0
              ? Effect.void
              : Effect.fail(new EnvironmentErrors.SetupFailed({ command, ...result })),
          ),
        ),
    { discard: true },
  );

/** A session in the sandbox fails as `ended` when its harness server cannot be started. */
const serverFailed = (error: SandboxErrors.ProviderFailure) =>
  new HarnessErrors.ExecutionFailed({
    reason: `The harness server couldn't start: ${error.reason}`,
    retryable: error.retryable,
    problem: "ended",
  });

/**
 * Where a definition's harness runs on this host: in process without a sandbox, in process with a
 * sandbox where its tools act, or inside its sandbox, served by the harness server.
 */
type Placed =
  | { readonly _tag: "InProcess"; readonly harness: Harness.Interface<ModelInference.Services> }
  | {
      readonly _tag: "WithSandbox";
      readonly harness: Harness.Interface<ModelInference.Services>;
      readonly sandbox: SandboxDefinition;
    }
  | {
      readonly _tag: "InSandbox";
      readonly harnessId: Harness.Name;
      readonly program: HarnessServer.Program;
      readonly sandbox: SandboxDefinition;
    };

/** @category constructors */
export const make = Effect.fnUntraced(function* (installed: Installed) {
  const crypto = yield* Crypto.Crypto;
  const harnesses = new Map(
    installed.harnesses.map((harness) => [harness.declaration.id as string, harness]),
  );
  const sandboxes = new Map(
    (installed.sandboxes ?? []).map((provider) => [provider.name, provider]),
  );

  /** Where the definition's harness runs, if this host installed what it needs. */
  const placeHarness = (definition: Definition): Placed | undefined => {
    const { sandbox } = definition;
    if (sandbox?.harness === "in-sandbox") {
      const program = installed.harnessServer;
      const harnessId = Harness.Name.make(definition.harnessId);
      return program?.harnesses.includes(harnessId)
        ? { _tag: "InSandbox", harnessId, program, sandbox }
        : undefined;
    }
    const harness = harnesses.get(definition.harnessId);
    if (harness === undefined) return undefined;
    return sandbox === null
      ? { _tag: "InProcess", harness }
      : { _tag: "WithSandbox", harness, sandbox };
  };

  /** Starts a session of a harness this host runs in process, with Effect AI model access. */
  const startInProcess = (harness: Harness.Interface<ModelInference.Services>) =>
    Effect.fnUntraced(function* (options: SessionOptions) {
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
    });

  /** Starts a session in a harness server the sandbox runs from `executable`, one per session. */
  const startInSandbox = (harnessId: Harness.Name, sandbox: Sandbox.Running, executable: string) =>
    Effect.fnUntraced(function* (options: SessionOptions) {
      const process = yield* sandbox
        .spawn({ argv: [executable] })
        .pipe(Effect.mapError(serverFailed));
      return yield* HarnessServer.startSession(process, {
        harnessId,
        instructions: options.instructions,
        contextLimit: options.contextLimit,
        measured: options.measured,
        model: {
          implementationId: options.model.inference.declaration.id,
          access: options.model.access,
          selection: options.model.selection,
        },
      });
    });

  /** The running environment over how it starts sessions and, if any, its acquired sandbox. */
  const makeRunning = Effect.fnUntraced(function* (
    startSession: Running["startSession"],
    reference: Reference,
    filesystem: Filesystem,
    sandbox: { readonly running: Sandbox.Running; readonly retention: Retention } | undefined,
  ) {
    const released = yield* Ref.make(sandbox === undefined);
    const running: Running = {
      reference,
      filesystem,
      startSession,
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
    const placed = placeHarness(definition);
    if (placed === undefined)
      return yield* new EnvironmentErrors.HarnessUnavailable({ harnessId: definition.harnessId });
    const definitionId = DefinitionId.make(definition.id);
    const reacquire = options.reacquire;
    if (reacquire !== undefined && reacquire.definitionId !== definitionId)
      return yield* new EnvironmentErrors.ForeignReference({
        definitionId: reacquire.definitionId,
      });
    if (placed._tag === "InProcess") {
      if (options.restore !== undefined)
        return yield* new SandboxErrors.SnapshotUnavailable({
          reason: "This environment has no sandbox to restore into.",
        });
      return yield* makeRunning(
        startInProcess(placed.harness),
        { definitionId },
        { _tag: "None" },
        undefined,
      );
    }
    const provider = sandboxes.get(placed.sandbox.providerId);
    if (provider === undefined)
      return yield* new EnvironmentErrors.SandboxUnavailable({
        providerId: placed.sandbox.providerId,
      });
    const acquired = yield* provider.acquire({
      id: reacquire?.sandboxId,
      snapshot: options.restore,
      template: placed.sandbox.template ?? undefined,
      env: placed.sandbox.env,
    });
    const sandbox = acquired.sandbox;
    const startSession = yield* Effect.gen(function* () {
      yield* runSetup(sandbox, placed.sandbox.setup);
      if (placed._tag === "WithSandbox") return startInProcess(placed.harness);
      const executable = yield* HarnessServer.upload(sandbox, placed.program).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
      );
      return startInSandbox(placed.harnessId, sandbox, executable);
    }).pipe(Effect.onError(() => abandon(acquired)));
    return yield* makeRunning(
      startSession,
      { definitionId, sandboxId: sandbox.id },
      toFilesystem(acquired.filesystem, options.restore),
      { running: sandbox, retention: placed.sandbox.retention },
    );
  });

  return Service.of({ spawn });
});

/** @category layers */
export const layer = (installed: Installed) => Layer.effect(Service, make(installed));

export * as Environment from "./environment.ts";
