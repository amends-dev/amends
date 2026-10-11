/**
 * The storage a host gives the gateway: for each workspace, the stores core reads and writes and
 * the signal hub that delivers signals between every process over the same storage. The gateway
 * binds a workspace's storage to check who may enter it and to build its core. Storage adapters
 * implement it, `MemoryWorkspaceStorage` in process memory, and the conformance suites check what
 * its stores promise.
 *
 * @since 0.1.0
 */
import type { Integrations } from "@amends-dev/connection";
import type * as Core from "@amends-dev/core";
import type { DeliveryJobs } from "@amends-dev/core/channel";
import type { TurnJobs } from "@amends-dev/core/turn";
import type { Workspace } from "@amends-dev/core/workspace";
import { Context } from "effect";
import type { Crypto, Effect } from "effect";

/**
 * What storage binds to one workspace: its stores and its signal hub. The gateway supplies
 * cryptography, the turn and delivery jobs, and the integrations the host installs.
 *
 * @category models
 * @since 0.1.0
 */
export type Bindings = Exclude<
  Core.HostServices,
  Crypto.Crypto | Integrations.Integrations | TurnJobs.TurnJobs | DeliveryJobs.DeliveryJobs
>;

/**
 * Binds one workspace's stores and signal hub, which the gateway builds that workspace's core over.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceStorage extends Context.Service<
  WorkspaceStorage,
  {
    /**
     * Bind isolated storage views for one workspace, and its signal hub. Binding creates no
     * workspace, membership, or connection. Every view interprets IDs within that workspace, and
     * views for different workspaces must never observe each other's rows or signals. The hub
     * reaches every process over the same storage.
     */
    readonly forWorkspace: (workspaceId: Workspace.Id) => Effect.Effect<Context.Context<Bindings>>;
  }
>()("@amends-dev/gateway/WorkspaceStorage") {}
