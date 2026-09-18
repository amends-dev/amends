import { AssignmentStore, RoleStore } from "@amends/core/authorization";
import { Checkpoint, Store } from "@amends/core/journal";
import { InvitationStore, MemberStore, Workspace, WorkspaceStore } from "@amends/core/workspace";
import { WorkspaceStorage } from "@amends/gateway";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqliteJournal } from "./journal-store.ts";
import { SqliteDomains } from "./domain-stores.ts";
import { SqliteInvitation } from "./invitation-store.ts";

/** One database, with inexpensive workspace-bound views over the shared connection. */
export const make = Effect.fn("Storage.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const health = { broken: false };
  const forWorkspace = Effect.fn("Storage.forWorkspace")(
    function* (workspaceId: Workspace.Id) {
      const journal = yield* SqliteJournal.make(workspaceId, health);
      const domains = yield* SqliteDomains.make(workspaceId, journal);
      const invitations = yield* SqliteInvitation.make(workspaceId, journal);
      const context = Context.make(Store.Service, journal.store).pipe(
        Context.add(Checkpoint.Service, journal.checkpoints),
        Context.add(MemberStore.Service, domains.members),
        Context.add(RoleStore.Service, domains.roles),
        Context.add(AssignmentStore.Service, domains.assignments),
        Context.add(WorkspaceStore.Service, domains.workspace),
        Context.add(InvitationStore.Service, invitations),
      );
      return { ...journal, ...domains, invitations, context };
    },
    Effect.provideService(SqlClient.SqlClient, sql),
  );
  return { forWorkspace };
});

/** Expose the SQLite views to the gateway as its workspace storage contract. */
export const layer = Layer.effect(
  WorkspaceStorage.Service,
  Effect.map(make(), (storage) =>
    WorkspaceStorage.Service.of({
      forWorkspace: (workspaceId) =>
        Effect.map(storage.forWorkspace(workspaceId), (b) => b.context),
    }),
  ),
);

export * as Storage from "./storage.ts";
