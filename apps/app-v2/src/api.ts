/**
 * The host's HTTP API, as the app calls it: the contract's client at the host's address, sending
 * the session's token when there is one. The app calls what comes before a workspace over HTTP, and
 * in one only follows a turn's log, which no replica holds; what a member does in one goes through
 * their store.
 */

import type { WorkspaceId } from "@amends-dev/core/workspace"
import * as Api from "@amends-dev/http/Api"
import * as Authentication from "@amends-dev/http/Authentication"
import * as WorkspaceMember from "@amends-dev/http/WorkspaceMember"
import * as Effect from "effect/Effect"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"

/** Send `token` as the bearer of each request, when one is given. */
const bearer = (token: string | undefined) =>
  HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
    next(token === undefined ? request : HttpClientRequest.bearerToken(request, token))
  )

/** The API at `apiUrl`, as the bearer of `token` when one is given, outside any workspace. */
export const client = (apiUrl: string, token?: string) =>
  HttpApiClient.make(Api.Api, { baseUrl: apiUrl }).pipe(
    Effect.provide(Layer.merge(bearer(token), WorkspaceMember.layerClientOutsideWorkspace))
  )

/** The API at `apiUrl`, as the bearer of `token`, acting as their member of `workspaceId`. */
export const memberClient = (apiUrl: string, token: string, workspaceId: WorkspaceId.WorkspaceId) =>
  HttpApiClient.make(Api.Api, { baseUrl: apiUrl }).pipe(
    Effect.provide(Layer.merge(bearer(token), WorkspaceMember.layerClient(workspaceId)))
  )

/** A client `client` makes. */
export type Client = Effect.Success<ReturnType<typeof client>>
