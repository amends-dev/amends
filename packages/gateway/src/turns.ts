import { TurnDispatch } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Context, Effect, Layer } from "effect";

/**
 * Host contract for running turns: each commit's requests for a workspace's turns to run,
 * delivered to whatever runs them.
 */
export interface Interface {
  /** The turn dispatch of one workspace. */
  readonly forWorkspace: (workspaceId: Workspace.Id) => TurnDispatch.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/turns/Service",
) {}

/**
 * For a host that runs no turns, or runs them itself: requests are accepted and nothing runs, so
 * agents still accept their work, which waits queued until something executes it.
 */
export const idle: Interface = {
  forWorkspace: () => TurnDispatch.Service.of({ request: () => Effect.void }),
};

/** @category layers */
export const layerIdle = Layer.succeed(Service, idle);

export * as WorkspaceTurns from "./turns.ts";
