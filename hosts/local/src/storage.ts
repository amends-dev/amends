import {
  AssignmentStore,
  Checkpoint,
  MemberStore,
  RoleStore,
  Store,
  Workspace,
  WorkspaceStore,
} from "@amends/core";
import { Context, Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqliteJournal } from "./journal-store.ts";
import { SqliteDomains } from "./domain-stores.ts";

/** One database, with inexpensive workspace-bound views over the shared connection. */
export const make = Effect.fn("Storage.make")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const health = { broken: false };
  const forWorkspace = Effect.fn("Storage.forWorkspace")(
    function* (workspaceId: Workspace.Id) {
      const journal = yield* SqliteJournal.make(workspaceId, health);
      const domains = yield* SqliteDomains.make(workspaceId, journal);
      const context = Context.make(Store.Service, journal.store).pipe(
        Context.add(Checkpoint.Service, journal.checkpoints),
        Context.add(MemberStore.Service, domains.members),
        Context.add(RoleStore.Service, domains.roles),
        Context.add(AssignmentStore.Service, domains.assignments),
        Context.add(WorkspaceStore.Service, domains.workspace),
      );
      return { ...journal, ...domains, context };
    },
    Effect.provideService(SqlClient.SqlClient, sql),
  );
  return { forWorkspace };
});

export * as Storage from "./storage.ts";
