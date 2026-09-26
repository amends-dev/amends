import { Api, Authentication, type ThreadTimeline } from "@amends/api-http";
import { BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Request } from "@amends/core/request";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { HttpBody, HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http";
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
const server = (url: string) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(Redacted.make(url)),
        DevelopmentAuthentication.layer(() => Effect.void).pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
/** Alice owns a workspace that Bob joined as a viewer. */
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
      roleId: BuiltinRoles.ViewerId,
    },
  });
  const joined = yield* asBob.invitations.accept({
    params: { workspaceId: workspace.id, invitationId: invitation.details.id },
  });
  return { asAlice, asBob, workspace, aliceId: workspace.ownerMemberId, bobId: joined.id };
});
const texts = (items: ReadonlyArray<ThreadTimeline.Item>) =>
  items.flatMap((item) => ("message" in item ? [item.message.text] : []));
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live("a conversation runs over HTTP: a group, a thread, replies, mentions, and reading", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspace, aliceId, bobId } = yield* workspaceWithBob;
        const workspaceId = workspace.id;
        const create = (key: string) =>
          asAlice.groups.create({
            params: { workspaceId },
            headers: { "idempotency-key": Request.Key.make(key) },
            payload: { name: "Design", memberIds: [aliceId, bobId] },
          });
        const group = yield* create("group-1");
        expect(group).toMatchObject({ kind: "Team", name: "Design", createdBy: aliceId });
        expect(yield* create("group-1")).toEqual(group);
        // Viewers take part in conversations but do not create groups.
        const refused = yield* asBob.groups
          .create({
            params: { workspaceId },
            headers: {},
            payload: { name: "Mine", memberIds: [bobId] },
          })
          .pipe(Effect.flip);
        expect(refused).toMatchObject({ _tag: "Authorization.Denied" });
        const groupId = group.id;
        expect(yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } })).toEqual(
          [
            {
              group,
              latestActivityAt: null,
              caughtUpAt: null,
              newActivity: false,
              following: false,
              pending: 0,
            },
          ],
        );
        const roster = yield* asBob.groups.members({
          params: { workspaceId, groupId },
          query: { limit: 10 },
        });
        expect(roster.map((admission) => admission.memberId).sort()).toEqual(
          [aliceId, bobId].sort(),
        );

        const started = yield* asBob.threads.start({
          params: { workspaceId, groupId },
          headers: { "idempotency-key": Request.Key.make("start-1") },
          payload: { text: "Can you review the draft?", mentions: [aliceId] },
        });
        expect(started.thread).toMatchObject({
          groupId,
          createdBy: { _tag: "Member", memberId: bobId },
        });
        expect(started.message).toMatchObject({
          text: "Can you review the draft?",
          mentions: [aliceId],
        });
        const threadId = started.thread.id;
        expect(yield* asAlice.threads.get({ params: { workspaceId, threadId } })).toEqual(
          started.thread,
        );
        const listed = yield* asAlice.threads.list({
          params: { workspaceId, groupId },
          query: { limit: 10 },
        });
        expect(listed).toMatchObject([{ thread: started.thread, readThrough: null, unread: true }]);

        // The mention reached Alice's inbox and resolves to the message that made it.
        const inbox = yield* asAlice.notifications.list({
          params: { workspaceId },
          query: { limit: 10, pendingOnly: true },
        });
        expect(inbox).toHaveLength(1);
        const notificationId = inbox[0]!.id;
        expect(
          yield* asAlice.notifications.source({ params: { workspaceId, notificationId } }),
        ).toMatchObject({ message: { id: started.message.id } });
        const seen = yield* asAlice.notifications.acknowledge({
          params: { workspaceId, notificationId },
        });
        expect(seen.state).toMatchObject({ _tag: "Acknowledged", outcome: { _tag: "Seen" } });
        // Acknowledging again, as another device might, keeps the first acknowledgment.
        expect(
          yield* asAlice.notifications.acknowledge({ params: { workspaceId, notificationId } }),
        ).toEqual(seen);

        const reply = yield* asAlice.threads.publish({
          params: { workspaceId, threadId },
          headers: { "idempotency-key": Request.Key.make("reply-1") },
          payload: { text: "On it.", mentions: [] },
        });
        expect(
          yield* asAlice.threads.publish({
            params: { workspaceId, threadId },
            headers: { "idempotency-key": Request.Key.make("reply-1") },
            payload: { text: "On it.", mentions: [] },
          }),
        ).toEqual(reply);
        const timeline = yield* asBob.threads.timeline({
          params: { workspaceId, threadId },
          query: { limit: 50 },
        });
        expect(texts(timeline)).toEqual(["Can you review the draft?", "On it."]);
        const latest = timeline.at(-1)!.activity.sequence;
        // The group's stream shows the thread by its opening message, with the reply counted.
        expect(
          yield* asBob.threads.openings({ params: { workspaceId, groupId }, query: { limit: 10 } }),
        ).toMatchObject([
          {
            thread: started.thread,
            message: { id: started.message.id, text: "Can you review the draft?" },
            replies: 1,
            latest: { sequence: latest },
          },
        ]);
        const newest = yield* asBob.threads.timeline({
          params: { workspaceId, threadId },
          query: { limit: 1, from: "newest" },
        });
        expect(newest).toEqual([timeline.at(-1)]);
        const earlier = yield* asBob.threads.timeline({
          params: { workspaceId, threadId },
          query: { limit: 50, beforeSequence: latest },
        });
        expect(earlier).toEqual(timeline.slice(0, -1));

        const participants = yield* asBob.threads.participants({
          params: { workspaceId, threadId },
          query: { limit: 10 },
        });
        expect(
          participants
            .map((participant) => participant.participant)
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        ).toEqual(
          [
            { _tag: "Member", memberId: aliceId },
            { _tag: "Member", memberId: bobId },
          ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
        );

        // Reading moves Alice's position; a position past the timeline is refused.
        yield* asAlice.threads.markRead({
          params: { workspaceId, threadId },
          payload: { throughSequence: latest },
        });
        expect(
          yield* asAlice.threads.list({ params: { workspaceId, groupId }, query: { limit: 10 } }),
        ).toMatchObject([{ readThrough: latest, unread: false }]);
        expect(
          yield* asAlice.threads
            .markRead({
              params: { workspaceId, threadId },
              payload: { throughSequence: latest + 1 },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ReadStateApplication.BeyondTimeline", latestSequence: latest });
        yield* asBob.groups.markRead({ params: { workspaceId, groupId } });
        const [row] = yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } });
        expect(row).toMatchObject({ newActivity: false });
        expect(row!.caughtUpAt).not.toBeNull();

        // Bob stops following the thread; he still reads it through the group.
        const own = participants.find(
          (participant) =>
            participant.participant._tag === "Member" && participant.participant.memberId === bobId,
        )!;
        yield* asBob.threads.unfollow({
          params: { workspaceId, threadId },
          payload: { participationId: own.id },
        });
        expect(
          yield* asBob.threads
            .unfollow({ params: { workspaceId, threadId }, payload: { participationId: own.id } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ThreadParticipationApplication.AlreadyEnded" });
        const followed = yield* asBob.threads.follow({ params: { workspaceId, threadId } });
        expect(followed.participant).toEqual({ _tag: "Member", memberId: bobId });
        expect(followed.id).not.toBe(own.id);

        yield* asBob.groups.follow({
          params: { workspaceId, groupId },
          payload: { memberId: bobId },
        });
        expect(
          yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } }),
        ).toMatchObject([{ following: true }]);
        yield* asBob.groups.unfollow({
          params: { workspaceId, groupId },
          payload: { memberId: bobId },
        });
        // Only agents can be made to follow by someone else.
        expect(
          yield* asAlice.groups
            .follow({ params: { workspaceId, groupId }, payload: { memberId: bobId } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupFollowApplication.AgentRequired" });

        // Leaving the group ends Bob's access to it and its threads.
        const admission = roster.find((entry) => entry.memberId === bobId)!;
        const left = yield* asBob.groups.leave({
          params: { workspaceId, groupId, membershipId: admission.id },
        });
        expect(left).toMatchObject({ id: admission.id, status: "removed" });
        const statuses = yield* Effect.all([
          asBob.groups.get({ params: { workspaceId, groupId }, responseMode: "response-only" }),
          asBob.threads.get({ params: { workspaceId, threadId }, responseMode: "response-only" }),
          asBob.threads.timeline({
            params: { workspaceId, threadId },
            query: { limit: 10 },
            responseMode: "response-only",
          }),
          asBob.threads.publish({
            params: { workspaceId, threadId },
            headers: {},
            payload: { text: "Still here?", mentions: [] },
            responseMode: "response-only",
          }),
        ]).pipe(Effect.map((responses) => responses.map((response) => response.status)));
        expect(statuses).toEqual([404, 404, 404, 404]);
        expect(yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } })).toEqual(
          [],
        );
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );

  it.live("direct threads, thread pages, rosters, and outsiders over HTTP", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspace, aliceId, bobId } = yield* workspaceWithBob;
        const workspaceId = workspace.id;
        const direct = yield* asAlice.threads.startDirect({
          params: { workspaceId },
          headers: {},
          payload: { memberIds: [bobId], text: "Quick question", mentions: [] },
        });
        const second = yield* asBob.threads.startDirect({
          params: { workspaceId },
          headers: {},
          payload: { memberIds: [aliceId], text: "Another one", mentions: [] },
        });
        // The same people always share one direct group.
        expect(second.thread.groupId).toBe(direct.thread.groupId);
        const groupId = direct.thread.groupId;
        const [row] = yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } });
        expect(row).toMatchObject({
          group: { id: groupId, kind: "Direct", memberIds: [aliceId, bobId].sort() },
          newActivity: true,
        });
        const first = yield* asBob.threads.list({
          params: { workspaceId, groupId },
          query: { limit: 1 },
        });
        expect(first.map((item) => item.thread.id)).toEqual([second.thread.id]);
        const rest = yield* asBob.threads.list({
          params: { workspaceId, groupId },
          query: {
            limit: 1,
            before: { latestActivityAt: first[0]!.latest.occurredAt, threadId: second.thread.id },
          },
        });
        expect(rest.map((item) => item.thread.id)).toEqual([direct.thread.id]);
        const [newest] = yield* asBob.threads.openings({
          params: { workspaceId, groupId },
          query: { limit: 1 },
        });
        expect(newest).toMatchObject({ thread: second.thread, message: { text: "Another one" } });
        expect(
          yield* asBob.threads.openings({
            params: { workspaceId, groupId },
            query: {
              limit: 10,
              before: { createdAt: newest!.thread.createdAt, threadId: newest!.thread.id },
            },
          }),
        ).toMatchObject([
          { thread: direct.thread, message: { text: "Quick question" }, replies: 0 },
        ]);
        // Direct groups have fixed members and nothing to follow.
        const roster = yield* asAlice.groups.members({
          params: { workspaceId, groupId },
          query: { limit: 10 },
        });
        const fixed = yield* Effect.all([
          asAlice.groups.addMember({
            params: { workspaceId, groupId },
            payload: { memberId: aliceId },
            responseMode: "response-only",
          }),
          asAlice.groups.removeMember({
            params: { workspaceId, groupId, membershipId: roster[0]!.id },
            responseMode: "response-only",
          }),
          asAlice.groups.follow({
            params: { workspaceId, groupId },
            payload: { memberId: aliceId },
            responseMode: "response-only",
          }),
        ]).pipe(Effect.map((responses) => responses.map((response) => response.status)));
        expect(fixed).toEqual([409, 409, 409]);
        const outsider = yield* client("carol");
        expect(
          yield* outsider.groups
            .list({ params: { workspaceId }, query: { limit: 10 } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "Gateway.NotMember" });

        const http = yield* HttpClient.HttpClient;
        const authorization = { authorization: "Bearer alice" };
        for (const query of [
          "",
          "limit=0",
          "limit=101",
          "limit=1&before=not-json",
          `limit=1&before=${encodeURIComponent(JSON.stringify({ threadId: "x" }))}`,
        ]) {
          const response = yield* http.get(
            `/workspaces/${workspaceId}/groups/${groupId}/threads?${query}`,
            { headers: authorization },
          );
          expect(response.status).toBe(400);
        }
        const timeline = `/workspaces/${workspaceId}/threads/${direct.thread.id}/timeline`;
        for (const query of ["limit=10&from=middle", "limit=10&afterSequence=5&beforeSequence=5"])
          expect((yield* http.get(`${timeline}?${query}`, { headers: authorization })).status).toBe(
            400,
          );
        const blank = yield* http.post(
          `/workspaces/${workspaceId}/threads/${direct.thread.id}/messages`,
          {
            headers: authorization,
            body: HttpBody.jsonUnsafe({ text: "   ", mentions: [] }),
          },
        );
        expect(blank.status).toBe(400);
        expect((yield* http.get(`${timeline}?limit=10`)).status).toBe(401);
        const openapi = yield* (yield* http.get("/openapi.json")).json;
        expect(openapi).toMatchObject({
          paths: {
            "/workspaces/{workspaceId}/groups": { get: { operationId: "groups.list" } },
            "/workspaces/{workspaceId}/groups/{groupId}/threads": {
              get: { operationId: "threads.list" },
              post: { operationId: "threads.start" },
            },
            "/workspaces/{workspaceId}/groups/{groupId}/openings": {
              get: { operationId: "threads.openings" },
            },
            "/workspaces/{workspaceId}/threads/{threadId}/timeline": {
              get: { operationId: "threads.timeline" },
            },
            "/workspaces/{workspaceId}/notifications/{notificationId}/source": {
              get: { operationId: "notifications.source" },
            },
          },
          components: {
            schemas: { TimelineItem: {}, GroupListItem: {}, ThreadListItem: {}, ThreadOpening: {} },
          },
        });
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );
});
