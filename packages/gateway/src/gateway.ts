import * as Core from "@amends/core";
import { Authorization } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Store } from "@amends/core/journal";
import {
  type Member,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Request } from "@amends/core/request";
import { Context, Crypto, Effect, Encoding, Layer, Option, Result, Schema } from "effect";
import type { Scope } from "effect";
import { GatewayErrors } from "./errors.ts";
import type { SignalHub } from "./signals.ts";
import { WorkspaceStorage } from "./storage.ts";
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
    GatewayErrors.Conflict | GatewayErrors.Uncertain | GatewayErrors.InvalidInput | Request.Reused
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
}

/** Workspace bootstrap and entry; core's application services are the operations. */
export class Service extends Context.Service<Service, Interface>()("@amends/gateway/Service") {}

const isPublic = Schema.is(GatewayErrors.PublicError);
const isConflict = Schema.is(Store.Conflict);
const isUncertain = Schema.is(Store.CommitUncertain);
const isMismatch = Schema.is(Authorization.WorkspaceMismatch);

/** A string's UTF-8 bytes; hex encoding reads strings as UTF-8, and valid hex always decodes. */
const utf8 = (text: string) => Result.getOrThrow(Encoding.decodeHex(Encoding.encodeHex(text)));

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
  WorkspaceStorage.Service | SignalHub.Service | Crypto.Crypto | Scope.Scope
> {
  const runtimes = yield* WorkspaceRuntime.make(options);
  const storage = yield* WorkspaceStorage.Service;
  // Admission reads storage as the host, never inside a request's actor or transaction.
  const environment = yield* Effect.context<never>();
  const cryptography = yield* Crypto.Crypto;

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
    const bindings = yield* storage.forWorkspace(workspaceId);
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
    storage.forWorkspace(workspaceId).pipe(
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
    return yield* expose(workspaceId, Effect.provideService(program, Actor.Service, actor));
  });

  /**
   * A keyed creation's workspace ID, derived from its creator and key: a retry names the same
   * workspace, and nobody without the key can predict it. Formatted as a UUID (version 8).
   */
  const keyedId = Effect.fnUntraced(function* (creator: Identity.HumanId, key: Request.Key) {
    const digest = yield* Effect.orDie(
      cryptography.digest("SHA-256", utf8(JSON.stringify(["workspace.create", creator, key]))),
    );
    const bytes = digest.slice(0, 16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Encoding.encodeHex(bytes);
    return Workspace.Id.make(
      [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
        "-",
      ),
    );
  });
  /** A retry returns the workspace its first attempt created, when it asked for the same one. */
  const reuse = (
    record: Workspace.Record,
    creator: Identity.HumanId,
    input: Workspace.CreateInput,
    key: Request.Key,
  ) =>
    record.createdBy === creator && record.name === input.name
      ? Effect.succeed(record)
      : Effect.fail(new Request.Reused({ operation: "workspace.create", key }));

  const createWorkspace: Interface["createWorkspace"] = Effect.fn("Gateway.createWorkspace")(
    function* (
      creator: Identity.HumanId,
      input: Workspace.CreateInput,
      options: Request.Options = {},
    ) {
      const key = options.requestKey;
      if (key === undefined) {
        const id = Workspace.Id.make(yield* Effect.orDie(cryptography.randomUUIDv4));
        return yield* Effect.scoped(
          bind(id, expose(id, WorkspaceInitialization.initialize(creator, input))),
        );
      }
      const id = yield* keyedId(creator, key);
      // A completed first attempt answers its retry without preparing the workspace.
      const recorded = yield* storage.forWorkspace(id).pipe(
        Effect.flatMap((bindings) => Context.get(bindings, WorkspaceStore.Service).get),
        Effect.orDie,
        Effect.setContext(environment),
      );
      if (Option.isSome(recorded)) return yield* reuse(recorded.value, creator, input, key);
      return yield* Effect.scoped(
        bind(
          id,
          expose(
            id,
            WorkspaceInitialization.initialize(creator, input).pipe(
              // A concurrent attempt with the same key initialized it first.
              Effect.catchTag("WorkspaceInitialization.AlreadyInitialized", () =>
                Effect.flatMap(WorkspaceStore.Service, (store) => store.get).pipe(
                  Effect.orDie,
                  Effect.flatMap(
                    Option.match({
                      onNone: () => Effect.die("An initialized workspace has no record"),
                      onSome: (record) => reuse(record, creator, input, key),
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
    return yield* Effect.scoped(bind(workspaceId, expose(workspaceId, operation)));
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

  return Service.of({ createWorkspace, inWorkspace, asMember, asMemberScoped });
});

/**
 * Provide one gateway and its workspace runtimes for the host layer's lifetime.
 *
 * @category layers
 */
export const layer = (options?: Options) => Layer.effect(Service, make(options));

export * as Gateway from "./gateway.ts";
