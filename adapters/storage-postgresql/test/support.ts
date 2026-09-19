import { afterAll, test } from "bun:test";
import * as Core from "@amends/core";
import { AssignmentStore, RoleStore } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Checkpoint, Log, Store } from "@amends/core/journal";
import { NotificationStore } from "@amends/core/notification";
import {
  InvitationStore,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Gateway, type WorkspaceStorage } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { layer, PostgresDatabase, PostgresStorage } from "../src/index.ts";
import { acquire, temporary } from "./postgres.ts";

export const setup = async () => {
  const server = await acquire();
  afterAll(async () => server?.stop());
  return {
    it: test.skipIf(server === undefined),
    withDatabase: (use: (url: string) => Promise<void>) => {
      if (server === undefined) throw new Error("PostgreSQL is unavailable");
      return temporary(server, use);
    },
  };
};
export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
export const workspaceId = Workspace.Id.make("workspace-one");
export const otherWorkspaceId = Workspace.Id.make("workspace-two");
export const journalLog = Log.Id.make("journal");

/** The bound stores by name, for direct assertions beside the context core receives. */
export const bind = (context: Context.Context<WorkspaceStorage.Bindings>) => ({
  context,
  store: Context.get(context, Store.Service),
  checkpoints: Context.get(context, Checkpoint.Service),
  workspace: Context.get(context, WorkspaceStore.Service),
  members: Context.get(context, MemberStore.Service),
  roles: Context.get(context, RoleStore.Service),
  assignments: Context.get(context, AssignmentStore.Service),
  invitations: Context.get(context, InvitationStore.Service),
  notifications: Context.get(context, NotificationStore.Service),
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
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
export const inDatabase = <A, E>(
  url: string,
  program: Effect.Effect<A, E, PostgresDatabase.Service | SqlClient.SqlClient>,
) => Effect.runPromise(program.pipe(Effect.provide(database(url))));
export const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator, { name: "Test workspace" }).pipe(
    Effect.provide(core(bound)),
  );
export const host = (url: string, options: PostgresStorage.Options = {}) =>
  Gateway.layer.pipe(
    Layer.provideMerge(layer(options)),
    Layer.provideMerge(Layer.mergeAll(database(url), BunCrypto.layer)),
  );
export const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })));

export const boundTo = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  return yield* (yield* views()).forWorkspace(workspaceId);
});
