/** Fixtures the suites share: identities, bound stores, and cores and gateways over a host. */
import * as Core from "@amends/core";
import { ReadStateStore } from "@amends/core/attention";
import { AssignmentStore, BuiltinRoles, type Role, RoleStore } from "@amends/core/authorization";
import { GroupFollowStore, GroupMembershipStore, GroupStore } from "@amends/core/group";
import { Identity, Performer } from "@amends/core/identity";
import { Checkpoint, CommittedEvents, Event, Log, Store } from "@amends/core/journal";
import { NotificationStore } from "@amends/core/notification";
import {
  ThreadActivityStore,
  ThreadMessageStore,
  ThreadParticipationStore,
  ThreadStore,
} from "@amends/core/thread";
import {
  type Invitation,
  InvitationStore,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Gateway, WorkspaceEvents, WorkspaceStorage } from "@amends/gateway";
import { Context, DateTime, Effect, Layer, type Option } from "effect";
import type { Harness, Host } from "./harness.ts";

export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
export const charlie = Identity.Reference.cases.Human.make({
  id: Identity.HumanId.make("charlie"),
});
export const workspaceId = Workspace.Id.make("workspace-one");
export const otherWorkspaceId = Workspace.Id.make("workspace-two");
export const journalLog = Log.Id.make("journal");

/** The bound stores by name, for direct assertions beside the context core receives. */
export const bind = (context: Context.Context<WorkspaceStorage.Bindings>) => ({
  context,
  threads: Context.get(context, ThreadStore.Service),
  participations: Context.get(context, ThreadParticipationStore.Service),
  messages: Context.get(context, ThreadMessageStore.Service),
  activities: Context.get(context, ThreadActivityStore.Service),
  store: Context.get(context, Store.Service),
  checkpoints: Context.get(context, Checkpoint.Service),
  workspace: Context.get(context, WorkspaceStore.Service),
  members: Context.get(context, MemberStore.Service),
  roles: Context.get(context, RoleStore.Service),
  assignments: Context.get(context, AssignmentStore.Service),
  invitations: Context.get(context, InvitationStore.Service),
  notifications: Context.get(context, NotificationStore.Service),
  groups: Context.get(context, GroupStore.Service),
  groupMemberships: Context.get(context, GroupMembershipStore.Service),
  groupFollows: Context.get(context, GroupFollowStore.Service),
  readStates: Context.get(context, ReadStateStore.Service),
});
export type Bound = ReturnType<typeof bind>;

/** One workspace's stores on a host. */
export const forWorkspace = (host: Context.Context<Host>, id: Workspace.Id) =>
  Effect.map(Context.get(host, WorkspaceStorage.Service).forWorkspace(id), bind);

/** One workspace's stores on the host in context, as a gateway's caller has it. */
export const boundTo = (id: Workspace.Id) =>
  Effect.flatMap(WorkspaceStorage.Service, (storage) => storage.forWorkspace(id)).pipe(
    Effect.map(bind),
  );

/** Cores and gateways over the harness's hosts. */
export const make = (harness: Harness) => {
  const core = (bound: Bound) =>
    Core.layer.pipe(
      Layer.provideMerge(CommittedEvents.layer(bound.workspace.workspaceId)),
      Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), harness.crypto)),
    );
  return {
    core,
    /** Initialize the bound workspace for its creator, as the gateway's bootstrap does. */
    initialized: (bound: Bound, creator = alice.id) =>
      WorkspaceInitialization.initialize(creator, { name: "Test workspace" }).pipe(
        Effect.provide(core(bound)),
      ),
    /** A gateway, with its workspace event bus, over a host. */
    gateway: (host: Context.Context<Host>) =>
      Gateway.layer.pipe(
        Layer.provideMerge(WorkspaceEvents.layer()),
        Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(host), harness.crypto)),
      ),
  };
};

/** Attribution for low-level fixture writes outside application operations. */
export const testProvenance = (id = workspaceId): Event.Provenance => ({
  workspaceId: id,
  performedBy: { _tag: "System", id: Performer.SystemId.make("test-fixture") },
  causedBy: null,
  correlationId: Event.CorrelationId.make("test-operation"),
  occurredAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z"),
});

export const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })));

export const request = (
  expiresAt: DateTime.Utc,
  recipientId = bob.id,
  roleId: Role.Id = BuiltinRoles.ViewerId,
): Invitation.IssueInput => ({ recipientId, expiresAt, roleId });

/**
 * Replace what a store's by-ID reads return for one ID, in both single and batch reads;
 * `Option.none()` hides the record. Other IDs read through to the store.
 */
export const replacing = <Id, A, E>(
  store: {
    readonly get: (id: Id) => Effect.Effect<Option.Option<A>, E>;
    readonly getMany: (ids: ReadonlyArray<Id>) => Effect.Effect<ReadonlyArray<A>, E>;
  },
  id: Id,
  replacement: Option.Option<A>,
) => ({
  get: (requested: Id) => (requested === id ? Effect.succeed(replacement) : store.get(requested)),
  getMany: (ids: ReadonlyArray<Id>) =>
    Effect.map(store.getMany(ids.filter((requested) => requested !== id)), (rows) =>
      ids.includes(id)
        ? [...rows, ...(replacement._tag === "Some" ? [replacement.value] : [])]
        : rows,
    ),
});

export * as Support from "./support.ts";
