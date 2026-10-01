import * as Core from "@amends/core";
import { Authorization } from "@amends/core/authorization";
import { type BackgroundProcess, BackgroundRuns } from "@amends/core/background";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Projection, Store } from "@amends/core/journal";
import {
  type Member,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Request } from "@amends/core/request";
import type { TurnExecution } from "@amends/core/turn";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { Cause } from "effect";
import type { Scope } from "effect";
import { GatewayErrors } from "./errors.ts";
import type { SignalHub } from "./signals.ts";
import { WorkspaceStorage } from "./storage.ts";
import type { WorkspaceTurns } from "./turns.ts";
import type { WorkspaceWakes } from "./wakes.ts";
import { WorkspaceRuntime } from "./workspace-runtime.ts";

export interface Interface {
  /** Keep the workspace lease and operation resources in the caller's scope, including response streams. */
  readonly asMemberScoped: <A, E, R extends Core.Operations | Actor.Service | Scope.Scope>(
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, GatewayErrors.ExposedError<E> | GatewayErrors.NotMember, Scope.Scope>;
  /**
   * Allocate a workspace ID and run core initialization for its creator. The
   * caller has authenticated the creator and checked their entitlement.
   */
  readonly createWorkspace: (
    creator: Identity.HumanId,
    input: Workspace.CreateInput,
    options?: Request.Options,
  ) => Effect.Effect<
    Workspace.Record,
    GatewayErrors.Conflict | GatewayErrors.Uncertain | GatewayErrors.InvalidInput
  >;
  /**
   * Run core operations in a workspace without an actor: invitation acceptance,
   * where the recipient is not yet a member. Programs may require only core's
   * application services, never its stores or journal. A workspace that was never
   * created returns WorkspaceNotFound without being prepared.
   */
  readonly inWorkspace: <A, E, R extends Core.Operations>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, GatewayErrors.ExposedError<E> | GatewayErrors.WorkspaceNotFound>;
  /**
   * Run core operations as the identity's active membership. Membership is resolved before the
   * workspace is prepared, so a non-member or an unknown workspace returns NotMember without
   * loading it. Core rechecks membership and permissions per operation; writes do so inside
   * their transaction.
   */
  readonly asMember: <A, E, R extends Core.Operations | Actor.Service>(
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, GatewayErrors.ExposedError<E> | GatewayErrors.NotMember>;
  /**
   * Run one of a workspace's background processes once, for the host process that runs its
   * background work when a wake arrives, and report what it left outstanding. It has no actor:
   * the process acts as itself. A workspace that was never created returns WorkspaceNotFound
   * without being prepared.
   */
  readonly runBackground: (
    workspaceId: Workspace.Id,
    process: string,
  ) => Effect.Effect<
    BackgroundProcess.Outcome,
    BackgroundRuns.Unknown | BackgroundRuns.Failure | GatewayErrors.WorkspaceNotFound
  >;
  /**
   * Run turn execution in a workspace, for the host process that runs the work agents accepted.
   * It is trusted and has no actor: each step acts as its turn's agent. Its failures are core's
   * own. A workspace that was never created returns WorkspaceNotFound without being prepared.
   */
  readonly executeTurns: <A, E>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, TurnExecution.Service>,
  ) => Effect.Effect<A, E | GatewayErrors.WorkspaceNotFound>;
}

/** Workspace bootstrap and entry; core's application services are the operations. */
export class Service extends Context.Service<Service, Interface>()("@amends/gateway/Service") {}

const isPublic = Schema.is(GatewayErrors.PublicError);
const isConflict = Schema.is(Store.Conflict);
const isUncertain = Schema.is(Store.CommitUncertain);
const isMismatch = Schema.is(Authorization.WorkspaceMismatch);
const isBehind = Schema.is(Projection.Behind);
const isUnregistered = Schema.is(Projection.Unregistered);
const isRunFailure = Schema.is(BackgroundRuns.Failure);

/**
 * Another host changed which projection versions are live, so this prepared runtime's commits no
 * longer match them, whether an operation failed with it or a background process did.
 */
const staleError = (error: unknown): boolean =>
  isBehind(error) || isUnregistered(error) || (isRunFailure(error) && staleError(error.cause));
const stale = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      (reason._tag === "Fail" && staleError(reason.error)) ||
      (reason._tag === "Die" && staleError(reason.defect)),
  );

/**
 * Apply the public error policy once. Schema failures and workspace mismatches
 * are reported as invalid input: core trusts what storage returns, so during
 * operations they arise only from validating caller-supplied values such as
 * invitation grants. Stored state core can't use is a defect, a server error.
 */
const expose = <A, E, R>(
  workspaceId: Workspace.Id,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, GatewayErrors.ExposedError<E>, R> =>
  Effect.catch(effect, (error): Effect.Effect<never, GatewayErrors.ExposedError<E>> => {
    if (isConflict(error))
      return Effect.fail(
        new GatewayErrors.Conflict({
          workspaceId,
          operation: error.operation,
          message: error.message,
        }),
      );
    if (isUncertain(error))
      return Effect.fail(new GatewayErrors.Uncertain({ workspaceId, commitId: error.commitId }));
    if (Schema.isSchemaError(error))
      return Effect.fail(new GatewayErrors.InvalidInput({ message: error.message }));
    // The runtime is prepared again for the next request, so this one may simply be retried.
    if (isBehind(error) || isUnregistered(error))
      return Effect.fail(
        new GatewayErrors.Conflict({
          workspaceId,
          operation: "commit",
          message: "Another host changed this workspace's read models; retry once they are rebuilt",
        }),
      );
    if (isMismatch(error))
      return Effect.fail(
        new GatewayErrors.InvalidInput({
          message: `Values must belong to workspace ${error.expectedWorkspaceId}`,
        }),
      );
    if (isPublic(error)) return Effect.fail(error as Extract<E, GatewayErrors.PublicError>);
    return Effect.die(error);
  });

export type Options = WorkspaceRuntime.Options;

/**
 * Construct one gateway and its workspace runtimes in the host scope. Identities come
 * from a trusted ingress; the gateway never accepts client-asserted actors or member IDs.
 *
 * @category constructors
 */
export const make = Effect.fn("Gateway.make")(function* (
  options: Options = {},
): Effect.fn.Return<
  Interface,
  never,
  | WorkspaceStorage.Service
  | SignalHub.Service
  | WorkspaceWakes.Service
  | WorkspaceTurns.Service
  | Crypto.Crypto
  | Scope.Scope
> {
  const runtimes = yield* WorkspaceRuntime.make(options);
  /**
   * When another host changed the live projection versions, prepare the workspace again, which
   * replays it, for the next request; the failed one did not commit.
   */
  const heal = <A, E, R>(workspaceId: Workspace.Id, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.tapCause((cause) => (stale(cause) ? runtimes.invalidate(workspaceId) : Effect.void)),
    );
  const exposed = <A, E, R>(workspaceId: Workspace.Id, effect: Effect.Effect<A, E, R>) =>
    expose(workspaceId, heal(workspaceId, effect));
  const workspaceStorage = yield* WorkspaceStorage.Service;
  // Admission reads storage as the host, never inside a request's actor or transaction.
  const environment = yield* Effect.context<never>();
  const crypto = yield* Crypto.Crypto;

  const bind = Effect.fn("Gateway.bind")(function* <A, E>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, WorkspaceRuntime.Provided | Scope.Scope>,
  ) {
    const context = yield* runtimes.forWorkspace(workspaceId);
    return yield* program.pipe(Effect.provide(context));
  });

  /** The admission check's reads, from a view of the workspace's stores. */
  const probe = Effect.fnUntraced(function* (
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
  ) {
    const bindings = yield* workspaceStorage.forWorkspace(workspaceId);
    const membership = yield* Effect.orDie(
      Context.get(bindings, MemberStore.Service).findActive(identity),
    );
    if (Option.isSome(membership)) return { _tag: "Member", member: membership.value } as const;
    const live = yield* Effect.orDie(
      Context.get(bindings, Checkpoint.Service).listLive(Core.journalLog),
    );
    if (live.length > 0) return { _tag: "Refused" } as const;
    const head = yield* Effect.orDie(Context.get(bindings, Store.Service).head(Core.journalLog));
    return Option.isNone(head) ? ({ _tag: "Refused" } as const) : ({ _tag: "Prepare" } as const);
  });

  /**
   * Whether an identity may enter a workspace. A prepared workspace resolves membership inside
   * it, since a member already booted it. Otherwise its stores answer without preparing it: the
   * identity's active membership, or a refusal when the workspace was never created, having no
   * history, or its live read models show no membership. Only a workspace whose read models
   * await a rebuild is prepared first, so membership is resolved from what its boot restores.
   */
  const admit = Effect.fn("Gateway.admit")(function* (
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
  ) {
    if (yield* runtimes.prepared(workspaceId)) return { _tag: "Prepare" } as const;
    return yield* probe(workspaceId, identity).pipe(Effect.setContext(environment));
  });
  /** Whether the workspace has history, read as the host. */
  const created = (workspaceId: Workspace.Id) =>
    workspaceStorage.forWorkspace(workspaceId).pipe(
      Effect.flatMap((bindings) => Context.get(bindings, Store.Service).head(Core.journalLog)),
      Effect.map(Option.isSome),
      Effect.orDie,
      Effect.setContext(environment),
    );

  const withActor = Effect.fn("Gateway.withActor")(function* <A, E, R>(
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    program: Effect.Effect<A, E, R>,
    found: Option.Option<Member.Record>,
  ) {
    // Without an answer from the admission check, the prepared workspace's read models decide.
    const membership = Option.isSome(found)
      ? found
      : yield* Effect.orDie((yield* MemberStore.Service).findActive(identity));
    if (Option.isNone(membership)) return yield* new GatewayErrors.NotMember({ workspaceId });
    const actor = Actor.Value.make({ workspaceId, memberId: membership.value.id, identity });
    return yield* exposed(workspaceId, Effect.provideService(program, Actor.Service, actor));
  });

  /**
   * A keyed creation's workspace ID, derived from its creator and key: a retry names the same
   * workspace, and nobody without the key can predict it.
   */
  const keyedId = (creator: Identity.HumanId, key: Request.Key) =>
    Request.derivedId(["workspace.create", creator, key]).pipe(
      Effect.map((id) => Workspace.Id.make(id)),
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.orDie,
    );
  const createWorkspace: Interface["createWorkspace"] = Effect.fn("Gateway.createWorkspace")(
    function* (
      creator: Identity.HumanId,
      input: Workspace.CreateInput,
      options: Request.Options = {},
    ) {
      const key = options.requestKey;
      if (key === undefined) {
        const id = Workspace.Id.make(yield* Effect.orDie(crypto.randomUUIDv4));
        return yield* Effect.scoped(
          bind(id, exposed(id, WorkspaceInitialization.initialize(creator, input))),
        );
      }
      const id = yield* keyedId(creator, key);
      // A completed first attempt answers its retry without preparing the workspace.
      const recorded = yield* workspaceStorage.forWorkspace(id).pipe(
        Effect.flatMap((bindings) => Context.get(bindings, WorkspaceStore.Service).get),
        Effect.orDie,
        Effect.setContext(environment),
      );
      if (Option.isSome(recorded)) return recorded.value;
      return yield* Effect.scoped(
        bind(
          id,
          exposed(
            id,
            WorkspaceInitialization.initialize(creator, input).pipe(
              // A concurrent attempt with the same key initialized it first.
              Effect.catchTag("WorkspaceInitialization.AlreadyInitialized", () =>
                Effect.flatMap(WorkspaceStore.Service, (workspaceStore) => workspaceStore.get).pipe(
                  Effect.orDie,
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.die("An initialized workspace has no record"),
                      onSome: Effect.succeed,
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  const inWorkspace: Interface["inWorkspace"] = Effect.fn("Gateway.inWorkspace")(function* <
    A,
    E,
    R extends Core.Operations,
  >(workspaceId: Workspace.Id, program: Effect.Effect<A, E, R>) {
    const operation: Effect.Effect<A, E, Core.Operations> = program;
    // A workspace that was never created has no history, and is refused before it is prepared.
    if (!(yield* runtimes.prepared(workspaceId)) && !(yield* created(workspaceId)))
      return yield* new GatewayErrors.WorkspaceNotFound({ workspaceId });
    return yield* Effect.scoped(bind(workspaceId, exposed(workspaceId, operation)));
  });

  const asMemberScoped: Interface["asMemberScoped"] = Effect.fn("Gateway.asMemberScoped")(
    function* <A, E, R extends Core.Operations | Actor.Service | Scope.Scope>(
      workspaceId: Workspace.Id,
      identity: Identity.MemberReference,
      program: Effect.Effect<A, E, R>,
    ) {
      const operation: Effect.Effect<A, E, Core.Operations | Actor.Service | Scope.Scope> = program;
      const admission = yield* admit(workspaceId, identity);
      if (admission._tag === "Refused") return yield* new GatewayErrors.NotMember({ workspaceId });
      const found =
        admission._tag === "Member" ? Option.some(admission.member) : Option.none<Member.Record>();
      return yield* bind(workspaceId, withActor(workspaceId, identity, operation, found));
    },
  );

  const asMember: Interface["asMember"] = (workspaceId, identity, program) =>
    Effect.scoped(asMemberScoped(workspaceId, identity, program));

  const runBackground: Interface["runBackground"] = Effect.fn("Gateway.runBackground")(function* (
    workspaceId: Workspace.Id,
    process: string,
  ) {
    if (!(yield* runtimes.prepared(workspaceId)) && !(yield* created(workspaceId)))
      return yield* new GatewayErrors.WorkspaceNotFound({ workspaceId });
    return yield* Effect.scoped(
      bind(
        workspaceId,
        heal(
          workspaceId,
          Effect.flatMap(BackgroundRuns.Service, (backgroundRuns) => backgroundRuns.run(process)),
        ),
      ),
    );
  });

  const executeTurns: Interface["executeTurns"] = Effect.fn("Gateway.executeTurns")(function* <
    A,
    E,
  >(workspaceId: Workspace.Id, program: Effect.Effect<A, E, TurnExecution.Service>) {
    if (!(yield* runtimes.prepared(workspaceId)) && !(yield* created(workspaceId)))
      return yield* new GatewayErrors.WorkspaceNotFound({ workspaceId });
    return yield* Effect.scoped(bind(workspaceId, heal(workspaceId, program)));
  });

  return Service.of({
    createWorkspace,
    inWorkspace,
    asMember,
    asMemberScoped,
    runBackground,
    executeTurns,
  });
});

/**
 * Provide one gateway and its workspace runtimes for the host layer's lifetime.
 *
 * @category layers
 */
export const layer = (options?: Options) => Layer.effect(Service, make(options));

export * as Gateway from "./gateway.ts";
