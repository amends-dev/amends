import { Api, Authentication, WorkspaceMember } from "@amends-dev/http";
import type { Workspace } from "@amends-dev/core/workspace";
import { Effect, Layer } from "effect";
import { HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";

/**
 * The API as the bearer of `token`, acting in the workspace `workspaceId` when one is given; one
 * given none calls only what comes before a workspace, such as creating one.
 */
export const client = (token: string, workspaceId?: Workspace.Id) =>
  HttpApiClient.make(Api.Api).pipe(
    Effect.provide(
      Layer.merge(
        HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
          next(HttpClientRequest.bearerToken(request, token)),
        ),
        workspaceId === undefined
          ? WorkspaceMember.layerClientOutsideWorkspace
          : WorkspaceMember.layerClient(workspaceId),
      ),
    ),
  );

/** A client `client` makes. */
export type Client = Effect.Success<ReturnType<typeof client>>;
