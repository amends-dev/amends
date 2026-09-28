import { HarnessEvent } from "@amends/harness";
import type { Harness, HarnessErrors, HarnessTool, Transcript } from "@amends/harness";
import { Sandbox, SandboxErrors } from "@amends/sandbox";
import { Effect, Exit, Queue, Ref, Schema, Scope, Stream } from "effect";
import type { Cause } from "effect";
import { EnvironmentErrors } from "./errors.ts";

export const DefinitionId = Schema.NonEmptyString.pipe(Schema.brand("EnvironmentDefinitionId"));
export type DefinitionId = typeof DefinitionId.Type;

/**
 * What releasing a running environment does with its sandbox: stop it, keeping its files so it can
 * be acquired again, or destroy it. Provisional: the core model leaves retention settings open, and
 * these are the two the sandbox contract supports.
 */
export type Retention = "stop" | "destroy";

/** The sandbox part of a definition. */
export interface SandboxSetup {
  readonly provider: Sandbox.Provider;
  /** How a new sandbox is acquired: its template, environment, and labels. */
  readonly options?: Pick<Sandbox.AcquireOptions, "template" | "env" | "labels"> | undefined;
  /**
   * Installation and initialization the harness depends on, run in order on every spawn before
   * the harness starts. Each must succeed, and be safe to repeat on a sandbox acquired again.
   */
  readonly setup?: ReadonlyArray<Sandbox.Command> | undefined;
  readonly retention: Retention;
}

/**
 * A reusable environment: a harness, the sandbox it runs with, and the setup that prepares them.
 * Without a sandbox, execution runs in process. `R` is what the harness's sessions need, such as
 * model access, which whoever spawns supplies.
 */
export interface Definition<R = never> {
  readonly id: DefinitionId;
  readonly harness: Harness.Interface<R>;
  readonly sandbox?: SandboxSetup | undefined;
}

/**
 * Identifies a running environment so it can be acquired again, as a turn records its
 * `environmentId`. It names what was asked for; it does not prove the sandbox or its files survived.
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

/**
 * What spawning actually provided. The filesystem and the harness's context are reported apart:
 * files can come back while the harness still needs its history set up.
 */
export const Acquisition = Schema.Struct({
  filesystem: Filesystem,
  /** Whether the harness kept an earlier session's context, or needs history setup. */
  harness: Schema.Literals(["retained", "needs-setup"]),
});
export interface Acquisition extends Schema.Schema.Type<typeof Acquisition> {}

/** What the environment reports about itself. */
export const Lifecycle = Schema.TaggedUnion({
  /** Spawning finished: the environment can take history and input. */
  Ready: { reference: Reference, acquisition: Acquisition },
  /**
   * The sandbox captured its files. Its place among the harness's events is the history position
   * the snapshot belongs to.
   */
  SnapshotTaken: { snapshot: Sandbox.SnapshotReference },
  /** The environment was released and its retention applied; nothing follows. */
  Released: {},
});
export type Lifecycle = typeof Lifecycle.Type;

/**
 * One event from a running environment: a harness event as the harness reported it, or the
 * environment's own. The envelope names the source without changing the harness's schema.
 */
export const Event = Schema.TaggedUnion({
  Harness: { event: HarnessEvent.Event },
  Environment: { event: Lifecycle },
});
export type Event = typeof Event.Type;

/** What spawning receives: never conversation history or work to do. */
export interface SpawnOptions {
  /** A running environment to acquire again, as recorded when it was spawned. */
  readonly reacquire?: Reference | undefined;
  /** A snapshot to restore when no sandbox is asked for, or the one asked for is gone. */
  readonly restore?: Sandbox.SnapshotReference | undefined;
  /** The harness session's ID, unique among the sessions whose events share one log. */
  readonly sessionId: string;
  readonly instructions?: string | undefined;
  readonly tools?: HarnessTool.Tools | undefined;
}

/**
 * A spawned environment. History setup and input go through it to the harness, as the harness
 * session's operations do; after `release`, they fail with `Released`.
 */
export interface Running {
  readonly reference: Reference;
  readonly acquisition: Acquisition;
  readonly prepare: (
    transcript: ReadonlyArray<Transcript.Item>,
  ) => Effect.Effect<
    void,
    | HarnessErrors.AlreadyPrepared
    | HarnessErrors.InvalidTranscript
    | HarnessErrors.Unsupported
    | EnvironmentErrors.Released
  >;
  readonly submit: (
    batch: HarnessEvent.InputBatch,
  ) => Effect.Effect<
    void,
    HarnessErrors.NotPrepared | HarnessErrors.ExecutionFailed | EnvironmentErrors.Released
  >;
  readonly resolve: (
    callId: Transcript.ToolCallId,
    outcome: Transcript.ToolOutcome,
  ) => Effect.Effect<
    void,
    | HarnessErrors.NotPrepared
    | HarnessErrors.NotPending
    | HarnessErrors.ExecutionFailed
    | EnvironmentErrors.Released
  >;
  readonly resume: Effect.Effect<
    void,
    HarnessErrors.NotPrepared | HarnessErrors.ExecutionFailed | EnvironmentErrors.Released
  >;
  /**
   * Everything the environment reports, in order, for one consumer: `Ready` first, then harness
   * events and snapshots, then `Released`. It fails when the harness stops.
   */
  readonly events: Stream.Stream<Event, HarnessErrors.ExecutionFailed>;
  /** Captures the sandbox's files, reporting `SnapshotTaken`. */
  readonly snapshot: Effect.Effect<
    Sandbox.SnapshotReference,
    SandboxErrors.Unsupported | SandboxErrors.ProviderFailure | EnvironmentErrors.Released
  >;
  /**
   * Ends the harness session and applies the definition's retention to the sandbox. The turn
   * releases; what happens to the sandbox is the environment's policy. Repeating it after it
   * succeeded does nothing, and after a failure retries what remains.
   */
  readonly release: Effect.Effect<void, SandboxErrors.ProviderFailure>;
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

/** Acquires the sandbox and runs the definition's setup in it. */
const prepareSandbox = Effect.fnUntraced(function* (setup: SandboxSetup, options: SpawnOptions) {
  const acquired = yield* setup.provider.acquire({
    ...setup.options,
    id: options.reacquire?.sandboxId,
    snapshot: options.restore,
  });
  yield* Effect.forEach(
    setup.setup ?? [],
    (command) =>
      acquired.sandbox
        .exec(command)
        .pipe(
          Effect.flatMap((result) =>
            result.exitCode === 0
              ? Effect.void
              : Effect.fail(new EnvironmentErrors.SetupFailed({ argv: command.argv, ...result })),
          ),
        ),
    { discard: true },
  ).pipe(Effect.onError(() => abandon(acquired)));
  return acquired;
});

/**
 * Spawns a running environment from `definition`: acquires or reacquires its sandbox, restoring
 * `restore` where needed, runs its setup, then starts the harness. It receives no conversation
 * history or work; a setup failure fails the spawn, stopping a reacquired sandbox or destroying a
 * new one. The harness always starts a new session, so its context needs history setup.
 * The harness session lives until `release` or the enclosing scope closes; closing the scope
 * leaves the sandbox as it is, for recovery to acquire again.
 */
export const spawn = Effect.fnUntraced(function* <R>(
  definition: Definition<R>,
  options: SpawnOptions,
) {
  const reacquire = options.reacquire;
  if (reacquire !== undefined && reacquire.definitionId !== definition.id)
    return yield* new EnvironmentErrors.ForeignReference({ definitionId: reacquire.definitionId });
  const setup = definition.sandbox;
  if (setup === undefined && options.restore !== undefined)
    return yield* new SandboxErrors.SnapshotUnavailable({
      reason: "This environment has no sandbox to restore into.",
    });
  const acquired = setup === undefined ? undefined : yield* prepareSandbox(setup, options);
  const sandbox = acquired?.sandbox;

  const sessionScope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(sessionScope, Exit.void));
  const session = yield* definition.harness
    .start({
      sessionId: options.sessionId,
      instructions: options.instructions,
      tools: options.tools,
    })
    .pipe(
      Scope.provide(sessionScope),
      Effect.onInterrupt(() => (acquired === undefined ? Effect.void : abandon(acquired))),
    );

  const reference: Reference = {
    definitionId: definition.id,
    ...(sandbox !== undefined && { sandboxId: sandbox.id }),
  };
  const acquisition: Acquisition = {
    filesystem:
      acquired === undefined
        ? { _tag: "None" }
        : toFilesystem(acquired.filesystem, options.restore),
    harness: "needs-setup",
  };

  const events = yield* Queue.unbounded<Event, HarnessErrors.ExecutionFailed | Cause.Done>();
  const report = (event: Lifecycle) =>
    Queue.offer(events, { _tag: "Environment", event }).pipe(Effect.asVoid);
  yield* report({ _tag: "Ready", reference, acquisition });
  yield* session.events.pipe(
    Stream.runForEach((event) => Queue.offer(events, { _tag: "Harness", event })),
    Effect.catch((failure) => Queue.fail(events, failure)),
    Effect.forkIn(sessionScope),
  );

  const released = yield* Ref.make(false);
  const sandboxReleased = yield* Ref.make(sandbox === undefined);
  const announced = yield* Ref.make(false);
  const live = <A, E>(
    effect: Effect.Effect<A, E>,
  ): Effect.Effect<A, E | EnvironmentErrors.Released> =>
    Effect.gen(function* () {
      if (yield* Ref.get(released)) return yield* new EnvironmentErrors.Released();
      return yield* effect;
    });

  const running: Running = {
    reference,
    acquisition,
    prepare: (transcript) => live(session.prepare(transcript)),
    submit: (batch) => live(session.submit(batch)),
    resolve: (callId, outcome) => live(session.resolve(callId, outcome)),
    resume: live(session.resume),
    events: Stream.fromQueue(events),
    snapshot: live(
      sandbox === undefined
        ? Effect.fail(new SandboxErrors.Unsupported({ capability: "snapshots" }))
        : sandbox.snapshot.pipe(
            Effect.tap((snapshot) => report({ _tag: "SnapshotTaken", snapshot })),
          ),
    ),
    release: Effect.gen(function* () {
      yield* Ref.set(released, true);
      yield* Scope.close(sessionScope, Exit.void);
      if (sandbox !== undefined && !(yield* Ref.get(sandboxReleased))) {
        yield* setup?.retention === "destroy" ? sandbox.destroy : sandbox.stop;
        yield* Ref.set(sandboxReleased, true);
      }
      if (!(yield* Ref.getAndSet(announced, true))) {
        yield* report({ _tag: "Released" });
        yield* Queue.end(events);
      }
    }),
  };
  return running;
});

export * as Environment from "./environment.ts";
