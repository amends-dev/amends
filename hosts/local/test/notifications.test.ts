import { Api, Authentication } from "@amends/api-http";
import { Identity } from "@amends/core/identity";
import { Entry, Store } from "@amends/core/journal";
import { Notification, NotificationStore } from "@amends/core/notification";
import { Member, MemberStore, Workspace } from "@amends/core/workspace";
import { SessionTokens } from "@amends/gateway";
import { PostgresDatabase, PostgresStorage } from "@amends/storage-postgresql";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { DevelopmentSignIn } from "../src/authentication/sign-in.ts";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { setup } from "./database.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("alice") });
const outsider = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("outsider") });
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));

/** Real HTTP, gateway and storage; explicit session tokens also exercise an agent principal. */
const server = (url: string) => {
  const identities = new Map<string, Identity.MemberReference>([
    ["human", alice],
    ["bob", bob],
    ["agent", agent],
    ["outsider", outsider],
  ]);
  const sessionTokens = Layer.succeed(
    SessionTokens.Service,
    SessionTokens.Service.of({
      resolve: (token) => {
        const identity = identities.get(Redacted.value(token));
        return identity === undefined
          ? Effect.fail(new SessionTokens.Rejected({ reason: "unknown" }))
          : Effect.succeed(identity);
      },
    }),
  );
  return HttpRouter.serve(LocalServer.layerRoutes, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(Redacted.make(url)),
        DevelopmentSignIn.layer().pipe(Layer.provide(BunCrypto.layer)),
        sessionTokens,
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
};
const record = (
  workspaceId: Workspace.Id,
  id: string,
  recipient: Notification.Recipient,
): Notification.Record => ({
  id: Notification.Id.make(id),
  workspaceId,
  source: { logId: Entry.LogId.make("fixture"), entryId: Entry.Id.make(id) },
  recipient,
  recordedAt: DateTime.makeUnsafe("2026-09-19T12:00:00.123Z"),
  state: { _tag: "Pending" },
});
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("HTTP inbox reads paginate and isolate workspaces, recipients and membership", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const humanClient = yield* client("human");
        const bobClient = yield* client("bob");
        const agentClient = yield* client("agent");
        const outsiderClient = yield* client("outsider");
        const workspace = yield* humanClient.workspaces.create({
          headers: {},
          payload: { name: "Inbox" },
        });
        const otherWorkspace = yield* humanClient.workspaces.create({
          headers: {},
          payload: { name: "Other inbox" },
        });
        const params = { workspaceId: workspace.id };
        expect(yield* humanClient.notifications.list({ params, query: { limit: 10 } })).toEqual([]);
        // Inboxes belong to memberships: the creator's in each workspace, and the seeded members'.
        const owner = Notification.ofMember(workspace.ownerMemberId, alice);
        const bobMemberId = Member.Id.make("bob-member");
        const agentMemberId = Member.Id.make("agent-member");
        const first = record(workspace.id, "a + & é", owner);
        const second = record(workspace.id, "pending", owner);
        const forBob = record(workspace.id, "bob", Notification.ofMember(bobMemberId, bob));
        const forAgent = record(workspace.id, "agent", Notification.ofMember(agentMemberId, agent));
        const foreign = record(
          otherWorkspace.id,
          "foreign",
          Notification.ofMember(otherWorkspace.ownerMemberId, alice),
        );
        // Agent admission is not implemented yet; seed the read models to reach an agent recipient.
        yield* Effect.gen(function* () {
          const storage = yield* PostgresStorage.make();
          const context = yield* storage.forWorkspace(workspace.id);
          const notifications = Context.get(context, NotificationStore.Service);
          const members = Context.get(context, MemberStore.Service);
          yield* Context.get(context, Store.Service).transaction(
            Effect.gen(function* () {
              yield* members.insert({
                id: bobMemberId,
                workspaceId: workspace.id,
                identity: bob,
                status: "active",
              });
              yield* members.insert({
                id: agentMemberId,
                workspaceId: workspace.id,
                identity: agent,
                status: "active",
              });
              yield* Effect.forEach([second, forBob, forAgent, first], notifications.insert);
            }),
          );
          const other = yield* storage.forWorkspace(otherWorkspace.id);
          yield* Context.get(other, Store.Service).transaction(
            Context.get(other, NotificationStore.Service).insert(foreign),
          );
        }).pipe(Effect.provide(PostgresDatabase.layer({ url: Redacted.make(url) })));
        const page = yield* humanClient.notifications.list({ params, query: { limit: 1 } });
        expect(page).toEqual([first]);
        const after = { recordedAt: first.recordedAt, id: first.id };
        expect(
          yield* humanClient.notifications.list({
            params,
            query: { limit: 1, after, pendingOnly: true },
          }),
        ).toEqual([second]);
        expect(
          yield* humanClient.notifications.list({
            params,
            query: {
              limit: 1,
              after: { recordedAt: second.recordedAt, id: second.id },
              pendingOnly: false,
            },
          }),
        ).toEqual([]);
        expect(
          yield* humanClient.notifications.get({
            params: { ...params, notificationId: second.id },
          }),
        ).toEqual(second);
        // Newest first, and without sources the reader cannot reach, as with these fixtures.
        expect(yield* humanClient.notifications.inbox({ params, query: { limit: 1 } })).toEqual([
          { notification: second },
        ]);
        expect(
          yield* humanClient.notifications.inbox({
            params,
            query: { limit: 10, before: { recordedAt: second.recordedAt, id: second.id } },
          }),
        ).toEqual([{ notification: first }]);
        expect(yield* bobClient.notifications.inbox({ params, query: { limit: 10 } })).toEqual([
          { notification: forBob },
        ]);
        expect(yield* bobClient.notifications.list({ params, query: { limit: 10 } })).toEqual([
          forBob,
        ]);
        expect(yield* agentClient.notifications.list({ params, query: { limit: 10 } })).toEqual([
          forAgent,
        ]);
        expect(
          yield* agentClient.notifications.get({
            params: { ...params, notificationId: forAgent.id },
          }),
        ).toEqual(forAgent);
        expect(
          yield* humanClient.notifications.list({
            params: { workspaceId: otherWorkspace.id },
            query: { limit: 10 },
          }),
        ).toEqual([foreign]);
        for (const notificationId of [
          forBob.id,
          forAgent.id,
          foreign.id,
          Notification.Id.make("missing"),
        ]) {
          const response = yield* humanClient.notifications.get({
            params: { ...params, notificationId },
            responseMode: "response-only",
          });
          expect(response.status).toBe(404);
          expect(yield* response.json).toEqual({
            _tag: "NotificationService.NotFound",
            workspaceId: workspace.id,
            notificationId,
          });
        }
        expect(
          (yield* agentClient.notifications.get({
            params: { ...params, notificationId: first.id },
            responseMode: "response-only",
          })).status,
        ).toBe(404);
        expect(
          (yield* outsiderClient.notifications.list({
            params,
            query: { limit: 10 },
            responseMode: "response-only",
          })).status,
        ).toBe(403);
        expect(
          (yield* outsiderClient.notifications.inbox({
            params,
            query: { limit: 10 },
            responseMode: "response-only",
          })).status,
        ).toBe(403);
        yield* humanClient.members.remove({ params: { ...params, memberId: bobMemberId } });
        expect(
          (yield* bobClient.notifications.list({
            params,
            query: { limit: 10 },
            responseMode: "response-only",
          })).status,
        ).toBe(403);
        expect(
          (yield* bobClient.notifications.get({
            params: { ...params, notificationId: forBob.id },
            responseMode: "response-only",
          })).status,
        ).toBe(403);
        const http = yield* HttpClient.HttpClient;
        const base = `/workspaces/${workspace.id}/notifications`;
        const spoofed = yield* http.get(`${base}?limit=10&recipientId=bob&recipientKind=Human`, {
          headers: { authorization: "Bearer human" },
        });
        expect(yield* spoofed.json).toMatchObject([
          { id: first.id, recipient: alice },
          { id: second.id, recipient: alice },
        ]);
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );

  it.live("notification HTTP queries reject malformed input and require authentication", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const humanClient = yield* client("human");
        const workspace = yield* humanClient.workspaces.create({
          headers: {},
          payload: { name: "Inbox" },
        });
        const http = yield* HttpClient.HttpClient;
        const base = `/workspaces/${workspace.id}/notifications`;
        for (const query of [
          "",
          "limit=0",
          "limit=-1",
          "limit=1.5",
          "limit=101",
          "limit=NaN",
          "limit=1&pendingOnly=maybe",
          "limit=1&after=not-json",
          `limit=1&after=${encodeURIComponent(
            JSON.stringify({ recordedAt: "not-a-date", id: "a" }),
          )}`,
          `limit=1&after=${encodeURIComponent(
            JSON.stringify({ recordedAt: "2026-01-01T00:00:00Z" }),
          )}`,
        ]) {
          const response = yield* http.get(`${base}?${query}`, {
            headers: { authorization: "Bearer human" },
          });
          expect(response.status).toBe(400);
        }
        for (const query of [
          "",
          "limit=0",
          "limit=51",
          "limit=1&pendingOnly=maybe",
          "limit=1&before=not-json",
          `limit=1&before=${encodeURIComponent(JSON.stringify({ recordedAt: "not-a-date", id: "a" }))}`,
        ]) {
          const response = yield* http.get(`${base}/inbox?${query}`, {
            headers: { authorization: "Bearer human" },
          });
          expect(response.status).toBe(400);
        }
        for (const path of [base + "?limit=10", base + "/inbox?limit=10", base + "/missing"]) {
          expect((yield* http.get(path)).status).toBe(401);
          expect(
            (yield* http.get(path, { headers: { authorization: "Bearer invalid" } })).status,
          ).toBe(401);
        }
        const rejectedClient = yield* client("invalid");
        expect(
          yield* rejectedClient.notifications
            .list({ params: { workspaceId: workspace.id }, query: { limit: 10 } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "Api.Unauthorized" });
        const openapi = yield* (yield* http.get("/openapi.json")).json;
        expect(openapi).toMatchObject({
          paths: {
            "/workspaces/{workspaceId}/notifications": {
              get: { operationId: "notifications.list" },
            },
            "/workspaces/{workspaceId}/notifications/{notificationId}": {
              get: { operationId: "notifications.get" },
            },
          },
          components: { schemas: { Notification: { type: "object" } } },
        });
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );
});
