import { Api, Authentication, ConnectionImplementation } from "@amends/api-http";
import { BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Encoding, Layer, Redacted } from "effect";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { DevelopmentAuthentication } from "../src/authentication/authentication.ts";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const bob = Identity.HumanId.make("bob");
const secret = "sk-ant-connections-test";
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));
/** The real routes, gateway, and PostgreSQL storage behind a Bun test server. */
const server = (url: string, credentialKey: Redacted.Redacted<string> | undefined) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(Redacted.make(url), { credentialKey }),
        DevelopmentAuthentication.layer(() => Effect.void).pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
const credentialKey = Redacted.make(
  Encoding.encodeBase64(crypto.getRandomValues(new Uint8Array(32))),
);
/** Alice owns a workspace that Bob joined as a member. */
const workspaceWithBob = Effect.gen(function* () {
  const asAlice = yield* client(alice);
  const asBob = yield* client(bob);
  const workspace = yield* asAlice.workspaces.create({ headers: {}, payload: { name: "Studio" } });
  const invitation = yield* asAlice.invitations.issue({
    headers: {},
    params: { workspaceId: workspace.id },
    payload: {
      recipientId: bob,
      expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
      roleId: BuiltinRoles.MemberId,
    },
  });
  yield* asBob.invitations.accept({
    params: { workspaceId: workspace.id, invitationId: invitation.details.id },
    payload: {},
  });
  return { asAlice, asBob, workspaceId: workspace.id };
});
const anthropic = ConnectionImplementation.Id.make("anthropic");
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("connections are added, keyed, and managed over HTTP, and their keys never return", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspaceId } = yield* workspaceWithBob;
        // Every member sees what this host installed.
        const implementations = yield* asBob.connections.implementations({
          params: { workspaceId },
        });
        expect(implementations.map((implementation) => implementation.id)).toEqual([
          "anthropic",
          "openai-compatible",
          "daytona",
        ]);

        const created = yield* asAlice.connections.create({
          params: { workspaceId },
          headers: {},
          payload: {
            name: "Anthropic",
            implementationId: anthropic,
            settings: {},
            authentication: "ApiKey",
          },
        });
        expect(created).toMatchObject({
          name: "Anthropic",
          authentication: { _tag: "ApiKey", configured: false },
          manageable: true,
          readiness: { modelInference: { _tag: "Incomplete", settings: [], credential: true } },
        });
        const params = { workspaceId, connectionId: created.id };

        // Members read connections but only administrators add or change them.
        expect(yield* asBob.connections.list({ params: { workspaceId } })).toMatchObject([
          { id: created.id, manageable: false },
        ]);
        expect(
          yield* asBob.connections
            .setCredential({ params, payload: { secret: Redacted.make(secret) } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        expect(
          yield* asAlice.connections
            .create({
              params: { workspaceId },
              headers: {},
              payload: {
                name: "Other",
                implementationId: ConnectionImplementation.Id.make("missing"),
                settings: {},
                authentication: "ApiKey",
              },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ConnectionApplication.UnknownImplementation" });
        expect(
          yield* asAlice.connections
            .configure({ params, payload: { settings: { baseUrl: "not a url" } } })
            .pipe(Effect.flip),
        ).toMatchObject({
          _tag: "ConnectionApplication.InvalidSettings",
          issues: ["API URL must be an http or https URL."],
        });

        const keyed = yield* asAlice.connections.setCredential({
          params,
          payload: { secret: Redacted.make(secret) },
        });
        expect(keyed).toMatchObject({
          authentication: { _tag: "ApiKey", configured: true },
          readiness: { modelInference: { _tag: "Ready" } },
        });
        // The key is stored, and no read of the connection carries it.
        const raw = yield* HttpClient.execute(
          HttpClientRequest.get(`/workspaces/${workspaceId}/connections`).pipe(
            HttpClientRequest.bearerToken(alice),
          ),
        ).pipe(Effect.flatMap((response) => response.text));
        expect(raw).not.toContain(secret);

        const renamed = yield* asAlice.connections.rename({
          params,
          payload: { name: "Claude", expectedName: "Anthropic" },
        });
        expect(renamed.name).toBe("Claude");
        expect(
          yield* asAlice.connections
            .rename({ params, payload: { name: "Other", expectedName: "Anthropic" } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ConnectionApplication.Changed" });

        expect(yield* asAlice.connections.clearCredential({ params })).toMatchObject({
          authentication: { _tag: "ApiKey", configured: false },
        });
        yield* asAlice.connections.remove({ params });
        expect(yield* asBob.connections.get({ params }).pipe(Effect.flip)).toMatchObject({
          _tag: "ConnectionApplication.NotFound",
        });
        expect(yield* asBob.connections.list({ params: { workspaceId } })).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(server(url, credentialKey))),
    ),
  );

  it.live("a host without a credential key refuses keys but keeps connections", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, workspaceId } = yield* workspaceWithBob;
        const created = yield* asAlice.connections.create({
          params: { workspaceId },
          headers: {},
          payload: {
            name: "Anthropic",
            implementationId: anthropic,
            settings: {},
            authentication: "ApiKey",
          },
        });
        expect(
          yield* asAlice.connections
            .setCredential({
              params: { workspaceId, connectionId: created.id },
              payload: { secret: Redacted.make(secret) },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ConnectionApplication.CredentialsUnavailable" });
      }).pipe(Effect.scoped, Effect.provide(server(url, undefined))),
    ),
  );
});
