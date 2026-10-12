import { Api, Authentication } from "@amends-dev/http";
import { BuiltinRoles } from "@amends-dev/core/authorization";
import { Identity } from "@amends-dev/core/identity";
import { Request } from "@amends-dev/core/request";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { Base64 } from "effect/encoding";
import { HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import * as DevelopmentAuthentication from "../src/DevelopmentAuthentication.ts";
import * as LocalHost from "../src/LocalHost.ts";
import * as LocalServer from "../src/LocalServer.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api.Api).pipe(Effect.provide(asToken(token)));
const credentialKey = Redacted.make(Base64.encode(crypto.getRandomValues(new Uint8Array(32))));
/** The real routes, gateway, integrations, and PostgreSQL storage behind a Bun test server. */
const server = (url: string) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      DevelopmentAuthentication.layer(() => Effect.void).pipe(
        Layer.provide(BunCrypto.layer),
        Layer.provideMerge(LocalHost.layer(Redacted.make(url), { credentialKey })),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );

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
  it.live("a connection's models are read over HTTP, as its integration offers them", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspaceId } = yield* workspaceWithBob;
        const connect = (integration: string, apiKey?: string) =>
          asAlice.connections.create({
            params: { workspaceId },
            headers: {},
            payload:
              apiKey === undefined
                ? { integration, name: integration, settings: {}, auth: "none" }
                : {
                    integration,
                    name: integration,
                    settings: {},
                    auth: "apiKey",
                    apiKey: Redacted.make(apiKey),
                  },
          });
        const anthropic = yield* connect("anthropic", "sk-ant-agents-test");
        const harness = yield* connect("amends");

        // A catalog provider lists its models and offers no other; a harness offers none.
        const offered = yield* asBob.connections.models({
          params: { workspaceId, connectionId: anthropic.id },
        });
        expect(offered.unlisted).toBe(false);
        expect(offered.listed.length).toBeGreaterThan(0);
        expect(offered.listed.every((model) => model.id.length > 0)).toBe(true);
        expect(
          yield* asBob.connections.models({ params: { workspaceId, connectionId: harness.id } }),
        ).toEqual({ listed: [], unlisted: false });

        yield* asAlice.connections.remove({
          params: { workspaceId, connectionId: anthropic.id },
        });
        expect(
          yield* asBob.connections
            .models({ params: { workspaceId, connectionId: anthropic.id } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "CoreError.NotFound" });
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );

  it.live("agents are created, configured, renamed, and removed over HTTP", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspaceId } = yield* workspaceWithBob;
        const connect = (integration: string, settings: Record<string, string> = {}) =>
          asAlice.connections.create({
            params: { workspaceId },
            headers: {},
            payload: { integration, name: integration, settings, auth: "none" },
          });
        const amends = yield* connect("amends");
        const opencode = yield* connect("opencode-agent");
        const local = yield* connect("local");
        // An OpenAI-compatible endpoint offers whatever model it is asked for; nothing listens here.
        const models = yield* connect("openai-compatible", { url: "http://127.0.0.1:1/v1" });

        const payload = {
          name: "Reviewer",
          roleId: BuiltinRoles.MemberId,
          instructions: "Review each change.",
          harness: { _tag: "Connection", connectionId: amends.id },
          model: { connectionId: models.id, id: "local-model" },
          sandbox: null,
        } as const;
        const headers = { "idempotency-key": Request.Key.make("create-reviewer") };
        const created = yield* asAlice.agents.create({
          params: { workspaceId },
          headers,
          payload,
        });
        expect(created).toMatchObject({
          name: "Reviewer",
          instructions: "Review each change.",
          harness: { _tag: "Connection", connectionId: amends.id },
          model: { connectionId: models.id, id: "local-model" },
          sandbox: null,
          readiness: { _tag: "Ready" },
          configurable: true,
        });
        // A retried create answers with the agent it made.
        expect(
          (yield* asAlice.agents.create({ params: { workspaceId }, headers, payload })).id,
        ).toBe(created.id);
        const params = { workspaceId, agentId: created.id };

        // The agent is a member of the workspace, under its name.
        expect(
          yield* asBob.members.get({ params: { workspaceId, memberId: created.memberId } }),
        ).toMatchObject({ identity: { _tag: "Agent", id: created.id }, name: "Reviewer" });

        // Members read agents but only administrators add or change them.
        expect(yield* asBob.agents.list({ params: { workspaceId } })).toMatchObject([
          { id: created.id, configurable: false },
        ]);
        expect(
          yield* asBob.agents
            .create({ params: { workspaceId }, headers: {}, payload })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "Authorization.Denied" });

        // A setup that could not run, or names a connection that gives nothing, is refused.
        const inOpencode = {
          ...payload,
          harness: { _tag: "Connection", connectionId: opencode.id },
        } as const;
        expect(
          yield* asAlice.agents
            .create({ params: { workspaceId }, headers: {}, payload: inOpencode })
            .pipe(Effect.flip),
        ).toMatchObject({
          _tag: "AgentService.Incomplete",
          issues: [{ _tag: "SandboxRequired" }],
        });
        expect(
          yield* asAlice.agents
            .create({
              params: { workspaceId },
              headers: {},
              payload: { ...payload, model: { connectionId: local.id, id: "local-model" } },
            })
            .pipe(Effect.flip),
        ).toMatchObject({
          _tag: "AgentService.Incomplete",
          issues: [{ _tag: "Invalid", part: "model", description: "This machine gives no models" }],
        });

        // In a sandbox, opencode can run it.
        const configured = yield* asAlice.agents.configure({
          params,
          payload: {
            instructions: "Review each change, then test it.",
            harness: inOpencode.harness,
            model: { connectionId: models.id, id: "local-model", effort: "high" },
            sandbox: { connectionId: local.id },
          },
        });
        expect(configured).toMatchObject({
          instructions: "Review each change, then test it.",
          harness: { _tag: "Connection", connectionId: opencode.id },
          model: { effort: "high" },
          sandbox: { connectionId: local.id },
          readiness: { _tag: "Ready" },
        });

        // Removing the sandbox's connection leaves the agent unable to run.
        yield* asAlice.connections.remove({ params: { workspaceId, connectionId: local.id } });
        expect(yield* asBob.agents.get({ params })).toMatchObject({
          readiness: {
            _tag: "Incomplete",
            issues: [{ _tag: "Removed", part: "sandbox" }],
          },
        });

        const renamed = yield* asAlice.agents.rename({
          params,
          payload: { name: "Tester", expectedName: "Reviewer" },
        });
        expect(renamed.name).toBe("Tester");
        expect(
          yield* asAlice.agents
            .rename({ params, payload: { name: "Other", expectedName: "Reviewer" } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "CoreError.Changed" });

        // An agent leaves as any member does.
        yield* asAlice.members.remove({ params: { workspaceId, memberId: created.memberId } });
        expect(yield* asBob.agents.get({ params }).pipe(Effect.flip)).toMatchObject({
          _tag: "CoreError.NotFound",
        });
        expect(yield* asAlice.agents.list({ params: { workspaceId } })).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );
});
