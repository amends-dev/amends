import type { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Harness, HarnessErrors } from "@amends/harness";
import type { HarnessImplementation, Transcript } from "@amends/harness";
import { Sandbox, SandboxErrors } from "@amends/sandbox";
import { Context, Crypto, Effect, Layer, Ref, Schema } from "effect";
import type { Scope } from "effect";
import { HttpClient } from "effect/http";
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
  /** The access of the connection the sandbox runs under, for a provider that runs under one. */
  readonly sandboxConnection?: ConnectionImplementation.Access | undefined;
}

/** What a harness session needs from the turn that starts it. */
export interface SessionOptions {
  /**
   * The session's ID, which the turn records before starting it. It is unique among the sessions
   * whose events share one log, and the IDs the session assigns begin with it.
   */
  readonly sessionId: string;
  /** The model access the session runs with: the connection's code and access, and the model. */
  readonly model: {
    readonly inference: ModelInference.Implementation;
    readonly access: ConnectionImplementation.Access;
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
   * Starts a harness session with the turn's model access. The turn sets up its history with
   * `prepare`. The session lives until the caller's scope closes, except that one inside the
   * sandbox goes on when the scope closes because the run was cut short, for a later run to
   * attach to. Starting one there fails with `ExecutionFailed` when the harness server is gone.
   */
  readonly startSession: (
    options: SessionOptions,
  ) => Effect.Effect<Harness.Session, HarnessErrors.ExecutionFailed, Scope.Scope>;
  /**
   * Attaches to a session started earlier in this environment that the harness server still holds,
   * as one a run cut short left at work: what it reported after the `recorded` events the turn
   * has, where it stands, and the session. Undefined when it is gone, as a session in process
   * always is once its run ends.
   */
  readonly attachSession: (session: {
    readonly sessionId: string;
    readonly recorded: number;
  }) => Effect.Effect<
    HarnessServer.Attached | undefined,
    HarnessErrors.ExecutionFailed,
    Scope.Scope
  >;
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
  | EnvironmentErrors.HarnessServerFailed
  | SandboxErrors.SnapshotUnavailable
  | SandboxErrors.ProviderFailure;

export interface Interface {
  /**
   * Spawn a running environment for `definition`: find the harness and sandbox implementation
   * this host installed, make its provider with the sandbox's connection for the scope, acquire the
   * sandbox `reacquire` names if it still exists or a new one, restored from `restore` when given,
   * run its setup, and, when the harness runs inside it, make sure a harness server runs there,
   * keeping one already running. Spawning receives no conversation history or work. A failure
   * after acquiring fails the spawn, stopping a reacquired sandbox or destroying a new one.
   */
  readonly spawn: (
    definition: Definition,
    options?: SpawnOptions,
  ) => Effect.Effect<Running, SpawnError, Scope.Scope>;
  /**
   * Applies `definition`'s retention to the sandbox `reference` names, without spawning, for one a
   * run that ended short left behind, through the provider made with `sandboxConnection`. Without a
   * sandbox, or one this host does not run, it does nothing. A sandbox already gone comes back new
   * from its provider, and is destroyed.
   */
  readonly release: (
    definition: Definition,
    reference: Reference,
    sandboxConnection?: ConnectionImplementation.Access,
  ) => Effect.Effect<void, SandboxErrors.SnapshotUnavailable | SandboxErrors.ProviderFailure>;
}

export class Service extends Context.Service<Service, Interface>()("@amends/environment/Service") {}

/**
 * The code a host runs environments with: the harnesses it runs in process, whose sessions use the
 * Effect AI model a connection supplies, its sandbox implementations, each found by the ID it
 * declares, and the harness server it uploads to run harnesses inside sandboxes.
 */
export interface Installed {
  readonly harnesses: ReadonlyArray<Harness.Interface<ModelInference.Services>>;
  readonly sandboxes?: ReadonlyArray<Sandbox.Implementation> | undefined;
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

/** Applies retention to an acquired sandbox: stops it, keeping its files, or destroys it. */
const applyRetention = (sandbox: Sandbox.Running, retention: Retention) =>
  retention === "destroy" ? sandbox.destroy : sandbox.stop;

/** @category constructors */
export const make = Effect.fnUntraced(function* (installed: Installed) {
  const crypto = yield* Crypto.Crypto;
  const httpClient = yield* HttpClient.HttpClient;
  const harnesses = new Map(
    installed.harnesses.map((harness) => [harness.declaration.id as string, harness]),
  );
  const sandboxes = new Map(
    (installed.sandboxes ?? []).map((implementation) => [
      implementation.declaration.id as string,
      implementation,
    ]),
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

  /** Stop the harness server a sandbox runs, before releasing the sandbox. */
  const stopHarnessServer = (sandbox: Sandbox.Running) =>
    HarnessServer.stopRunning(sandbox).pipe(
      Effect.provideService(HttpClient.HttpClient, httpClient),
    );

  /** Sessions of a harness this host runs in process, with Effect AI model access. */
  const inProcess = (
    harness: Harness.Interface<ModelInference.Services>,
  ): Pick<Running, "startSession" | "attachSession"> => ({
    startSession: Effect.fnUntraced(function* (options: SessionOptions) {
      const model = yield* Layer.build(
        options.model.inference.languageModel(options.model.access, options.model.selection),
      );
      return yield* harness
        .start({
          sessionId: options.sessionId,
          instructions: options.instructions,
          contextLimit: options.contextLimit,
          measured: options.measured,
        })
        .pipe(Effect.provideContext(model));
    }),
    attachSession: () => Effect.undefined,
  });

  /** Sessions of the harness server at `endpoint`, inside the sandbox. */
  const inSandbox = (
    harnessId: Harness.Name,
    endpoint: HarnessServer.Endpoint,
  ): Pick<Running, "startSession" | "attachSession"> => ({
    startSession: (options) =>
      HarnessServer.startSession(endpoint, {
        sessionId: options.sessionId,
        harnessId,
        instructions: options.instructions,
        contextLimit: options.contextLimit,
        measured: options.measured,
        model: {
          implementationId: options.model.inference.declaration.id,
          access: options.model.access,
          selection: options.model.selection,
        },
      }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient)),
    attachSession: (session) =>
      HarnessServer.attachSession(endpoint, session).pipe(
        Effect.provideService(HttpClient.HttpClient, httpClient),
      ),
  });

  /** The running environment over how it holds sessions and, if any, its acquired sandbox. */
  const makeRunning = Effect.fnUntraced(function* (
    sessions: Pick<Running, "startSession" | "attachSession">,
    reference: Reference,
    filesystem: Filesystem,
    sandbox:
      | {
          readonly running: Sandbox.Running;
          readonly retention: Retention;
          readonly harnessServer: boolean;
        }
      | undefined,
  ) {
    const released = yield* Ref.make(sandbox === undefined);
    const running: Running = {
      reference,
      filesystem,
      ...sessions,
      snapshot:
        sandbox === undefined
          ? Effect.fail(new SandboxErrors.Unsupported({ capability: "snapshots" }))
          : sandbox.running.snapshot,
      release: Effect.gen(function* () {
        if (sandbox === undefined || (yield* Ref.get(released))) return;
        if (sandbox.harnessServer) yield* stopHarnessServer(sandbox.running);
        yield* applyRetention(sandbox.running, sandbox.retention);
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
        inProcess(placed.harness),
        { definitionId },
        { _tag: "None" },
        undefined,
      );
    }
    const implementation = sandboxes.get(placed.sandbox.providerId);
    if (implementation === undefined)
      return yield* new EnvironmentErrors.SandboxUnavailable({
        providerId: placed.sandbox.providerId,
      });
    const provider = yield* implementation.provider(options.sandboxConnection);
    const acquired = yield* provider.acquire({
      id: reacquire?.sandboxId,
      snapshot: options.restore,
      template: placed.sandbox.template ?? undefined,
      env: placed.sandbox.env,
      labels: { "amends-environment": definitionId },
    });
    const sandbox = acquired.sandbox;
    const sessions = yield* Effect.gen(function* () {
      yield* runSetup(sandbox, placed.sandbox.setup);
      if (placed._tag === "WithSandbox") return inProcess(placed.harness);
      const endpoint = yield* HarnessServer.ensureRunning(sandbox, placed.program).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      );
      return inSandbox(placed.harnessId, endpoint);
    }).pipe(Effect.onError(() => abandon(acquired)));
    return yield* makeRunning(
      sessions,
      { definitionId, sandboxId: sandbox.id },
      toFilesystem(acquired.filesystem, options.restore),
      {
        running: sandbox,
        retention: placed.sandbox.retention,
        harnessServer: placed._tag === "InSandbox",
      },
    );
  });

  const release = Effect.fn("Environment.release")(function* (
    definition: Definition,
    reference: Reference,
    sandboxConnection?: ConnectionImplementation.Access,
  ) {
    const implementation =
      definition.sandbox === null ? undefined : sandboxes.get(definition.sandbox.providerId);
    if (
      definition.sandbox === null ||
      implementation === undefined ||
      reference.sandboxId === undefined
    )
      return;
    const provider = yield* implementation.provider(sandboxConnection);
    const acquired = yield* provider.acquire({ id: reference.sandboxId });
    if (acquired.filesystem !== "retained") return yield* acquired.sandbox.destroy;
    if (definition.sandbox.harness === "in-sandbox") yield* stopHarnessServer(acquired.sandbox);
    yield* applyRetention(acquired.sandbox, definition.sandbox.retention);
  }, Effect.scoped);

  return Service.of({ spawn, release });
});

/** @category layers */
export const layer = (installed: Installed) => Layer.effect(Service, make(installed));

export * as Environment from "./environment.ts";
