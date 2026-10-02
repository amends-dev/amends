import { Api as Contract, Authentication, Unauthorized } from "@amends/api-http";
import { Cause, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { AtomHttpApi } from "effect/unstable/reactivity";
import type { SignIn } from "./contracts.ts";

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly transport?: Layer.Layer<HttpClient.HttpClient> | undefined;
  /** The credential every request carries; none for a guest. */
  readonly session?: SignIn.Session | undefined;
  /** Called when the host rejects the credential, so operations need no handling of their own. */
  readonly rejected?: () => void;
}

/** The typed API for one credential: each session gets its own client, runtime, and reads. */
export function createApiClient(options: ApiClientOptions) {
  const transport = options.transport ?? FetchHttpClient.layer;
  const { session, rejected = () => {} } = options;
  const signingOut = Layer.effect(
    HttpClient.HttpClient,
    Effect.map(
      HttpClient.HttpClient,
      HttpClient.tap((response) => (response.status === 401 ? Effect.sync(rejected) : Effect.void)),
    ),
  ).pipe(Layer.provide(transport));
  class Client extends AtomHttpApi.Service<Client>()("@amends/client/api/ApiClient", {
    api: Contract,
    baseUrl: options.baseUrl,
    httpClient: Layer.mergeAll(
      session ? signingOut : transport,
      HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
        next(session ? HttpClientRequest.bearerToken(request, session.token) : request),
      ),
    ),
  }) {}
  return Client;
}
export type ApiClient = ReturnType<typeof createApiClient>;
/** The generated HTTP client operations call. */
export type Api = ApiClient["Service"];

const unauthorized = Schema.is(Unauthorized);
export const isUnauthorized = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some((reason) => Cause.isFailReason(reason) && unauthorized(reason.error));
