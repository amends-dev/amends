import { BuiltinRoles } from "@amends/core/authorization";
import { describe, expect, it } from "@effect/vitest";
import { Api, Authentication } from "@amends/api-http";
import { Identity } from "@amends/core/identity";
import { Member } from "@amends/core/workspace";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { HttpBody, HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { DevelopmentAuthentication } from "../src/authentication/authentication.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const bob = Identity.HumanId.make("bob");
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
/** The real routes, gateway, and PostgreSQL storage behind a Bun test server; codes are captured. */
const server = (url: string) => {
  const delivered = new Map<string, string>();
  const layer = HttpRouter.serve(LocalServer.layerRoutes, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(Redacted.make(url)),
        DevelopmentAuthentication.layer((email, code) =>
          Effect.sync(() => delivered.set(email, code)),
        ).pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
  return { layer, delivered };
};
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("an Idempotency-Key makes a retried creation return the first result", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const post = (path: string, body: unknown, key: string) =>
          http.post(path, {
            headers: { authorization: "Bearer alice", "idempotency-key": key },
            body: HttpBody.jsonUnsafe(body),
          });
        const created = yield* post("/workspaces", { name: "Studio" }, "create-1");
        expect(created.status).toBe(201);
        const workspace = (yield* created.json) as { readonly id: string };
        const retried = yield* post("/workspaces", { name: "Studio" }, "create-1");
        expect(yield* retried.json).toEqual(workspace);
        const reused = yield* post("/workspaces", { name: "Other" }, "create-1");
        expect(reused.status).toBe(422);
        expect(yield* reused.json).toMatchObject({ _tag: "Request.Reused" });
        const invitation = {
          recipientId: "bob",
          roleId: BuiltinRoles.ViewerId,
          expiresAt: "2036-09-20T12:00:00.000Z",
        };
        const path = `/workspaces/${workspace.id}/invitations`;
        const issued = yield* (yield* post(path, invitation, "issue-1")).json;
        expect(yield* (yield* post(path, invitation, "issue-1")).json).toEqual(issued);
        const other = yield* (yield* post(path, invitation, "issue-2")).json;
        expect(other).not.toEqual(issued);
      }).pipe(Effect.scoped, Effect.provide(server(url).layer)),
    ),
  );

  it.live(
    "the HTTP server carries the membership workflow over PostgreSQL with bearer identities",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const fixture = server(url);
          const outcome = yield* Effect.gen(function* () {
            const client = (token: string) =>
              HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));
            const asAlice = yield* client(alice);
            const asBob = yield* client(bob);
            const workspace = yield* asAlice.workspaces.create({
              headers: {},
              payload: { name: "Test workspace" },
            });
            const params = { workspaceId: workspace.id, memberId: workspace.ownerMemberId };
            const owner = yield* asAlice.members.get({ params });
            const outsider = yield* Effect.flip(asBob.members.get({ params }));
            const invitation = yield* asAlice.invitations.issue({
              headers: {},
              params: { workspaceId: workspace.id },
              payload: {
                recipientId: bob,
                expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
                roleId: BuiltinRoles.ViewerId,
              },
            });
            const invitationParams = {
              workspaceId: workspace.id,
              invitationId: invitation.details.id,
            };
            const wrongRecipient = yield* Effect.flip(
              asAlice.invitations.accept({ params: invitationParams }),
            );
            const joined = yield* asBob.invitations.accept({ params: invitationParams });
            const readByBob = yield* asBob.members.get({ params });
            const cannotInvite = yield* Effect.flip(
              asBob.invitations.issue({
                headers: {},
                params: { workspaceId: workspace.id },
                payload: {
                  recipientId: Identity.HumanId.make("charlie"),
                  expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
                  roleId: BuiltinRoles.ViewerId,
                },
              }),
            );
            const members = yield* asAlice.members.list({ params: { workspaceId: workspace.id } });
            const invitations = yield* asAlice.invitations.list({
              params: { workspaceId: workspace.id },
            });
            const cannotList = yield* Effect.flip(
              asBob.invitations.list({ params: { workspaceId: workspace.id } }),
            );
            const removed = yield* asAlice.members.remove({
              params: { workspaceId: workspace.id, memberId: joined.id },
            });
            const afterRemovalList = yield* asAlice.members.list({
              params: { workspaceId: workspace.id },
            });
            const afterRemoval = yield* Effect.flip(asBob.members.get({ params }));
            const missing = yield* asAlice.members.get({
              params: { workspaceId: workspace.id, memberId: Member.Id.make("nobody") },
              responseMode: "response-only",
            });
            return {
              owner,
              outsider,
              invitation,
              wrongRecipient,
              joined,
              readByBob,
              cannotInvite,
              members,
              invitations,
              cannotList,
              removed,
              afterRemoval,
              afterRemovalList,
              missingStatus: missing.status,
            };
          }).pipe(Effect.scoped, Effect.provide(fixture.layer));
          expect(outcome.owner.identity).toEqual({ _tag: "Human", id: alice });
          expect(outcome.outsider).toMatchObject({ _tag: "Gateway.NotMember" });
          expect(outcome.invitation.state).toEqual({ _tag: "Pending" });
          expect(outcome.wrongRecipient).toMatchObject({
            _tag: "InvitationApplication.NotRecipient",
          });
          expect(outcome.joined).toMatchObject({
            identity: { _tag: "Human", id: bob },
            status: "active",
          });
          expect(outcome.readByBob.id).toBe(outcome.owner.id);
          expect(outcome.cannotInvite).toMatchObject({ _tag: "Authorization.Denied" });
          expect(
            outcome.members.map((member) => member.id).sort((a, b) => a.localeCompare(b)),
          ).toEqual([outcome.owner.id, outcome.joined.id].sort((a, b) => a.localeCompare(b)));
          expect(outcome.invitations).toMatchObject([
            { details: { id: outcome.invitation.details.id }, state: { _tag: "Accepted" } },
          ]);
          expect(outcome.cannotList).toMatchObject({ _tag: "Authorization.Denied" });
          expect(outcome.removed).toMatchObject({ id: outcome.joined.id, status: "removed" });
          expect(
            outcome.afterRemovalList
              .map((member) => member.status)
              .sort((a, b) => a.localeCompare(b)),
          ).toEqual(["active", "removed"]);
          expect(outcome.afterRemoval).toMatchObject({ _tag: "Gateway.NotMember" });
          expect(outcome.missingStatus).toBe(404);
        }),
      ),
  );

  it.live(
    "email sign-in issues a session the server accepts, and the directory lists what it can reach",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const fixture = server(url);
          const outcome = yield* Effect.gen(function* () {
            const anonymous = yield* HttpApiClient.make(Api).pipe(Effect.provide(asToken("")));
            const email = "jo@mercier.co";
            yield* anonymous.session.start({ payload: { email } });
            const code = fixture.delivered.get(email);
            if (code === undefined) return yield* Effect.die("No code was delivered");
            const wrong = yield* Effect.flip(
              anonymous.session.complete({
                payload: { email, code: code === "000000" ? "000001" : "000000" },
              }),
            );
            const session = yield* anonymous.session.complete({ payload: { email, code } });
            const reused = yield* Effect.flip(
              anonymous.session.complete({ payload: { email, code } }),
            );
            const client = yield* HttpApiClient.make(Api).pipe(
              Effect.provide(asToken(session.token)),
            );
            const before = yield* client.me.workspaces();
            const workspace = yield* client.workspaces.create({
              headers: {},
              payload: { name: "Test workspace" },
            });
            const inviter = yield* HttpApiClient.make(Api).pipe(Effect.provide(asToken(alice)));
            const other = yield* inviter.workspaces.create({
              headers: {},
              payload: { name: "Test workspace" },
            });
            const invitation = yield* inviter.invitations.issue({
              headers: {},
              params: { workspaceId: other.id },
              payload: {
                recipientId: session.humanId,
                expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
                roleId: BuiltinRoles.ViewerId,
              },
            });
            const after = yield* client.me.workspaces();
            yield* client.invitations.accept({
              params: { workspaceId: other.id, invitationId: invitation.details.id },
            });
            const joined = yield* client.me.workspaces();
            return { wrong, session, reused, before, workspace, other, after, joined };
          }).pipe(Effect.scoped, Effect.provide(fixture.layer));
          expect(outcome.wrong).toMatchObject({ _tag: "SignIn.Rejected", reason: "mismatch" });
          expect(outcome.session.humanId).toBe(Identity.HumanId.make("jo@mercier.co"));
          expect(outcome.reused).toMatchObject({ _tag: "SignIn.Rejected", reason: "unknown" });
          expect(outcome.before).toEqual({ memberships: [], invitations: [] });
          expect(outcome.after.memberships).toMatchObject([
            {
              workspace: { id: outcome.workspace.id },
              member: { status: "active" },
              activeMemberCount: 1,
            },
          ]);
          expect(outcome.after.invitations).toMatchObject([
            { details: { workspaceId: outcome.other.id }, state: { _tag: "Pending" } },
          ]);
          expect(outcome.joined.invitations).toEqual([]);
          const activeMemberCounts = new Map(
            outcome.joined.memberships.map((m) => [m.workspace.id, m.activeMemberCount]),
          );
          expect(activeMemberCounts).toEqual(
            new Map([
              [outcome.workspace.id, 1],
              [outcome.other.id, 2],
            ]),
          );
        }),
      ),
  );

  it.live(
    "allows desktop CORS preflights and includes CORS headers on authentication failures",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          for (const origin of [
            "http://127.0.0.1:1420",
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
          ]) {
            const preflight = yield* client.options("/workspaces", {
              headers: {
                origin,
                "access-control-request-method": "POST",
                "access-control-request-headers":
                  "authorization,content-type,idempotency-key,traceparent,b3",
              },
            });
            expect(preflight.status).toBe(204);
            expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
            expect(preflight.headers["access-control-allow-headers"]?.toLowerCase()).toContain(
              "authorization",
            );
            expect(preflight.headers["access-control-allow-headers"]?.toLowerCase()).toContain(
              "b3",
            );
            expect(preflight.headers["access-control-allow-headers"]?.toLowerCase()).toContain(
              "idempotency-key",
            );
            const denied = yield* client.get("/me/workspaces", { headers: { origin } });
            expect(denied.status).toBe(401);
            expect(denied.headers["access-control-allow-origin"]).toBe(origin);
          }
          const other = yield* client.options("/session/code", {
            headers: {
              origin: "https://untrusted.invalid",
              "access-control-request-method": "POST",
            },
          });
          expect(other.headers["access-control-allow-origin"]).toBeUndefined();
        }).pipe(Effect.provide(server(url).layer)),
      ),
  );
});
