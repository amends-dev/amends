import type { Workspace } from "@amends/core/workspace";
import { WorkspaceStorage } from "@amends/gateway";
import { Effect, Layer } from "effect";
import { Assignments } from "./assignments.ts";
import { Binding } from "./binding.ts";
import { Checkpoints } from "./checkpoints.ts";
import { PostgresDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
import { Journal } from "./journal.ts";
import { Members } from "./members.ts";
import { Roles } from "./roles.ts";
import { Workspaces } from "./workspaces.ts";

export type Options = Binding.Options;

/**
 * Provide every store core requires over the same workspace binding.
 * Adding a store adds a line here.
 *
 * @category layers
 */
export const layerStores = Layer.mergeAll(
  Journal.layer,
  Checkpoints.layer,
  Workspaces.layer,
  Members.layer,
  Roles.layer,
  Assignments.layer,
  Invitations.layer,
);

/**
 * Provide the stores bound to one workspace over the caller's database.
 *
 * @category layers
 */
export const layerWorkspace = (workspaceId: Workspace.Id, options: Options = {}) =>
  layerStores.pipe(Layer.provide(Binding.layer(workspaceId, options)));

/**
 * One pool, with inexpensive workspace-bound views over it. The stores hold no
 * resources, so the scope that builds them can close at once.
 *
 * @category constructors
 */
export const make = Effect.fn("PostgresStorage.make")(function* (options: Options = {}) {
  const database = yield* PostgresDatabase.Service;
  const forWorkspace: WorkspaceStorage.Interface["forWorkspace"] = Effect.fn(
    "PostgresStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(layerWorkspace(workspaceId, options)));
    },
    Effect.provideService(PostgresDatabase.Service, database),
  );
  return WorkspaceStorage.Service.of({ forWorkspace });
});

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 */
export const layer = (options: Options = {}) =>
  Layer.effect(WorkspaceStorage.Service, make(options));

export * as PostgresStorage from "./storage.ts";
