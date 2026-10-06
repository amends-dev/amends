import type { Integrations } from "@amends/connection-v2";
import type * as Core from "@amends/core";
import type { ConnectionCatalog } from "@amends/core/connection";
import type { EnvironmentCatalog } from "@amends/core/environment";
import type { AgentJobs, TurnJobs } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Context } from "effect";
import type { Crypto, Effect } from "effect";

/**
 * What storage binds to one workspace: its stores and its signal hub. The gateway supplies
 * cryptography, the agent and turn jobs, the host's connection and environment catalogs, and the
 * integrations it installs.
 */
export type Bindings = Exclude<
  Core.HostServices,
  | Crypto.Crypto
  | AgentJobs.Service
  | ConnectionCatalog.Service
  | EnvironmentCatalog.Service
  | Integrations.Integrations
  | TurnJobs.Service
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
