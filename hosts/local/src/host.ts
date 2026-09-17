import {
  Actor,
  Commit,
  Identity,
  Invitation,
  InvitationApplication,
  Journal,
  Member,
  MemberApplication,
  MemberStore,
  Workspace,
  WorkspaceCore,
  WorkspaceInitialization,
} from "@amends/core";
import { BunCrypto } from "@effect/platform-bun";
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import { Storage } from "./storage.ts";
import { Database } from "./database.ts";

export class NotMember extends Schema.TaggedError<NotMember>()("LocalHost.NotMember", {
  workspaceId: Workspace.Id,
}) {}
export class CreationUncertain extends Schema.TaggedError<CreationUncertain>()(
  "LocalHost.CreationUncertain",
  {
    workspaceId: Workspace.Id,
    commitId: Commit.Id,
    cause: Schema.Defect(),
  },
) {}

export const make = Effect.fn("LocalHost.make")(function* () {
  const storage = yield* Storage.make();
  const cryptography = yield* Crypto.Crypto;
  const inWorkspace = Effect.fn("LocalHost.inWorkspace")(function* <A, E, R>(
    workspaceId: Workspace.Id,
    program: Effect.Effect<A, E, R>,
  ) {
    const id = yield* Schema.decodeEffect(Workspace.Id)(workspaceId);
    const bound = yield* storage.forWorkspace(id);
    const services = WorkspaceCore.layer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(bound.context),
          Layer.succeed(Crypto.Crypto, cryptography),
        ),
      ),
    );
    return yield* Effect.gen(function* () {
      // New projections catch up before the host exposes application operations.
      yield* (yield* Journal.Service).replay;
      return yield* program;
    }).pipe(Effect.provide(services));
  });
  const createWorkspace = Effect.fn("LocalHost.createWorkspace")(function* (
    creator: Identity.HumanId,
  ) {
    const id = Workspace.Id.make(crypto.randomUUID());
    return yield* inWorkspace(
      id,
      WorkspaceInitialization.initialize(creator).pipe(
        Effect.provideService(Crypto.Crypto, cryptography),
      ),
    ).pipe(
      Effect.catchTag("JournalStore.CommitUncertain", (error) =>
        Effect.fail(
          new CreationUncertain({ workspaceId: id, commitId: error.commitId, cause: error.cause }),
        ),
      ),
    );
  });
  const asMember = Effect.fn("LocalHost.asMember")(function* <A, E, R>(
    workspaceId: Workspace.Id,
    authenticated: Identity.Reference,
    operation: Effect.Effect<A, E, R>,
  ) {
    const identity = yield* Schema.decodeEffect(Identity.Reference)(authenticated);
    return yield* inWorkspace(
      workspaceId,
      Effect.gen(function* () {
        const membership = yield* (yield* MemberStore.Service).findActive(identity);
        if (Option.isNone(membership)) return yield* new NotMember({ workspaceId });
        const actor = Actor.Value.make({ workspaceId, memberId: membership.value.id, identity });
        return yield* operation.pipe(Effect.provideService(Actor.Service, actor));
      }),
    );
  });
  const getMember = Effect.fn("LocalHost.getMember")(function* (
    workspaceId: Workspace.Id,
    authenticated: Identity.Reference,
    memberId: Member.Id,
  ) {
    return yield* asMember(
      workspaceId,
      authenticated,
      Effect.flatMap(MemberApplication.Service, (service) => service.get(memberId)),
    );
  });
  const invite = Effect.fn("LocalHost.invite")(function* (
    workspaceId: Workspace.Id,
    authenticated: Identity.Reference,
    request: Invitation.Request,
  ) {
    return yield* asMember(
      workspaceId,
      authenticated,
      Effect.flatMap(InvitationApplication.Service, (service) => service.issue(request)),
    );
  });
  const removeMember = Effect.fn("LocalHost.removeMember")(function* (
    workspaceId: Workspace.Id,
    authenticated: Identity.Reference,
    memberId: Member.Id,
  ) {
    return yield* asMember(
      workspaceId,
      authenticated,
      Effect.flatMap(MemberApplication.Service, (service) => service.remove(memberId)),
    );
  });
  const acceptInvitation = Effect.fn("LocalHost.acceptInvitation")(function* (
    workspaceId: Workspace.Id,
    authenticated: Identity.HumanId,
    invitationId: Invitation.Id,
  ) {
    return yield* inWorkspace(
      workspaceId,
      Effect.flatMap(InvitationApplication.Service, (service) =>
        service.accept(invitationId, authenticated),
      ),
    );
  });
  const revokeInvitation = Effect.fn("LocalHost.revokeInvitation")(function* (
    workspaceId: Workspace.Id,
    authenticated: Identity.Reference,
    invitationId: Invitation.Id,
  ) {
    return yield* asMember(
      workspaceId,
      authenticated,
      Effect.flatMap(InvitationApplication.Service, (service) => service.revoke(invitationId)),
    );
  });
  const enableInvitations = Effect.fn("LocalHost.enableInvitations")(function* (
    workspaceId: Workspace.Id,
    authenticated: Identity.Reference,
  ) {
    yield* asMember(workspaceId, authenticated, WorkspaceInitialization.enableInvitations());
  });
  return {
    createWorkspace,
    getMember,
    removeMember,
    invite,
    acceptInvitation,
    revokeInvitation,
    enableInvitations,
  };
});

/** These methods receive identities established by a trusted ingress, never client-asserted actors. */
export type Interface = Effect.Success<ReturnType<typeof make>>;
export class Service extends Context.Service<Service, Interface>()(
  "@amends/host-local/host/Service",
) {}
export const layer = (filename: string) =>
  Layer.effect(Service, make()).pipe(
    Layer.provide(Layer.mergeAll(Database.layer(filename), BunCrypto.layer)),
  );

export * as LocalHost from "./host.ts";
