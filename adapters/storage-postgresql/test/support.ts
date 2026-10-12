import {
  ThreadStore,
  ThreadParticipationStore,
  ThreadMessageStore,
  ThreadActivityStore,
} from "@amends-dev/core/thread";
import { inject } from "@effect/vitest";
import * as Core from "@amends-dev/core";
import { ReadStateStore } from "@amends-dev/core/read-state";
import { AssignmentStore, RoleStore } from "@amends-dev/core/authorization";
import { Identity, Performer } from "@amends-dev/core/identity";
import { Event, Checkpoint, Log, Store } from "@amends-dev/core/journal";
import { NotificationStore } from "@amends-dev/core/notification";
import { GroupFollowStore, GroupStore, GroupMembershipStore } from "@amends-dev/core/group";
import {
  InvitationStore,
  Member,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends-dev/core/workspace";
import { Integrations } from "@amends-dev/connection";
import { DeliveryJobs } from "@amends-dev/core/channel";
import { TurnJobs } from "@amends-dev/core/turn";
import type { WorkspaceStorage } from "@amends-dev/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { PostgresDatabase, PostgresWorkspaceStorage } from "../src/index.ts";
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
export const bind = (
  context: Context.Context<
    WorkspaceStorage.Bindings | TurnJobs.TurnJobs | DeliveryJobs.DeliveryJobs
  >,
) => ({
  context,
  threads: Context.get(context, ThreadStore.ThreadStore),
  participations: Context.get(context, ThreadParticipationStore.ThreadParticipationStore),
  messages: Context.get(context, ThreadMessageStore.ThreadMessageStore),
  activities: Context.get(context, ThreadActivityStore.ThreadActivityStore),
  store: Context.get(context, Store.Store),
  checkpoints: Context.get(context, Checkpoint.Checkpoint),
  workspace: Context.get(context, WorkspaceStore.WorkspaceStore),
  members: Context.get(context, MemberStore.MemberStore),
  roles: Context.get(context, RoleStore.RoleStore),
  assignments: Context.get(context, AssignmentStore.AssignmentStore),
  invitations: Context.get(context, InvitationStore.InvitationStore),
  notifications: Context.get(context, NotificationStore.NotificationStore),
  groups: Context.get(context, GroupStore.GroupStore),
  groupMemberships: Context.get(context, GroupMembershipStore.GroupMembershipStore),
  groupFollows: Context.get(context, GroupFollowStore.GroupFollowStore),
  readStates: Context.get(context, ReadStateStore.ReadStateStore),
});
export type Bound = ReturnType<typeof bind>;
/** Workspace views over the database in context, each with its signals. */
export const views = (options: PostgresWorkspaceStorage.Options = {}) =>
  Effect.gen(function* () {
    const service = yield* PostgresWorkspaceStorage.make(options);
    return {
      forWorkspace: (workspaceId: Workspace.Id) =>
        Effect.map(service.forWorkspace(workspaceId), (context) =>
          bind(
            context.pipe(
              Context.add(TurnJobs.TurnJobs, TurnJobs.noRunner),
              Context.add(DeliveryJobs.DeliveryJobs, DeliveryJobs.noRunner),
            ),
          ),
        ),
    };
  });
export const database = (url: string) =>
  PostgresDatabase.layer({ url: Redacted.make(url), maxConnections: 4 });
export const core = (bound: Bound) =>
  Core.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.succeedContext(bound.context),
        BunCrypto.layer,
        Layer.effect(Integrations.Integrations, Integrations.make([])),
      ),
    ),
  );
export const inDatabase = <A, E>(
  url: string,
  program: Effect.Effect<A, E, PostgresDatabase.PostgresDatabase | SqlClient.SqlClient>,
) => program.pipe(Effect.provide(database(url)));
export const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator, {
    name: "Test workspace",
    memberName: Member.Name.make(creator),
  }).pipe(Effect.provide(core(bound)));
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
