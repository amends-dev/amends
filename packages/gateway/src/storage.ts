import type * as Core from "@amends/core";
import type { ConnectionCatalog } from "@amends/core/connection";
import type { EnvironmentCatalog } from "@amends/core/environment";
import type { AgentJobs, TurnJobs } from "@amends/core/turn";
import type { Signals } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { Context } from "effect";
import type { Crypto, Effect } from "effect";

/**
 * Storage-only dependencies; the gateway supplies cryptography, the workspace's signals, its
 * agent and turn jobs, and the host's connection and environment catalogs.
 */
export type Bindings = Exclude<
  Core.HostServices,
  | Crypto.Crypto
  | Signals.Service
  | AgentJobs.Service
  | ConnectionCatalog.Service
  | EnvironmentCatalog.Service
  | TurnJobs.Service
>;

export interface Interface {
  /**
   * Bind isolated storage views for one workspace. Binding creates no workspace,
   * membership, or connection. Every view interprets IDs within that workspace,
   * and views for different workspaces must never observe each other's rows.
   */
  readonly forWorkspace: (workspaceId: Workspace.Id) => Effect.Effect<Context.Context<Bindings>>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/storage/Service",
) {}

export * as WorkspaceStorage from "./storage.ts";
