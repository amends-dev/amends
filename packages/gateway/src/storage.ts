import type { Integrations } from "@amends/connection-v2";
import type * as Core from "@amends/core";
import type { TurnJobs } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Context } from "effect";
import type { Crypto, Effect } from "effect";

/**
 * What storage binds to one workspace: its stores and its signal hub. The gateway supplies
 * cryptography, the turn jobs, and the integrations the host installs.
 */
export type Bindings = Exclude<
  Core.HostServices,
  Crypto.Crypto | Integrations.Integrations | TurnJobs.Service
>;

export interface Interface {
  /**
   * Bind isolated storage views for one workspace, and its signal hub. Binding creates no
   * workspace, membership, or connection. Every view interprets IDs within that workspace, and
   * views for different workspaces must never observe each other's rows or signals. The hub
   * reaches every process over the same storage.
   */
  readonly forWorkspace: (workspaceId: Workspace.Id) => Effect.Effect<Context.Context<Bindings>>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/storage/Service",
) {}

export * as WorkspaceStorage from "./storage.ts";
