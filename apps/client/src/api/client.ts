import { Api, Authentication, Unauthorized } from "@amends/api-http";
import { Cause, Layer, Schema } from "effect";
import { FetchHttpClient, type HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { AtomHttpApi } from "effect/unstable/reactivity";
import { sessionAtom } from "../session/state.ts";

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
      return Layer.mergeAll(
        transport,
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
