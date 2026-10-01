import type { Signals } from "@amends/core/signal";
import type { Workspace } from "@amends/core/workspace";
import { Context } from "effect";

/**
 * Host contract for ephemeral signals, such as typing: a hub shared by every process serving
 * the same workspaces, so a signal published in one reaches subscribers in all of them. It stores
 * nothing, and missed signals are gone. The storage adapters provide one over their system.
 */
export interface Interface {
  /** The signals of one workspace. Binding opens nothing until a subscriber registers. */
  readonly forWorkspace: (workspaceId: Workspace.Id) => Signals.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/signals/Service",
) {}

export * as WorkspaceSignals from "./signals.ts";
