import { BackgroundJobs } from "@amends/core/background";
import { Store } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Context, Effect, Layer } from "effect";

/**
 * Host contract for background jobs: each commit's requests for a workspace's background processes
 * to run, stored with that commit and delivered to whatever runs the workspace's background jobs.
 */
export interface Interface {
  /** The background jobs of one workspace. */
  readonly forWorkspace: (workspaceId: Workspace.Id) => BackgroundJobs.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/background-jobs/Service",
) {}

/**
 * For a host that runs no background jobs: a commit that requests one fails, so no work is
 * accepted that nothing would do.
 */
export const unavailable: Interface = {
  forWorkspace: () =>
    BackgroundJobs.Service.of({
      request: (process) =>
        Effect.fail(
          new Store.Failure({
            operation: "request background job",
            cause: `This host runs no background jobs, so ${process} cannot run`,
          }),
        ),
    }),
};

/** @category layers */
export const layerUnavailable = Layer.succeed(Service, unavailable);

export * as WorkspaceBackgroundJobs from "./background-jobs.ts";
