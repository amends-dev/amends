import * as Core from "@amends/core";
import { Authorization } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { CommittedEvents, Journal, Store } from "@amends/core/journal";
import { MemberStore, Workspace, WorkspaceInitialization } from "@amends/core/workspace";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import { GatewayErrors } from "./errors.ts";
import { WorkspaceStorage } from "./storage.ts";
import { WorkspaceEvents } from "./workspace-events.ts";

export interface Interface {
  /**
   * Allocate a workspace ID and run core initialization for its creator. The
   * caller has authenticated the creator and checked their entitlement.
   */
  readonly createWorkspace: (
    creator: Identity.HumanId,
    input: Workspace.CreateInput,
  ) => Effect.Effect<
    Workspace.Record,
    GatewayErrors.Conflict | GatewayErrors.Uncertain | GatewayErrors.InvalidInput
  >;
  /**
   * Run core operations in a workspace without an actor: invitation acceptance,
   * where the recipient is not yet a member. Programs may require only core's
   * application services, never its stores or journal.
   */
  readonly inWorkspace: <A, E, R extends Core.Operations>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, GatewayErrors.ExposedError<E>>;
  /**
   * Run core operations as the identity's active membership. Core rechecks
   * membership and permissions inside each operation's transaction.
   */
  readonly asMember: <A, E, R extends Core.Operations | Actor.Service>(
    workspaceId: Workspace.Id,
    identity: Identity.Reference,
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, GatewayErrors.ExposedError<E> | GatewayErrors.NotMember>;
}

/** Workspace bootstrap and entry; core's application services are the operations. */
export class Service extends Context.Service<Service, Interface>()("@amends/gateway/Service") {}

const isPublic = Schema.is(GatewayErrors.PublicError);
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
    if (isMismatch(error))
      return Effect.fail(
        new GatewayErrors.InvalidInput({
          message: `Values must belong to workspace ${error.expectedWorkspaceId}`,
        }),
      );
    if (isPublic(error)) return Effect.fail(error as Extract<E, GatewayErrors.PublicError>);
    return Effect.die(error);
  });

/** Everything a bound core context provides; runners narrow what programs may require. */
type Provided = Layer.Success<typeof Core.layer> | Core.HostServices;

/**
 * Construct the gateway from workspace storage, the shared event registry, and cryptography. Identities come
 * from a trusted ingress; the gateway never accepts client-asserted actors or member IDs.
 *
 * @category constructors
 */
export const make = Effect.fn("Gateway.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  WorkspaceStorage.Service | WorkspaceEvents.Service | Crypto.Crypto
> {
  const storage = yield* WorkspaceStorage.Service;
  const events = yield* WorkspaceEvents.Service;
  const cryptography = yield* Crypto.Crypto;

  // Failures while binding storage, building core, or catching up projections
  // are host defects, not outcomes of the operation being run.
  const bind = Effect.fn("Gateway.bind")(function* <A, E>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, Provided>,
  ) {
    const bindings = yield* storage.forWorkspace(workspaceId);
    const bus = yield* Effect.orDie(events.forWorkspace(workspaceId));
    if (bus.workspaceId !== workspaceId)
      return yield* Effect.die(
        new CommittedEvents.WorkspaceMismatch({
          expectedWorkspaceId: workspaceId,
          actualWorkspaceId: bus.workspaceId,
        }),
      );
    const services = Core.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(bindings),
          Layer.succeed(Crypto.Crypto, cryptography),
          Layer.succeed(CommittedEvents.Service, bus),
        ),
      ),
      Layer.orDie,
    );
    return yield* Effect.gen(function* () {
      yield* Effect.orDie((yield* Journal.Service).replay);
      return yield* program;
    }).pipe(Effect.provide(services));
  }, Effect.scoped);

  const withActor = Effect.fn("Gateway.withActor")(function* <A, E, R>(
    workspaceId: Workspace.Id,
    identity: Identity.Reference,
    program: Effect.Effect<A, E, R>,
  ) {
    const membership = yield* Effect.orDie((yield* MemberStore.Service).findActive(identity));
    if (Option.isNone(membership)) return yield* new GatewayErrors.NotMember({ workspaceId });
    const actor = Actor.Value.make({ workspaceId, memberId: membership.value.id, identity });
    return yield* expose(workspaceId, Effect.provideService(program, Actor.Service, actor));
  });

  const createWorkspace: Interface["createWorkspace"] = Effect.fn("Gateway.createWorkspace")(
    function* (creator: Identity.HumanId, input: Workspace.CreateInput) {
      const id = Workspace.Id.make(yield* Effect.orDie(cryptography.randomUUIDv4));
      return yield* bind(id, expose(id, WorkspaceInitialization.initialize(creator, input)));
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

  return Service.of({ createWorkspace, inWorkspace, asMember });
});

/**
 * Provide the gateway over the caller's workspace storage and cryptography.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as Gateway from "./gateway.ts";
