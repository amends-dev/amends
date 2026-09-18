import { Api, Authentication } from "@amends/api-http";
import { Layer } from "effect";
import { FetchHttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { AtomHttpApi } from "effect/unstable/reactivity";
import { sessionAtom } from "../session/session.ts";

/**
 * Typed client and query atoms over the HTTP contract; the dev proxy maps /api
 * to the host. Authenticated endpoints carry the session token as the bearer
 * credential. Changing the session rebuilds the client and re-runs its queries.
 */
export class ApiClient extends AtomHttpApi.Service<ApiClient>()("ApiClient", {
  api: Api,
  baseUrl: "/api",
  httpClient: (get) => {
    const session = get(sessionAtom);
    return Layer.mergeAll(
      FetchHttpClient.layer,
      HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
        next(
          session === undefined ? request : HttpClientRequest.bearerToken(request, session.token),
        ),
      ),
    );
  },
}) {}
