import { WorkspaceId } from "@amends-dev/core/workspace"
import * as Contract from "@amends-dev/http/Api"
import * as Authentication from "@amends-dev/http/Authentication"
import * as WorkspaceMember from "@amends-dev/http/WorkspaceMember"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as HttpApiClient from "effect/http-api/HttpApiClient"
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"
import * as Atom from "effect/reactivity/Atom"
import * as AtomHttpApi from "effect/reactivity/AtomHttpApi"
import * as Schema from "effect/Schema"
import type { SignIn } from "./contracts.ts"

export interface ApiClientOptions {
  readonly baseUrl: string
  readonly transport?: Layer.Layer<HttpClient.HttpClient> | undefined
  /** The credential every request carries; none for a guest. */
  readonly session?: SignIn.Session | undefined
  /** Called when the host rejects the credential, so operations need no handling of their own. */
  readonly rejected?: () => void
}

/**
 * How a credential's requests travel: with its bearer token, naming the workspace they act in when
 * there is one, and reporting a rejection of the credential.
 */
const httpClientOf = (options: ApiClientOptions, workspaceId?: string) => {
  const transport = options.transport ?? FetchHttpClient.layer
  const { session, rejected = () => {} } = options
  const signingOut = Layer.effect(
    HttpClient.HttpClient,
    Effect.map(
      HttpClient.HttpClient,
      HttpClient.tap((response) => (response.status === 401 ? Effect.sync(rejected) : Effect.void))
    )
  ).pipe(Layer.provide(transport))
  return Layer.mergeAll(
    session ? signingOut : transport,
    HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
      next(session ? HttpClientRequest.bearerToken(request, session.token) : request)
    ),
    workspaceId === undefined
      ? WorkspaceMember.layerClientOutsideWorkspace
      : WorkspaceMember.layerClient(WorkspaceId.WorkspaceId.make(workspaceId))
  )
}

/**
 * The typed API for one credential, acting in the workspace `workspaceId` when one is given: the
 * session and each workspace it reaches get their own client, runtime, and reads. A client in no
 * workspace calls no member's endpoint.
 */
export function createApiClient(options: ApiClientOptions, workspaceId?: string) {
  class Client extends AtomHttpApi.Service<Client>()(
    workspaceId === undefined ? "@amends-dev/client/api/ApiClient" : `@amends-dev/client/api/ApiClient/${workspaceId}`,
    {
      api: Contract.Api,
      baseUrl: options.baseUrl,
      httpClient: httpClientOf(options, workspaceId)
    }
  ) {}
  return Client
}

/**
 * Ask the host to stop honoring a credential, as signing out does. It runs apart from any
 * credential's client, since signing out replaces that client; a failure leaves the credential to
 * expire on its own.
 */
export const revokeSession = (options: ApiClientOptions) =>
  HttpApiClient.make(Contract.Api, { baseUrl: options.baseUrl }).pipe(
    Effect.flatMap((api) => api.me.signOut()),
    Effect.provide(httpClientOf(options)),
    Effect.timeout("10 seconds"),
    Effect.ignore
  )
export type ApiClient = ReturnType<typeof createApiClient>
/** The generated HTTP client a workspace's operations call. */
export type WorkspaceApi = ApiClient["Service"]
/** The part of it a client in no workspace calls: signing in, the account, and its workspaces. */
export type Api = Pick<WorkspaceApi, "session" | "me" | "workspaces">

const unauthorized = Schema.is(Authentication.Unauthorized)
export const isUnauthorized = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some((reason) => Cause.isFailReason(reason) && unauthorized(reason.error))

/** One read per client and key, shared by every consumer while any is mounted. */
export const perClient = <K extends string, A extends object>(make: (client: ApiClient, key: K) => A) => {
  const families = new WeakMap<ApiClient, (key: K) => A>()
  return (client: ApiClient, key: K): A => {
    const family = families.get(client) ?? Atom.family((key: K) => make(client, key))
    families.set(client, family)
    return family(key)
  }
}
