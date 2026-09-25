import { Api, Authentication, Unauthorized } from "@amends/api-http";
import { Cause, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { AtomHttpApi } from "effect/unstable/reactivity";
import { sessionAtom, signOutAtom } from "../session/state.ts";

/** One endpoint configuration per app instance; each credential session owns its registry. */
export function createApiClient(
  baseUrl: string,
  transport: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
) {
  class Client extends AtomHttpApi.Service<Client>()("@amends/client/api/ApiClient", {
    api: Api,
    baseUrl,
    httpClient: (get) => {
      const session = get(sessionAtom);
      const signOut = get(signOutAtom);
      // Any request the host rejects as unauthenticated signs out the credential it carried,
      // so operations need no handling of their own.
      const rejecting = Layer.effect(
        HttpClient.HttpClient,
        Effect.map(
          HttpClient.HttpClient,
          HttpClient.tap((response) =>
            response.status === 401 ? Effect.sync(signOut) : Effect.void,
          ),
        ),
      ).pipe(Layer.provide(transport));
      return Layer.mergeAll(
        session ? rejecting : transport,
        HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
          next(session ? HttpClientRequest.bearerToken(request, session.token) : request),
        ),
      );
    },
  }) {}
  return Client;
}
export type ApiClient = ReturnType<typeof createApiClient>;

const unauthorized = Schema.is(Unauthorized);
export const isUnauthorized = (cause: Cause.Cause<unknown>): boolean =>
  cause.reasons.some((reason) => Cause.isFailReason(reason) && unauthorized(reason.error));
