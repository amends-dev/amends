/**
 * How a host enters core. Core runs one workspace with a trusted actor, and its services are the
 * operations; the gateway creates workspaces, prepares each one's core over `WorkspaceStorage`
 * through `WorkspaceRuntime`, and resolves an authenticated identity into `Actor.Actor`, so those
 * operations can run. Every protocol, such as HTTP, and every host's jobs enter workspaces through
 * it, and a program fails with what the operations it calls report, by kind.
 *
 * @since 0.1.0
 */
import * as Core from "@amends-dev/core";
import { Actor, type Identity } from "@amends-dev/core/identity";
import { Checkpoint, Store } from "@amends-dev/core/journal";
import { Operation } from "@amends-dev/core/operation";
import {
  type Member,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends-dev/core/workspace";
import { Request } from "@amends-dev/core/request";
import type { DeliveryJobs } from "@amends-dev/core/channel";
import type { TurnJobs } from "@amends-dev/core/turn";
import { Context, Crypto, Data, Effect, Layer, Option, Schema, Cause } from "effect";
import type { Scope } from "effect";
import * as WorkspaceStorage from "./WorkspaceStorage.ts";
import * as WorkspaceRuntime from "./internal/workspace-runtime.ts";
import { CoreError } from "@amends-dev/core/error";

/**
 * The gateway a host builds once, with `make` or `layer`: it creates workspaces and runs programs
 * in them, as a member or without an actor. Core's services are the operations those programs
 * call.
 *
 * @category services
 * @since 0.1.0
 */
export class Gateway extends Context.Service<
  Gateway,
  {
    /**
     * Allocate a workspace ID and run core initialization for its creator. The
     * caller has authenticated the creator and checked their entitlement.
     */
    readonly createWorkspace: (
      creator: Identity.HumanId,
      input: Workspace.CreateInput,
      options?: Request.Options,
    ) => Effect.Effect<
      Workspace.Workspace,
      CoreError.Invalid | CoreError.Unavailable | CoreError.Uncertain
    >;
    /**
     * Run core operations as the identity's active membership, keeping the workspace prepared for
     * the caller's scope, so a stream the program returns keeps it too. Membership is resolved
     * before the workspace is prepared, so a non-member or an unknown workspace returns NotMember
     * without loading it. Core rechecks membership and permissions per operation; writes do so
     * inside their transaction.
     */
    readonly asMember: <A, E, R extends Core.Operations | Actor.Actor | Scope.Scope>(
      workspaceId: Workspace.Id,
      identity: Identity.MemberReference,
      program: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | CoreError.Denied, Scope.Scope>;
    /**
     * Run a program in a workspace without an actor, keeping the workspace prepared for the
     * caller's scope: invitation acceptance, where the recipient is not yet a member, and a host's
     * jobs, which call the services core gives them. Programs may require only core's operations
     * and those services, never the journal or the stores commits write. A workspace that was never
     * created returns `CoreError.NotFound` for the workspace without being prepared.
     */
    readonly inWorkspace: <A, E, R extends Core.Operations | Core.JobServices | Scope.Scope>(
      workspaceId: Workspace.Id,
      program: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | CoreError.NotFound, Scope.Scope>;
  }
>()("@amends-dev/gateway/Gateway") {}

const isUnavailable = Schema.is(CoreError.Unavailable);

/**
 * Whether the program stopped because another host changed which projection versions are live, so
 * this prepared runtime's commits no longer match them: core reports it as `Reloading`.
 */
const isStaleCause = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) &&
      isUnavailable(reason.error) &&
      reason.error.reason._tag === "Reloading",
  );

/**
 * What `make` and `layer` take: the integrations the host installs, and how long an unused
 * workspace stays prepared.
 *
 * @category options
 * @since 0.1.0
 */
export type Options = WorkspaceRuntime.Options;

/** Whether membership is known, refused, or must be resolved after preparation. */
type Admission = Data.TaggedEnum<{
  Member: { readonly member: Member.Member };
  Refused: {};
  Prepare: {};
}>;
const Admission = Data.taggedEnum<Admission>();

/**
 * Construct one gateway and its workspace runtimes in the host scope. Identities come
 * from a trusted ingress; the gateway never accepts client-asserted actors or member IDs.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Gateway.make")(function* (
  options: Options = {},
): Effect.fn.Return<
  Gateway["Service"],
  never,
  | WorkspaceStorage.WorkspaceStorage
  | TurnJobs.TurnJobs
  | DeliveryJobs.DeliveryJobs
  | Crypto.Crypto
  | Scope.Scope
> {
  const runtimes = yield* WorkspaceRuntime.make(options);
  /**
   * When another host changed the live projection versions, prepare the workspace again, which
   * replays it, for the next request; the failed one did not commit.
   */
  const reloadWhenStale = <A, E, R>(workspaceId: Workspace.Id, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.tapCause((cause) =>
        isStaleCause(cause) ? runtimes.invalidate(workspaceId) : Effect.void,
      ),
    );
  const workspaceStorage = yield* WorkspaceStorage.WorkspaceStorage;
  // Admission reads storage as the host, never inside a request's actor or transaction.
  const hostContext = yield* Effect.context<never>();
  const crypto = yield* Crypto.Crypto;

  /**
   * Run a program in the workspace's prepared runtime, preparing it first if this host has not.
   * The runtime stays prepared until the caller's scope closes.
   */
  const runInWorkspace = Effect.fn("Gateway.runInWorkspace")(function* <A, E>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, WorkspaceRuntime.Services | Scope.Scope>,
  ) {
    const context = yield* runtimes.lease(workspaceId);
    return yield* program.pipe(Effect.provide(context));
  });

  /** The admission check's reads, from a view of the workspace's stores. */
  const findMembershipInStorage = Effect.fnUntraced(function* (
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
  ) {
    const bindings = yield* workspaceStorage.forWorkspace(workspaceId);
    const membership = yield* Effect.orDie(
      Context.get(bindings, MemberStore.MemberStore).findActive(identity),
    );
    if (Option.isSome(membership)) return Admission.Member({ member: membership.value });
    const live = yield* Effect.orDie(
      Context.get(bindings, Checkpoint.Checkpoint).listLive(Core.journalLog),
    );
    if (live.length > 0) return Admission.Refused();
    const head = yield* Effect.orDie(Context.get(bindings, Store.Store).head(Core.journalLog));
    return Option.isNone(head) ? Admission.Refused() : Admission.Prepare();
  });

  /**
   * Whether an identity may enter a workspace. A prepared workspace resolves membership inside
   * it, since a member already prepared it. Otherwise its stores answer without preparing it: the
   * identity's active membership, or a refusal when the workspace was never created, having no
   * history, or its live read models show no membership. Only a workspace whose read models
   * await a rebuild is prepared first, so membership is resolved from what its preparation
   * restores.
   */
  const checkAdmission = Effect.fn("Gateway.checkAdmission")(function* (
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
  ) {
    if (yield* runtimes.isPrepared(workspaceId)) return Admission.Prepare();
    return yield* findMembershipInStorage(workspaceId, identity).pipe(
      Effect.setContext(hostContext),
    );
  });
  /** Whether the workspace has history, read as the host. */
  const hasHistory = (workspaceId: Workspace.Id) =>
    workspaceStorage.forWorkspace(workspaceId).pipe(
      Effect.flatMap((bindings) => Context.get(bindings, Store.Store).head(Core.journalLog)),
      Effect.map(Option.isSome),
      Effect.orDie,
      Effect.setContext(hostContext),
    );
  /** A workspace that was never created has no history, and is refused before it is prepared. */
  const requireCreated = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
    if (!(yield* runtimes.isPrepared(workspaceId)) && !(yield* hasHistory(workspaceId)))
      return yield* new CoreError.NotFound({ resource: "Workspace", id: workspaceId });
  });

  const withActor = Effect.fn("Gateway.withActor")(function* <A, E, R>(
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    program: Effect.Effect<A, E, R>,
    admittedMember: Option.Option<Member.Member>,
  ) {
    // Without an answer from the admission check, the prepared workspace's read models decide.
    const membership = Option.isSome(admittedMember)
      ? admittedMember
      : yield* Effect.orDie((yield* MemberStore.MemberStore).findActive(identity));
    if (Option.isNone(membership))
      return yield* new CoreError.Denied({ reason: new CoreError.NotMember({ workspaceId }) });
    const actor = Actor.Actor.of({ workspaceId, memberId: membership.value.id, identity });
    return yield* reloadWhenStale(workspaceId, Effect.provideService(program, Actor.Actor, actor));
  });

  /**
   * A keyed creation's workspace ID, derived from its creator and key: a retry names the same
   * workspace, and nobody without the key can predict it.
   */
  const workspaceIdForKey = (creator: Identity.HumanId, key: Request.Key) =>
    Request.derivedId(["workspace.create", creator, key]).pipe(
      Effect.map((id) => Workspace.Id.make(id)),
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.orDie,
    );
  const createWorkspace: Gateway["Service"]["createWorkspace"] = Effect.fn(
    "Gateway.createWorkspace",
  )(function* (
    creator: Identity.HumanId,
    input: Workspace.CreateInput,
    options: Request.Options = {},
  ) {
    const key = options.requestKey;
    const id =
      key === undefined
        ? Workspace.Id.make(yield* Effect.orDie(crypto.randomUUIDv4))
        : yield* workspaceIdForKey(creator, key);
    if (key !== undefined) {
      // A completed first attempt answers its retry without preparing the workspace.
      const recorded = yield* workspaceStorage.forWorkspace(id).pipe(
        Effect.flatMap((bindings) => Context.get(bindings, WorkspaceStore.WorkspaceStore).get),
        Effect.orDie,
        Effect.setContext(hostContext),
      );
      if (Option.isSome(recorded)) return recorded.value;
    }
    const initialized = WorkspaceInitialization.initialize(creator, input).pipe(
      // A concurrent attempt with the same key initialized it first.
      Effect.catchTag("WorkspaceInitialization.AlreadyInitialized", () =>
        Effect.flatMap(WorkspaceStore.WorkspaceStore, (workspaceStore) => workspaceStore.get).pipe(
          Effect.orDie,
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.die("An initialized workspace has no record"),
              onSome: Effect.succeed,
            }),
          ),
        ),
      ),
      Operation.report,
    );
    return yield* Effect.scoped(runInWorkspace(id, reloadWhenStale(id, initialized)));
  });

  const asMember: Gateway["Service"]["asMember"] = Effect.fn("Gateway.asMember")(function* <
    A,
    E,
    R extends Core.Operations | Actor.Actor | Scope.Scope,
  >(
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    program: Effect.Effect<A, E, R>,
  ) {
    const operation: Effect.Effect<A, E, Core.Operations | Actor.Actor | Scope.Scope> = program;
    const admission = yield* checkAdmission(workspaceId, identity);
    if (Admission.$is("Refused")(admission))
      return yield* new CoreError.Denied({ reason: new CoreError.NotMember({ workspaceId }) });
    const admittedMember = Admission.$is("Member")(admission)
      ? Option.some(admission.member)
      : Option.none<Member.Member>();
    return yield* runInWorkspace(
      workspaceId,
      withActor(workspaceId, identity, operation, admittedMember),
    );
  });

  const inWorkspace: Gateway["Service"]["inWorkspace"] = Effect.fn("Gateway.inWorkspace")(
    function* <A, E, R extends Core.Operations | Core.JobServices | Scope.Scope>(
      workspaceId: Workspace.Id,
      program: Effect.Effect<A, E, R>,
    ) {
      const operation: Effect.Effect<A, E, Core.Operations | Core.JobServices | Scope.Scope> =
        program;
      yield* requireCreated(workspaceId);
      return yield* runInWorkspace(workspaceId, reloadWhenStale(workspaceId, operation));
    },
  );

  return Gateway.of({ createWorkspace, asMember, inWorkspace });
});

/**
 * Provide one gateway and its workspace runtimes for the host layer's lifetime.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (options?: Options) => Layer.effect(Gateway, make(options));
