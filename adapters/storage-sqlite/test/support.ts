import * as Core from "@amends/core";
import { AssignmentStore, RoleStore } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Checkpoint, Store } from "@amends/core/journal";
import {
  InvitationStore,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Gateway, type WorkspaceStorage } from "@amends/gateway";
import { layer, SqliteDatabase, SqliteStorage } from "../src/index.ts";
import { BunCrypto } from "@effect/platform-bun";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
export const workspaceId = Workspace.Id.make("workspace-one");
export const otherWorkspaceId = Workspace.Id.make("workspace-two");
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
});
export type Bound = ReturnType<typeof bind>;
export const views = Effect.map(SqliteStorage.make(), (service) => ({
  forWorkspace: (workspaceId: Workspace.Id) => Effect.map(service.forWorkspace(workspaceId), bind),
}));
export const core = (bound: Bound) =>
  Core.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
export const inDatabase = <A, E>(
  filename: string,
  program: Effect.Effect<A, E, SqliteDatabase.Service | SqlClient.SqlClient>,
) => Effect.runPromise(program.pipe(Effect.provide(SqliteDatabase.layer(filename))));
export const host = (filename: string) =>
  Gateway.layer.pipe(
    Layer.provideMerge(layer),
    Layer.provideMerge(Layer.mergeAll(SqliteDatabase.layer(filename), BunCrypto.layer)),
  );
export const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator, { name: "Test workspace" }).pipe(
    Effect.provide(core(bound)),
  );
export const temporary = async (run: (filename: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-sqlite-"));
  try {
    await run(join(directory, "test.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const boundTo = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  return yield* (yield* views).forWorkspace(workspaceId);
});
