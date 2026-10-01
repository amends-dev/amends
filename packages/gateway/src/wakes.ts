import { BackgroundWakes } from "@amends/core/background";
import { Store } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Context, Effect, Layer } from "effect";

/**
 * Host contract for background wakes: each commit's requests for a workspace's processes to run,
 * stored with that commit and delivered to whichever process runs the workspace's background work.
 */
export interface Interface {
  /** The wakes of one workspace. */
  readonly forWorkspace: (workspaceId: Workspace.Id) => BackgroundWakes.Interface;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/gateway/wakes/Service",
) {}

/**
 * For a host that runs no background work: a commit that asks for a wake fails, so no work is
 * accepted that nothing would do.
 */
export const unavailable: Interface = {
  forWorkspace: () =>
    BackgroundWakes.Service.of({
      request: (process) =>
        Effect.fail(
          new Store.Failure({
            operation: "wake",
            cause: `This host runs no background work, so ${process} cannot be woken`,
          }),
        ),
    }),
};

/** @category layers */
export const layerUnavailable = Layer.succeed(Service, unavailable);

export * as WorkspaceWakes from "./wakes.ts";
