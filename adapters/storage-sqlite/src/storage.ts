import type { Workspace } from "@amends/core/workspace";
import { WorkspaceStorage } from "@amends/gateway";
import { Effect, Layer } from "effect";
import { Assignments } from "./assignments.ts";
import { Binding } from "./binding.ts";
import { Checkpoints } from "./checkpoints.ts";
import { SqliteDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
import { Journal } from "./journal.ts";
import { Members } from "./members.ts";
import { Roles } from "./roles.ts";
import { Workspaces } from "./workspaces.ts";

/** Every store core requires, each over the same workspace binding. Adding a store adds a line here. */
export const stores = Layer.mergeAll(
  Journal.layer,
  Checkpoints.layer,
  Workspaces.layer,
  Members.layer,
  Roles.layer,
  Assignments.layer,
  Invitations.layer,
);

/** The stores bound to one workspace, over the database in context. */
export const workspace = (workspaceId: Workspace.Id) =>
  stores.pipe(Layer.provide(Binding.layer(workspaceId)));

/**
 * One connection, with inexpensive workspace-bound views over it. The stores
 * hold no resources, so the scope that builds them can close at once.
 */
export const make = Effect.fn("SqliteStorage.make")(function* () {
  const database = yield* SqliteDatabase.Service;
  const forWorkspace: WorkspaceStorage.Interface["forWorkspace"] = Effect.fn(
    "SqliteStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(workspace(workspaceId)));
    },
    Effect.provideService(SqliteDatabase.Service, database),
  );
  return WorkspaceStorage.Service.of({ forWorkspace });
});

/** Expose the workspace views to the gateway as its workspace storage contract. */
export const layer = Layer.effect(WorkspaceStorage.Service, make());

export * as SqliteStorage from "./storage.ts";
