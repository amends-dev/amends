import * as Core from "@amends/core";
import { Authorization } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Journal, Store } from "@amends/core/journal";
import { MemberStore, Workspace, WorkspaceInitialization } from "@amends/core/workspace";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import { Conflict, type Exposed, InvalidInput, NotMember, Public, Uncertain } from "./errors.ts";
import { WorkspaceStorage } from "./storage.ts";

export { NotMember, Conflict, Uncertain, InvalidInput, Public, type Exposed } from "./errors.ts";

export interface Interface {
  /**
   * Allocate a workspace ID and run core initialization for its creator. The
   * caller has authenticated the creator and checked their entitlement.
   */
  readonly createWorkspace: (
    creator: Identity.HumanId,
  ) => Effect.Effect<Workspace.Record, Conflict | Uncertain | InvalidInput>;
  /**
   * Run core operations in a workspace without an actor: invitation acceptance,
   * where the recipient is not yet a member. Programs may require only core's
   * application services, never its stores or journal.
   */
  readonly inWorkspace: <A, E, R extends Core.Operations>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, Exposed<E>>;
  /**
   * Run core operations as the identity's active membership. Core rechecks
   * membership and permissions inside each operation's transaction.
   */
  readonly asMember: <A, E, R extends Core.Operations | Actor.Service>(
    workspaceId: Workspace.Id,
    identity: Identity.Reference,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, Exposed<E> | NotMember>;
  /**
   * Grant invitation management to the current owner of a workspace created
   * before that permission existed. Initialization owns this upgrade, so it is
   * the one operation offered here rather than through an application service.
   */
  readonly enableInvitations: (
    workspaceId: Workspace.Id,
    identity: Identity.Reference,
  ) => Effect.Effect<
    void,
    Exposed<Effect.Error<ReturnType<typeof WorkspaceInitialization.enableInvitations>>> | NotMember
  >;
}

/** Workspace bootstrap and entry; core's application services are the operations. */
export class Service extends Context.Service<Service, Interface>()("@amends/gateway/Service") {}

const isPublic = Schema.is(Public);
const isConflict = Schema.is(Store.Conflict);
const isUncertain = Schema.is(Store.CommitUncertain);
const isMismatch = Schema.is(Authorization.WorkspaceMismatch);

/**
 * Apply the public error policy once. Schema failures and workspace mismatches
 * are reported as invalid input: during operations they arise only from
 * validating caller-supplied values such as invitation grants.
 */
const expose = <A, E, R>(
  workspaceId: Workspace.Id,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exposed<E>, R> =>
  Effect.catch(effect, (error): Effect.Effect<never, Exposed<E>> => {
    if (isConflict(error))
      return Effect.fail(
        new Conflict({ workspaceId, operation: error.operation, message: error.message }),
      );
    if (isUncertain(error))
      return Effect.fail(new Uncertain({ workspaceId, commitId: error.commitId }));
    if (Schema.isSchemaError(error))
      return Effect.fail(new InvalidInput({ message: error.message }));
    if (isMismatch(error))
      return Effect.fail(
        new InvalidInput({
          message: `Values must belong to workspace ${error.expectedWorkspaceId}`,
        }),
      );
    if (isPublic(error)) return Effect.fail(error as Extract<E, Public>);
    return Effect.die(error);
  });

/** Everything a bound core context provides; runners narrow what programs may require. */
type Provided = Layer.Success<typeof Core.layer> | Core.HostServices;

/**
 * Construct the gateway from workspace storage and cryptography. Identities come
 * from a trusted ingress; the gateway never accepts client-asserted actors or member IDs.
 *
 * @category constructors
 */
export const make = Effect.fn("Gateway.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  WorkspaceStorage.Service | Crypto.Crypto
> {
  const storage = yield* WorkspaceStorage.Service;
  const cryptography = yield* Crypto.Crypto;

  // Failures while binding storage, building core, or catching up projections
  // are host defects, not outcomes of the operation being run.
  const bind = Effect.fn("Gateway.bind")(function* <A, E>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, Provided>,
  ) {
    const bindings = yield* storage.forWorkspace(workspaceId);
    const services = Core.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(Layer.succeedContext(bindings), Layer.succeed(Crypto.Crypto, cryptography)),
      ),
      Layer.orDie,
    );
    return yield* Effect.gen(function* () {
      yield* Effect.orDie((yield* Journal.Service).replay);
      return yield* program;
    }).pipe(Effect.provide(services));
  });

  const withActor = Effect.fn("Gateway.withActor")(function* <A, E, R>(
    workspaceId: Workspace.Id,
    identity: Identity.Reference,
    program: Effect.Effect<A, E, R>,
  ) {
    const membership = yield* Effect.orDie((yield* MemberStore.Service).findActive(identity));
    if (Option.isNone(membership)) return yield* new NotMember({ workspaceId });
    const actor = Actor.Value.make({ workspaceId, memberId: membership.value.id, identity });
    return yield* expose(workspaceId, Effect.provideService(program, Actor.Service, actor));
  });

  const createWorkspace: Interface["createWorkspace"] = Effect.fn("Gateway.createWorkspace")(
    function* (creator: Identity.HumanId) {
      const id = Workspace.Id.make(yield* Effect.orDie(cryptography.randomUUIDv4));
      return yield* bind(id, expose(id, WorkspaceInitialization.initialize(creator)));
    },
  );

  const inWorkspace: Interface["inWorkspace"] = Effect.fn("Gateway.inWorkspace")(function* <
    A,
    E,
    R extends Core.Operations,
  >(workspaceId: Workspace.Id, program: Effect.Effect<A, E, R>) {
    const operation: Effect.Effect<A, E, Core.Operations> = program;
    return yield* bind(workspaceId, expose(workspaceId, operation));
  });

  const asMember: Interface["asMember"] = Effect.fn("Gateway.asMember")(function* <
    A,
    E,
    R extends Core.Operations | Actor.Service,
  >(workspaceId: Workspace.Id, identity: Identity.Reference, program: Effect.Effect<A, E, R>) {
    const operation: Effect.Effect<A, E, Core.Operations | Actor.Service> = program;
    return yield* bind(workspaceId, withActor(workspaceId, identity, operation));
  });

  const enableInvitations: Interface["enableInvitations"] = Effect.fn("Gateway.enableInvitations")(
    function* (workspaceId: Workspace.Id, identity: Identity.Reference) {
      yield* bind(
        workspaceId,
        withActor(workspaceId, identity, WorkspaceInitialization.enableInvitations()),
      );
    },
  );

  return Service.of({ createWorkspace, inWorkspace, asMember, enableInvitations });
});

/**
 * Provide the gateway over the caller's workspace storage and cryptography.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as Gateway from "./gateway.ts";
