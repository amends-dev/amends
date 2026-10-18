/**
 * The storage a host gives the gateway: for each workspace, the stores core reads and writes. The
 * gateway
 * binds a workspace's storage to check who may enter it and to build its core. Storage adapters
 * implement it, `layerMemory` in process memory, and the conformance suites check what its stores
 * promise.
 *
 * @since 0.1.0
 */

import type { Integrations } from "@amends-dev/connection"
import type { Core } from "@amends-dev/core"
import { AgentStore } from "@amends-dev/core/agent"
import { AssignmentStore, RoleStore } from "@amends-dev/core/authorization"
import { ChannelBindingStore, ChannelStore, ContactStore, DeliveryStore } from "@amends-dev/core/channel"
import type { DeliveryJobs } from "@amends-dev/core/channel"
import { ConnectionCredentialStore, ConnectionStore } from "@amends-dev/core/connection"
import { GroupFollowStore, GroupMembershipStore, GroupStore } from "@amends-dev/core/group"
import { Checkpoint, MemoryDatabase, MemoryBinding } from "@amends-dev/core/journal"
import { NotificationStore } from "@amends-dev/core/notification"
import type { PresenceRelay } from "@amends-dev/core/presence"
import { ReadStateStore } from "@amends-dev/core/read-state"
import { TaskStore } from "@amends-dev/core/task"
import { ThreadActivityStore, ThreadMessageStore, ThreadParticipationStore, ThreadStore } from "@amends-dev/core/thread"
import { SessionStateStore, TurnStore } from "@amends-dev/core/turn"
import type { TurnJobs } from "@amends-dev/core/turn"
import { InvitationStore, MemberStore, WorkspaceStore, type WorkspaceId } from "@amends-dev/core/workspace"
import * as Context from "effect/Context"
import type * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

/**
 * What storage binds to one workspace: its stores. The gateway supplies
 * cryptography, the turn and delivery jobs, the presence relay, and the integrations the host installs.
 *
 * @category models
 * @since 0.1.0
 */
export type Bindings = Exclude<
  Core.HostServices,
  | Crypto.Crypto
  | Integrations.Integrations
  | TurnJobs.TurnJobs
  | DeliveryJobs.DeliveryJobs
  | PresenceRelay.PresenceRelay
>

/**
 * Binds one workspace's stores, which the gateway builds that workspace's core over.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceStorage extends Context.Service<
  WorkspaceStorage,
  {
    /**
     * Bind isolated storage views for one workspace. Binding creates no workspace, membership, or
     * connection. Every view interprets IDs within that workspace, and views for different
     * workspaces must never observe each other's rows.
     */
    readonly forWorkspace: (workspaceId: WorkspaceId.WorkspaceId) => Effect.Effect<Context.Context<Bindings>>
  }
>()("@amends-dev/gateway/WorkspaceStorage") {}

/** Every store core requires, in process memory. Adding a store adds a line. */
const layerMemoryStores = Layer.mergeAll(
  Checkpoint.layerMemory,
  WorkspaceStore.layerMemory,
  MemberStore.layerMemory,
  RoleStore.layerMemory,
  AssignmentStore.layerMemory,
  InvitationStore.layerMemory,
  NotificationStore.layerMemory,
  GroupStore.layerMemory,
  GroupMembershipStore.layerMemory,
  GroupFollowStore.layerMemory,
  ThreadStore.layerMemory,
  ThreadParticipationStore.layerMemory,
  ThreadMessageStore.layerMemory,
  ThreadActivityStore.layerMemory,
  TaskStore.layerMemory,
  ChannelStore.layerMemory,
  ChannelBindingStore.layerMemory,
  ContactStore.layerMemory,
  DeliveryStore.layerMemory,
  ReadStateStore.layerMemory,
  ConnectionStore.layerMemory,
  ConnectionCredentialStore.layerMemory,
  AgentStore.layerMemory,
  TurnStore.layerMemory,
  SessionStateStore.layerMemory
)

/**
 * Each workspace's stores over one connection: the workspace's journal store binds
 * it, and every other store reads and writes through that binding. The stores hold no resources,
 * so the scope that builds them can close at once.
 */
const makeMemory = Effect.fn("WorkspaceStorage.makeMemory")(function* () {
  const connection = yield* MemoryDatabase.Connection
  const forWorkspace: WorkspaceStorage["Service"]["forWorkspace"] = Effect.fn("WorkspaceStorage.memory.forWorkspace")(
    function* (workspaceId: WorkspaceId.WorkspaceId) {
      return yield* Effect.scoped(
        Layer.build(layerMemoryStores.pipe(Layer.provideMerge(MemoryBinding.layer(workspaceId))))
      )
    },
    Effect.provideService(MemoryDatabase.Connection, connection)
  )
  return WorkspaceStorage.of({ forWorkspace })
})

/**
 * Provide workspace storage in process memory, over the `MemoryDatabase.Connection` beneath: each
 * workspace's stores are core's `layerMemory`s, bound to the workspace over the
 * connection.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerMemory = Layer.effect(WorkspaceStorage, makeMemory())
