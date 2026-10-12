import { Api, Authentication } from "@amends-dev/http";
import { BuiltinRoles } from "@amends-dev/core/authorization";
import { Identity } from "@amends-dev/core/identity";
import { Request } from "@amends-dev/core/request";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import * as DevelopmentAuthentication from "../src/DevelopmentAuthentication.ts";
import * as LocalHost from "../src/LocalHost.ts";
import * as LocalServer from "../src/LocalServer.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const secret = "sk-mcp-connections-test";
/** Where nothing listens, so checking a connection to it reaches nothing. */
const nowhere = "http://127.0.0.1:1/mcp";
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api.Api).pipe(Effect.provide(asToken(token)));
/** The real routes, gateway, integrations, and PostgreSQL storage behind a Bun test server. */
const server = (url: string, credentialKey: Redacted.Redacted<string> | undefined) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      DevelopmentAuthentication.layer(() => Effect.void).pipe(
        Layer.provide(BunCrypto.layer),
        Layer.provideMerge(LocalHost.layer(Redacted.make(url), { credentialKey })),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
const credentialKey = Redacted.make(Base64.encode(crypto.getRandomValues(new Uint8Array(32))));
/** Alice owns a workspace that Bob joined as a member. */
const workspaceWithBob = Effect.gen(function* () {
  const asAlice = yield* client(alice);
  const workspace = yield* asAlice.workspaces.create({
    headers: {},
    payload: { name: "Studio", memberName: "alice" },
  });
  const invitation = yield* asAlice.invitations.issue({
    headers: {},
    params: { workspaceId: workspace.id },
    payload: {
      email: "bob@example.com",
      expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
      roleId: BuiltinRoles.MemberId,
    },
  });
  // Development tokens are human IDs: Bob's is his account's, which the invitation names.
  const asBob = yield* client(invitation.details.recipientId);
  yield* asBob.invitations.accept({
    params: { workspaceId: workspace.id, invitationId: invitation.details.id },
    payload: { name: "bob" },
  });
  return { asAlice, asBob, workspaceId: workspace.id };
});
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "connections are set up, checked, and managed over HTTP, and their keys never return",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const { asAlice, asBob, workspaceId } = yield* workspaceWithBob;
          // Every member sees what this host installed, with the form each one's settings make.
          const integrations = yield* asBob.connections.integrations({ params: { workspaceId } });
          expect(integrations.find((integration) => integration.id === "mcp")).toMatchObject({
            name: "MCP server",
            auth: ["apiKey", "none"],
            provides: ["tools"],
            settings: {
              type: "object",
              properties: { url: { type: "string", title: "Server URL" } },
              required: ["url"],
            },
          });
          expect(integrations.find((integration) => integration.id === "amends")).toMatchObject({
            auth: ["none"],
            provides: ["harnesses"],
            settings: { type: "object", properties: {} },
          });

          const payload = {
            integration: "mcp",
            name: "Tools",
            settings: { url: nowhere },
            auth: "apiKey",
            apiKey: Redacted.make(secret),
          } as const;
          const headers = { "idempotency-key": Request.Key.make("create-tools") };
          const created = yield* asAlice.connections.create({
            params: { workspaceId },
            headers,
            payload,
          });
          expect(created).toMatchObject({
            name: "Tools",
            integration: "mcp",
            settings: { url: nowhere },
            auth: "apiKey",
            readiness: { _tag: "Ready" },
            manageable: true,
          });
          // A retried create answers with the connection it made.
          expect(
            (yield* asAlice.connections.create({ params: { workspaceId }, headers, payload })).id,
          ).toBe(created.id);
          const params = { workspaceId, connectionId: created.id };

          // Members read connections but only administrators add, change, or check them.
          expect(yield* asBob.connections.list({ params: { workspaceId } })).toMatchObject([
            { id: created.id, manageable: false },
          ]);
          expect(
            yield* asBob.connections
              .replaceKey({ params, payload: { apiKey: Redacted.make("sk-bob") } })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "Authorization.Denied" });
          expect(yield* asBob.connections.check({ params }).pipe(Effect.flip)).toMatchObject({
            _tag: "Authorization.Denied",
          });

          // What the host has not installed, or does not take, is refused before anything is stored.
          expect(
            yield* asAlice.connections
              .create({
                params: { workspaceId },
                headers: {},
                payload: { integration: "missing", name: "Other", settings: {}, auth: "none" },
              })
              .pipe(Effect.flip),
          ).toMatchObject({
            _tag: "ConnectionService.UnknownIntegration",
            integration: "missing",
          });
          expect(
            yield* asAlice.connections
              .create({
                params: { workspaceId },
                headers: {},
                payload: { integration: "mcp", name: "Other", settings: {}, auth: "none" },
              })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "ConnectionService.InvalidConnection" });

          // The key is stored, and no read of the connection carries it.
          const read = (path: string) =>
            HttpClient.execute(
              HttpClientRequest.get(`/workspaces/${workspaceId}/connections${path}`).pipe(
                HttpClientRequest.bearerToken(alice),
              ),
            ).pipe(Effect.flatMap((response) => response.text));
          expect(yield* read("")).not.toContain(secret);
          expect(yield* read(`/${created.id}`)).not.toContain(secret);

          // Checking reaches the server the settings name, where nothing answers.
          expect(yield* asAlice.connections.check({ params })).toMatchObject({
            status: "unavailable",
          });

          const renamed = yield* asAlice.connections.rename({
            params,
            payload: { name: "Search tools", expectedName: "Tools" },
          });
          expect(renamed.name).toBe("Search tools");
          expect(
            yield* asAlice.connections
              .rename({ params, payload: { name: "Other", expectedName: "Tools" } })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "CoreError.Changed" });
          const configured = yield* asAlice.connections.configure({
            params,
            payload: { settings: { url: "http://127.0.0.1:2/mcp", keyHeader: "X-Api-Key" } },
          });
          expect(configured.settings).toEqual({
            url: "http://127.0.0.1:2/mcp",
            keyHeader: "X-Api-Key",
          });
          expect(
            yield* asAlice.connections
              .configure({ params, payload: { settings: { url: nowhere, region: "eu" } } })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "ConnectionService.InvalidConnection" });
          expect(
            (yield* asAlice.connections.replaceKey({
              params,
              payload: { apiKey: Redacted.make("sk-replaced") },
            })).id,
          ).toBe(created.id);
          expect(yield* read(`/${created.id}`)).not.toContain("sk-replaced");

          // A connection that authenticates with nothing takes no key.
          const agent = yield* asAlice.connections.create({
            params: { workspaceId },
            headers: {},
            payload: { integration: "amends", name: "Agent", settings: {}, auth: "none" },
          });
          expect(
            yield* asAlice.connections.check({
              params: { workspaceId, connectionId: agent.id },
            }),
          ).toEqual({ status: "healthy" });
          expect(
            yield* asAlice.connections
              .replaceKey({
                params: { workspaceId, connectionId: agent.id },
                payload: { apiKey: Redacted.make(secret) },
              })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "ConnectionService.Keyless" });

          yield* asAlice.connections.remove({ params });
          expect(yield* asBob.connections.get({ params }).pipe(Effect.flip)).toMatchObject({
            _tag: "CoreError.NotFound",
          });
          expect(yield* asBob.connections.list({ params: { workspaceId } })).toMatchObject([
            { id: agent.id },
          ]);
        }).pipe(Effect.scoped, Effect.provide(server(url, credentialKey))),
      ),
  );

  it.live("a host without a credential key refuses keys but keeps keyless connections", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, workspaceId } = yield* workspaceWithBob;
        expect(
          yield* asAlice.connections
            .create({
              params: { workspaceId },
              headers: {},
              payload: {
                integration: "mcp",
                name: "Tools",
                settings: { url: nowhere },
                auth: "apiKey",
                apiKey: Redacted.make(secret),
              },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ConnectionService.CredentialsUnavailable" });
        expect(yield* asAlice.connections.list({ params: { workspaceId } })).toEqual([]);
        expect(
          yield* asAlice.connections.create({
            params: { workspaceId },
            headers: {},
            payload: {
              integration: "mcp",
              name: "Tools",
              settings: { url: nowhere },
              auth: "none",
            },
          }),
        ).toMatchObject({ name: "Tools", auth: "none", readiness: { _tag: "Ready" } });
      }).pipe(Effect.scoped, Effect.provide(server(url, undefined))),
    ),
  );
});
