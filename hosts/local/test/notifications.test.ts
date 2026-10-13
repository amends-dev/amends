import { Identity } from "@amends-dev/core/identity";
import { Entry, Store } from "@amends-dev/core/journal";
import { Notification, NotificationStore } from "@amends-dev/core/notification";
import { Member, MemberStore, Workspace } from "@amends-dev/core/workspace";
import { SessionTokens } from "@amends-dev/gateway";
import { PostgresDatabase, PostgresWorkspaceStorage } from "@amends-dev/storage-postgresql";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Context, DateTime, Effect, Layer, Redacted } from "effect";
import { HttpClient, HttpRouter } from "effect/http";
import * as DevelopmentSignIn from "../src/DevelopmentSignIn.ts";
import * as LocalHost from "../src/LocalHost.ts";
import * as LocalServer from "../src/LocalServer.ts";
import { setup } from "./database.ts";
import { client } from "./client.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("alice") });
const outsider = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("outsider") });

/** Real HTTP, gateway and storage; explicit session tokens also exercise an agent principal. */
const server = (url: string) => {
  const identities = new Map<string, Identity.MemberReference>([
    ["human", alice],
    ["bob", bob],
    ["agent", agent],
    ["outsider", outsider],
  ]);
  const sessionTokens = Layer.succeed(
    SessionTokens.SessionTokens,
    SessionTokens.SessionTokens.of({
      resolve: (token) => {
        const identity = identities.get(Redacted.value(token));
        return identity === undefined
          ? Effect.fail(new SessionTokens.Rejected({ reason: "unknown" }))
          : Effect.succeed(identity);
      },
      revoke: () => Effect.void,
    }),
  );
  return HttpRouter.serve(LocalServer.layerRoutes, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(
      Layer.merge(
        DevelopmentSignIn.layer().pipe(
          Layer.provide(BunCrypto.layer),
          Layer.provideMerge(LocalHost.layer(Redacted.make(url))),
        ),
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
): Notification.Notification => ({
  id: Notification.Id.make(id),
  workspaceId,
  source: { logId: Entry.LogId.make("fixture"), entryId: Entry.Id.make(id) },
  recipient,
  recordedAt: DateTime.makeUnsafe("2026-09-19T12:00:00.123Z"),
  state: { _tag: "Pending" },
});
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "HTTP inbox reads page newest first and isolate workspaces, recipients and membership",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const creator = yield* client("human");
          const workspace = yield* creator.workspaces.create({
            headers: {},
            payload: { name: "Inbox", memberName: "alice" },
          });
          const otherWorkspace = yield* creator.workspaces.create({
            headers: {},
            payload: { name: "Other inbox", memberName: "alice" },
          });
          const humanClient = yield* client("human", workspace.id);
          const bobClient = yield* client("bob", workspace.id);
          const agentClient = yield* client("agent", workspace.id);
          const outsiderClient = yield* client("outsider", workspace.id);
          expect(yield* humanClient.notifications.inbox({ query: { limit: 10 } })).toEqual([]);
          // Inboxes belong to memberships: the creator's in each workspace, and the seeded members'.
          const owner = Notification.ofMember(workspace.ownerMemberId, alice);
          const bobMemberId = Member.Id.make("bob-member");
          const agentMemberId = Member.Id.make("agent-member");
          const first = record(workspace.id, "a + & é", owner);
          const second = record(workspace.id, "pending", owner);
          const forBob = record(workspace.id, "bob", Notification.ofMember(bobMemberId, bob));
          const forAgent = record(
            workspace.id,
            "agent",
            Notification.ofMember(agentMemberId, agent),
          );
          const foreign = record(
            otherWorkspace.id,
            "foreign",
            Notification.ofMember(otherWorkspace.ownerMemberId, alice),
          );
          // Agent admission is not implemented yet; seed the read models to reach an agent recipient.
          yield* Effect.gen(function* () {
            const storage = yield* PostgresWorkspaceStorage.make();
            const context = yield* storage.forWorkspace(workspace.id);
            const notifications = Context.get(context, NotificationStore.NotificationStore);
            const members = Context.get(context, MemberStore.MemberStore);
            yield* Context.get(context, Store.Store).transaction(
              Effect.gen(function* () {
                yield* members.insert({
                  id: bobMemberId,
                  workspaceId: workspace.id,
                  identity: bob,
                  name: Member.Name.make("bob"),
                  status: "active",
                });
                yield* members.insert({
                  id: agentMemberId,
                  workspaceId: workspace.id,
                  identity: agent,
                  name: Member.Name.make("agent"),
                  status: "active",
                });
                yield* Effect.forEach([second, forBob, forAgent, first], notifications.insert);
              }),
            );
            const other = yield* storage.forWorkspace(otherWorkspace.id);
            yield* Context.get(other, Store.Store).transaction(
              Context.get(other, NotificationStore.NotificationStore).insert(foreign),
            );
          }).pipe(Effect.provide(PostgresDatabase.layer({ url: Redacted.make(url) })));
          // Newest first, and without sources the reader cannot reach, as with these fixtures.
          expect(yield* humanClient.notifications.inbox({ query: { limit: 1 } })).toEqual([
            { notification: second },
          ]);
          expect(
            yield* humanClient.notifications.inbox({
              query: { limit: 10, before: { recordedAt: second.recordedAt, id: second.id } },
            }),
          ).toEqual([{ notification: first }]);
          expect(yield* bobClient.notifications.inbox({ query: { limit: 10 } })).toEqual([
            { notification: forBob },
          ]);
          expect(
            yield* humanClient.notifications.inbox({
              query: { limit: 10, pendingOnly: true },
            }),
          ).toEqual([{ notification: second }, { notification: first }]);
          expect(yield* humanClient.notifications.count()).toEqual({ pending: 2 });
          expect(yield* agentClient.notifications.inbox({ query: { limit: 10 } })).toEqual([
            { notification: forAgent },
          ]);
          expect(
            yield* (yield* client("human", otherWorkspace.id)).notifications.inbox({
              query: { limit: 10 },
            }),
          ).toEqual([{ notification: foreign }]);
          for (const notificationId of [
            forBob.id,
            forAgent.id,
            foreign.id,
            Notification.Id.make("missing"),
          ]) {
            const response = yield* humanClient.notifications.markSeen({
              params: { notificationId },
              responseMode: "response-only",
            });
            expect(response.status).toBe(404);
            expect(yield* response.json).toEqual({
              _tag: "CoreError.NotFound",
              resource: "Notification",
              id: notificationId,
            });
          }
          expect(
            (yield* agentClient.notifications.markSeen({
              params: { notificationId: first.id },
              responseMode: "response-only",
            })).status,
          ).toBe(404);
          expect(
            (yield* outsiderClient.notifications.inbox({
              query: { limit: 10 },
              responseMode: "response-only",
            })).status,
          ).toBe(403);
          yield* humanClient.members.remove({ params: { memberId: bobMemberId } });
          expect(
            (yield* bobClient.notifications.inbox({
              query: { limit: 10 },
              responseMode: "response-only",
            })).status,
          ).toBe(403);
          expect(
            (yield* bobClient.notifications.markSeen({
              params: { notificationId: forBob.id },
              responseMode: "response-only",
            })).status,
          ).toBe(403);
          const http = yield* HttpClient.HttpClient;
          const spoofed = yield* http.get(
            "/notifications/inbox?limit=10&recipientId=bob&recipientKind=Human",
            { headers: { authorization: "Bearer human", "amends-workspace": workspace.id } },
          );
          expect(yield* spoofed.json).toMatchObject([
            { notification: { id: second.id, recipient: alice } },
            { notification: { id: first.id, recipient: alice } },
          ]);
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
  );

  it.live("inbox HTTP queries reject malformed input and require authentication", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const workspace = yield* (yield* client("human")).workspaces.create({
          headers: {},
          payload: { name: "Inbox", memberName: "alice" },
        });
        const http = yield* HttpClient.HttpClient;
        const base = "/notifications";
        const inWorkspace = { "amends-workspace": workspace.id };
        for (const query of [
          "",
          "limit=0",
          "limit=51",
          "limit=1&pendingOnly=maybe",
          "limit=1&before=not-json",
          `limit=1&before=${encodeURIComponent(JSON.stringify({ recordedAt: "not-a-date", id: "a" }))}`,
        ]) {
          const response = yield* http.get(`${base}/inbox?${query}`, {
            headers: { authorization: "Bearer human", ...inWorkspace },
          });
          expect(response.status).toBe(400);
        }
        for (const path of [base + "/inbox?limit=10", base + "/count"]) {
          expect((yield* http.get(path, { headers: inWorkspace })).status).toBe(401);
          expect(
            (yield* http.get(path, {
              headers: { authorization: "Bearer invalid", ...inWorkspace },
            })).status,
          ).toBe(401);
        }
        const rejectedClient = yield* client("invalid", workspace.id);
        expect(
          yield* rejectedClient.notifications.inbox({ query: { limit: 10 } }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "Authentication.Unauthorized" });
        const openapi = yield* (yield* http.get("/openapi.json")).json;
        expect(openapi).toMatchObject({
          paths: {
            "/notifications/inbox": {
              get: {
                operationId: "notifications.inbox",
                parameters: expect.arrayContaining([
                  expect.objectContaining({
                    name: "Amends-Workspace",
                    in: "header",
                    required: true,
                  }),
                ]),
              },
            },
            "/notifications/{notificationId}/seen": {
              post: { operationId: "notifications.markSeen" },
            },
          },
          components: { schemas: { Notification: { type: "object" } } },
        });
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );
});
