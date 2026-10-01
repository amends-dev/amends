import { TurnJobs } from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Context, Effect, Layer } from "effect";

/**
 * Host contract for turn jobs: each commit's requests for a workspace's turns to run, delivered to
 * whatever runs turn jobs.
 */
export interface Interface {
  /** The turn jobs of one workspace. */
  readonly forWorkspace: (workspaceId: Workspace.Id) => TurnJobs.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/turn-jobs/Service",
) {}

/**
 * For a host that runs no turn jobs, or runs turns itself: requests are accepted and nothing runs,
 * so agents still accept their work, which waits queued until something runs it.
 */
export const noRunner: Interface = {
  forWorkspace: () => TurnJobs.Service.of({ request: () => Effect.void }),
};

/** @category layers */
export const layerNoRunner = Layer.succeed(Service, noRunner);

export * as WorkspaceTurnJobs from "./turn-jobs.ts";
