import {
  Api,
  Authentication,
  ConnectionImplementation,
  Environment,
  SandboxImplementation,
} from "@amends/api-http";
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
const daytona = SandboxImplementation.Id.make("daytona");
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "environments are listed, added, and managed over HTTP, with Daytona as a connection",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const { asAlice, asBob, workspaceId } = yield* workspaceWithBob;
          // Every member sees what this host installed, and the environment every workspace starts with.
          const implementations = yield* asBob.environments.implementations({
            params: { workspaceId },
          });
          expect(implementations.harnesses.map(({ id }) => id)).toEqual(["amends"]);
          expect(implementations.sandboxes.map(({ id, account }) => [id, account])).toEqual([
            ["local", false],
            ["daytona", true],
          ]);
          expect(yield* asBob.environments.list({ params: { workspaceId } })).toMatchObject([
            {
              id: Environment.InProcessId,
              name: "In-process",
              harnessId: "amends",
              sandbox: null,
              manageable: false,
              readiness: { _tag: "Ready" },
            },
          ]);

          // A Daytona sandbox runs under the workspace's Daytona account, a connection.
          const account = yield* asAlice.connections.create({
            params: { workspaceId },
            headers: {},
            payload: {
              name: "Daytona",
              implementationId: ConnectionImplementation.Id.make("daytona"),
              settings: {},
              authentication: "ApiKey",
            },
          });
          expect(account).toMatchObject({
            capabilities: { sandbox: { provider: "daytona" } },
            readiness: { sandbox: { _tag: "Incomplete", credential: true } },
          });
          const sandbox = {
            providerId: daytona,
            harness: "in-process" as const,
            connectionId: null,
            template: null,
            env: {},
            setup: ["git clone https://github.com/example/app.git"],
            retention: "stop" as const,
          };
          expect(
            yield* asAlice.environments
              .create({
                params: { workspaceId },
                headers: {},
                payload: { name: "Daytona box", harnessId: Environment.inProcessHarness, sandbox },
              })
              .pipe(Effect.flip),
          ).toMatchObject({
            _tag: "EnvironmentApplication.InvalidSandbox",
            issues: ["connection-required"],
          });
          const box = yield* asAlice.environments.create({
            params: { workspaceId },
            headers: {},
            payload: {
              name: "Daytona box",
              harnessId: Environment.inProcessHarness,
              sandbox: Object.assign({}, sandbox, { connectionId: account.id }),
            },
          });
          expect(box).toMatchObject({
            name: "Daytona box",
            sandbox: { providerId: "daytona", connectionId: account.id },
            manageable: true,
            readiness: { _tag: "Incomplete", issues: ["connection-incomplete"] },
          });
          yield* asAlice.connections.setCredential({
            params: { workspaceId, connectionId: account.id },
            payload: { secret: Redacted.make("dtn-test-key") },
          });
          const params = { workspaceId, environmentId: box.id };
          expect((yield* asBob.environments.get({ params })).readiness).toEqual({ _tag: "Ready" });

          // Members read environments; administrators change them.
          expect(
            yield* asBob.environments
              .rename({ params, payload: { name: "Mine", expectedName: "Daytona box" } })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "Authorization.Denied" });
          const configured = yield* asAlice.environments.configure({
            params,
            payload: {
              sandbox: {
                connectionId: account.id,
                template: "daytonaio/sandbox",
                env: { NODE_ENV: "development" },
                setup: ["npm install"],
                retention: "destroy",
              },
            },
          });
          expect(configured.sandbox).toMatchObject({
            template: "daytonaio/sandbox",
            env: { NODE_ENV: "development" },
            setup: ["npm install"],
            retention: "destroy",
          });
          expect(
            yield* asAlice.environments
              .rename({ params, payload: { name: "Other", expectedName: "Somebody's" } })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "EnvironmentApplication.Changed" });
          yield* asAlice.environments.remove({ params });
          expect(yield* asBob.environments.get({ params }).pipe(Effect.flip)).toMatchObject({
            _tag: "EnvironmentApplication.NotFound",
          });
          expect(
            (yield* asAlice.environments.list({ params: { workspaceId } })).map(({ id }) => id),
          ).toEqual([Environment.InProcessId]);
        }).pipe(Effect.scoped, Effect.provide(server(url, credentialKey))),
      ),
  );
});
