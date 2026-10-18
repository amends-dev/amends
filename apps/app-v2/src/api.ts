/**
 * The host's HTTP API, as the app calls it: the contract's client at the host's address, sending
 * the session's token when there is one. The app calls only what comes before a workspace over
 * HTTP; what a member does in one goes through their store.
 */

import * as Api from "@amends-dev/http/Api"
import * as Authentication from "@amends-dev/http/Authentication"
import * as WorkspaceMember from "@amends-dev/http/WorkspaceMember"
import * as Effect from "effect/Effect"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"

/** The API at `apiUrl`, as the bearer of `token` when one is given. */
export const client = (apiUrl: string, token?: string) =>
  HttpApiClient.make(Api.Api, { baseUrl: apiUrl }).pipe(
    Effect.provide(
      Layer.merge(
        HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
          next(token === undefined ? request : HttpClientRequest.bearerToken(request, token))
        ),
        WorkspaceMember.layerClientOutsideWorkspace
      )
    )
  )

/** A client `client` makes. */
export type Client = Effect.Success<ReturnType<typeof client>>
