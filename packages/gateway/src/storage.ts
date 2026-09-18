import type * as Core from "@amends/core";
import type { Workspace } from "@amends/core/workspace";
import { Context } from "effect";
import type { Crypto, Effect } from "effect";

/** Core's host services that belong to workspace storage; the gateway supplies cryptography itself. */
export type Bindings = Exclude<Core.HostServices, Crypto.Crypto>;

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
