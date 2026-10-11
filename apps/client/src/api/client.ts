import { Api as Contract, Authentication, Unauthorized } from "@amends-dev/api-http";
import { Cause, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import { AtomHttpApi } from "effect/reactivity";
import type { SignIn } from "./contracts.ts";

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly transport?: Layer.Layer<HttpClient.HttpClient> | undefined;
  /** The credential every request carries; none for a guest. */
  readonly session?: SignIn.Session | undefined;
  /** Called when the host rejects the credential, so operations need no handling of their own. */
  readonly rejected?: () => void;
}

/** How a credential's requests travel: with its bearer token, reporting a rejection of it. */
const httpClientOf = (options: ApiClientOptions) => {
  const transport = options.transport ?? FetchHttpClient.layer;
  const { session, rejected = () => {} } = options;
  const signingOut = Layer.effect(
    HttpClient.HttpClient,
    Effect.map(
      HttpClient.HttpClient,
      HttpClient.tap((response) => (response.status === 401 ? Effect.sync(rejected) : Effect.void)),
    ),
  ).pipe(Layer.provide(transport));
  return Layer.mergeAll(
    session ? signingOut : transport,
    HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
      next(session ? HttpClientRequest.bearerToken(request, session.token) : request),
    ),
  );
};

/** The typed API for one credential: each session gets its own client, runtime, and reads. */
export function createApiClient(options: ApiClientOptions) {
  class Client extends AtomHttpApi.Service<Client>()("@amends-dev/client/api/ApiClient", {
    api: Contract,
    baseUrl: options.baseUrl,
    httpClient: httpClientOf(options),
  }) {}
  return Client;
}

/**
 * Ask the host to stop honoring a credential, as signing out does. It runs apart from any
 * credential's client, since signing out replaces that client; a failure leaves the credential to
 * expire on its own.
 */
export const revokeSession = (options: ApiClientOptions) =>
  HttpApiClient.make(Contract, { baseUrl: options.baseUrl }).pipe(
    Effect.flatMap((api) => api.me.signOut()),
    Effect.provide(httpClientOf(options)),
    Effect.timeout("10 seconds"),
    Effect.ignore,
  );
export type ApiClient = ReturnType<typeof createApiClient>;
/** The generated HTTP client operations call. */
export type Api = ApiClient["Service"];

const unauthorized = Schema.is(Unauthorized);
export const isUnauthorized = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some((reason) => Cause.isFailReason(reason) && unauthorized(reason.error));
