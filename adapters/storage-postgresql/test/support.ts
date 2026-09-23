import {
  ThreadStore,
  ThreadParticipationStore,
  ThreadMessageStore,
  ThreadActivityStore,
} from "@amends/core/thread";
import { inject } from "@effect/vitest";
import * as Core from "@amends/core";
import { ReadStateStore } from "@amends/core/attention";
import { AssignmentStore, RoleStore } from "@amends/core/authorization";
import { Identity, Performer } from "@amends/core/identity";
import { Event, Checkpoint, CommittedEvents, Log, Store } from "@amends/core/journal";
import { NotificationStore } from "@amends/core/notification";
import { GroupFollowStore, GroupStore, GroupMembershipStore } from "@amends/core/group";
import {
  InvitationStore,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import type { WorkspaceStorage } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase, PostgresStorage } from "../src/index.ts";
import { temporary } from "./postgres.ts";

export const setup = () => {
  const url = inject("amendsPostgresUrl");
  return {
    available: url !== null,
    withDatabase: <A, E, R>(use: (url: string) => Effect.Effect<A, E, R>) => {
      if (url === null) throw new Error("PostgreSQL is unavailable");
      return temporary(url, use);
    },
  };
};
export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
export const workspaceId = Workspace.Id.make("workspace-one");
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
export const views = (options: PostgresStorage.Options = {}) =>
  Effect.map(PostgresStorage.make(options), (service) => ({
    forWorkspace: (workspaceId: Workspace.Id) =>
      Effect.map(service.forWorkspace(workspaceId), bind),
  }));
export const database = (url: string) =>
  PostgresDatabase.layer({ url: Redacted.make(url), maxConnections: 4 });
export const core = (bound: Bound) =>
  Core.layer.pipe(
    Layer.provideMerge(CommittedEvents.layer(bound.workspace.workspaceId)),
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
export const inDatabase = <A, E>(
  url: string,
  program: Effect.Effect<A, E, PostgresDatabase.Service | SqlClient.SqlClient>,
) => program.pipe(Effect.provide(database(url)));
export const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator, { name: "Test workspace" }).pipe(
    Effect.provide(core(bound)),
  );
export const boundTo = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  return yield* (yield* views()).forWorkspace(workspaceId);
});

/** Attribution for low-level fixture writes outside application operations. */
export const testProvenance = (id = workspaceId): Event.Provenance => ({
  workspaceId: id,
  performedBy: { _tag: "System", id: Performer.SystemId.make("test-fixture") },
  causedBy: null,
  correlationId: Event.CorrelationId.make("test-operation"),
  occurredAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z"),
});
