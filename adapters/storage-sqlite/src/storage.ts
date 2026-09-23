import { Threads } from "./threads.ts";
import { ThreadParticipations } from "./thread-participations.ts";
import { ThreadMessages } from "./thread-messages.ts";
import { ThreadActivities } from "./thread-activities.ts";
import type { Workspace } from "@amends/core/workspace";
import { WorkspaceStorage } from "@amends/gateway";
import { Effect, Layer } from "effect";
import { Assignments } from "./assignments.ts";
import { Groups } from "./groups.ts";
import { GroupMemberships } from "./group-memberships.ts";
import { GroupFollows } from "./group-follows.ts";
import { ReadStates } from "./read-states.ts";
import { Binding } from "./binding.ts";
import { Checkpoints } from "./checkpoints.ts";
import { SqliteDatabase } from "./database.ts";
import { Invitations } from "./invitations.ts";
import { Journal } from "./journal.ts";
import { Members } from "./members.ts";
import { Notifications } from "./notifications.ts";
import { Roles } from "./roles.ts";
import { Workspaces } from "./workspaces.ts";

/**
 * Provide every store core requires over the same workspace binding.
 * Adding a store adds a line here.
 *
 * @category layers
 */
const layerStores = Layer.mergeAll(
  Journal.layer,
  Checkpoints.layer,
  Workspaces.layer,
  Members.layer,
  Roles.layer,
  Assignments.layer,
  Invitations.layer,
  Notifications.layer,
  Groups.layer,
  GroupMemberships.layer,
  GroupFollows.layer,
  Threads.layer,
  ThreadParticipations.layer,
  ThreadMessages.layer,
  ThreadActivities.layer,
  ReadStates.layer,
);

/**
 * Provide the stores bound to one workspace over the caller's database.
 *
 * @category layers
 */
export const layerWorkspace = (workspaceId: Workspace.Id) =>
  layerStores.pipe(Layer.provide(Binding.layer(workspaceId)));

/**
 * One connection, with inexpensive workspace-bound views over it. The stores
 * hold no resources, so the scope that builds them can close at once.
 *
 * @category constructors
 */
export const make = Effect.fn("SqliteStorage.make")(function* () {
  const database = yield* SqliteDatabase.Service;
  const forWorkspace: WorkspaceStorage.Interface["forWorkspace"] = Effect.fn(
    "SqliteStorage.forWorkspace",
  )(
    function* (workspaceId: Workspace.Id) {
      return yield* Effect.scoped(Layer.build(layerWorkspace(workspaceId)));
    },
    Effect.provideService(SqliteDatabase.Service, database),
  );
  return WorkspaceStorage.Service.of({ forWorkspace });
});

/**
 * Expose the workspace views to the gateway as its workspace storage contract.
 *
 * @category layers
 */
export const layer = Layer.effect(WorkspaceStorage.Service, make());

export * as SqliteStorage from "./storage.ts";
