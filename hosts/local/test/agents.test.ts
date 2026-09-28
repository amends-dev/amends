import { Api, Authentication, ConnectionImplementation, Environment } from "@amends/api-http";
import { BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Encoding, Layer, Redacted } from "effect";
import { HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { DevelopmentAuthentication } from "../src/authentication/authentication.ts";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const bob = Identity.HumanId.make("bob");
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
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("agents are added as members, configured, and removed over HTTP", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspaceId } = yield* workspaceWithBob;
        // Each model provider suggests models; the agent names one, or any other.
        const implementations = yield* asAlice.connections.implementations({
          params: { workspaceId },
        });
        const anthropic = implementations.find(({ id }) => id === "anthropic");
        expect(anthropic?.capabilities.modelInference?.models?.map(({ id }) => id)).toContain(
          "claude-sonnet-5",
        );
        const models = yield* asAlice.connections.create({
          params: { workspaceId },
          headers: {},
          payload: {
            name: "Anthropic",
            implementationId: ConnectionImplementation.Id.make("anthropic"),
            settings: {},
            authentication: "ApiKey",
          },
        });
        const model = { connectionId: models.id, model: "claude-sonnet-5", reasoning: null };

        // The in-process environment can run it once the key is set.
        expect(
          yield* asAlice.agents.environmentChoices({
            params: { workspaceId },
            query: { connectionId: models.id, model: "claude-sonnet-5" },
          }),
        ).toEqual([
          {
            environmentId: Environment.InProcessId,
            compatibility: { _tag: "Incompatible", reasons: [{ _tag: "ConnectionNotReady" }] },
          },
        ]);
        const created = yield* asAlice.agents.create({
          params: { workspaceId },
          headers: {},
          payload: {
            name: "Reviewer",
            instructions: "Review each change for correctness.",
            model,
            environmentId: Environment.InProcessId,
            roleId: BuiltinRoles.MemberId,
          },
        });
        expect(created).toMatchObject({
          name: "Reviewer",
          configurable: true,
          usable: true,
          readiness: { _tag: "Incomplete", issues: [{ _tag: "ConnectionNotReady" }] },
        });
        yield* asAlice.connections.setCredential({
          params: { workspaceId, connectionId: models.id },
          payload: { secret: Redacted.make("sk-ant-test") },
        });
        const params = { workspaceId, agentId: created.id };
        expect(yield* asBob.agents.get({ params })).toMatchObject({
          readiness: { _tag: "Ready" },
          configurable: false,
          usable: true,
        });
        // The agent is a member of the workspace, named as it was created.
        expect(
          (yield* asBob.members.list({ params: { workspaceId } })).find(
            ({ id }) => id === created.memberId,
          ),
        ).toMatchObject({ identity: { _tag: "Agent", id: created.id }, name: "Reviewer" });

        // Members read agents; administrators change them.
        expect(
          yield* asBob.agents
            .rename({ params, payload: { name: "Mine", expectedName: "Reviewer" } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        expect(
          yield* asAlice.agents
            .configure({
              params,
              payload: {
                instructions: "Review.",
                model: Object.assign({}, model, { reasoning: "high" }),
                environmentId: Environment.InProcessId,
              },
            })
            .pipe(Effect.flip),
        ).toMatchObject({
          _tag: "AgentApplication.Incompatible",
          reasons: [{ _tag: "ReasoningUnsupported", reasoning: "high" }],
        });
        const configured = yield* asAlice.agents.configure({
          params,
          payload: {
            instructions: "Review, then summarize.",
            model: Object.assign({}, model, { model: "claude-opus-5-5" }),
            environmentId: Environment.InProcessId,
          },
        });
        expect(configured).toMatchObject({
          instructions: "Review, then summarize.",
          model: { model: "claude-opus-5-5" },
        });
        expect(
          (yield* asAlice.agents.rename({
            params,
            payload: { name: "Critic", expectedName: "Reviewer" },
          })).name,
        ).toBe("Critic");
        yield* asAlice.agents.remove({ params });
        expect(yield* asBob.agents.get({ params }).pipe(Effect.flip)).toMatchObject({
          _tag: "AgentApplication.NotFound",
        });
        expect(yield* asAlice.agents.list({ params: { workspaceId } })).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(server(url, credentialKey))),
    ),
  );
});
