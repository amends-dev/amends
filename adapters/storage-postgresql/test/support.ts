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
import { Event, Checkpoint, Log, Store } from "@amends/core/journal";
import { NotificationStore } from "@amends/core/notification";
import { GroupFollowStore, GroupStore, GroupMembershipStore } from "@amends/core/group";
import {
  InvitationStore,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { BackgroundWakes } from "@amends/core/background";
import { ConnectionCatalog, ConnectionCredentialStore } from "@amends/core/connection";
import { type WorkspaceStorage, WorkspaceWakes } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase, PostgresSignals, PostgresStorage } from "../src/index.ts";
import { Signals } from "@amends/core/signal";
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
  context: Context.Context<WorkspaceStorage.Bindings | Signals.Service | BackgroundWakes.Service>,
) => ({
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
  credentials: Context.get(context, ConnectionCredentialStore.Service),
});
export type Bound = ReturnType<typeof bind>;
/** Workspace views over the database in context, each with its signals. */
export const views = (options: PostgresStorage.Options = {}) =>
  Effect.gen(function* () {
    const service = yield* PostgresStorage.make(options);
    const hub = yield* PostgresSignals.make();
    return {
      forWorkspace: (workspaceId: Workspace.Id) =>
        Effect.map(service.forWorkspace(workspaceId), (context) =>
          bind(
            Context.add(
              Context.add(context, Signals.Service, hub.forWorkspace(workspaceId)),
              BackgroundWakes.Service,
              WorkspaceWakes.unavailable.forWorkspace(workspaceId),
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
        ConnectionCatalog.layer([]),
      ),
    ),
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
