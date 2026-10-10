import { ThreadParticipation } from "@amends/core/thread";
import { Api, Authentication, Group, type ThreadTimeline } from "@amends/api-http";
import { BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Request } from "@amends/core/request";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { HttpBody, HttpClient, HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
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
  const joined = yield* asBob.invitations.accept({
    params: { workspaceId: workspace.id, invitationId: invitation.details.id },
    payload: {},
  });
  return { asAlice, asBob, workspace, aliceId: workspace.ownerMemberId, bobId: joined.id };
});
const texts = (items: ReadonlyArray<ThreadTimeline.Item>) =>
  items.flatMap((item) =>
    "message" in item && item.message.content._tag === "Text" ? [item.message.content.text] : [],
  );
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
        // Members create groups too, and a private one of theirs is theirs alone: the owner, who
        // is not in it, can neither see it nor get into it.
        const mine = yield* asBob.groups.create({
          params: { workspaceId },
          headers: {},
          payload: { name: "Mine", memberIds: [bobId] },
        });
        const outside = { workspaceId, groupId: mine.id };
        expect(yield* asAlice.groups.get({ params: outside }).pipe(Effect.flip)).toMatchObject({
          _tag: "GroupService.NotFound",
        });
        expect(
          yield* asAlice.groups
            .addMember({ params: outside, payload: { memberId: aliceId } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupMembershipService.GroupNotFound" });
        expect(
          yield* asAlice.groups
            .rename({ params: outside, payload: { name: "Ours", expectedName: "Mine" } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupService.NotFound" });
        expect(
          yield* asAlice.groups
            .members({ params: outside, query: { limit: 10 } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupMembershipService.GroupNotFound" });
        // Bob leaves his group again; the rest of the conversation happens in Design.
        const [kept] = yield* asBob.groups.members({ params: outside, query: { limit: 10 } });
        yield* asBob.groups.leave({ params: { ...outside, membershipId: kept!.id } });
        // Each can ask what they may do: both may create groups.
        for (const client of [asAlice, asBob])
          expect(yield* client.assignments.permissions({ params: { workspaceId } })).toContain(
            "group.create",
          );
        const groupId = group.id;
        // Any member of a private group adds and removes its people and renames it.
        expect(
          yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } }),
        ).toContainEqual({
          group,
          latestActivityAt: null,
          readAt: null,
          newActivity: false,
          following: false,
          pending: 0,
          manageable: true,
          membersRemovable: true,
          renamable: true,
        });
        expect(
          yield* asAlice.groups.list({ params: { workspaceId }, query: { limit: 10 } }),
        ).toMatchObject([
          { group: { id: group.id }, manageable: true, renamable: true },
          // The workspace's general group, which Alice starts in, sorts after generated IDs.
          { group: { id: Group.GeneralId } },
        ]);
        // Alice renames it; Bob may too, and the same name again changes nothing.
        const renamed = yield* asAlice.groups.rename({
          params: { workspaceId, groupId: group.id },
          payload: { name: "Product design", expectedName: "Design" },
        });
        expect(renamed).toEqual({ ...group, name: "Product design" });
        expect(
          yield* asBob.groups.rename({
            params: { workspaceId, groupId: group.id },
            payload: { name: "Product design", expectedName: "Product design" },
          }),
        ).toEqual(renamed);
        // Renaming from a name that has since changed would replace that rename unseen.
        expect(
          yield* asAlice.groups
            .rename({
              params: { workspaceId, groupId: group.id },
              payload: { name: "Plans", expectedName: "Design" },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupService.Changed", groupId: group.id });
        yield* asAlice.groups.rename({
          params: { workspaceId, groupId: group.id },
          payload: { name: "Design", expectedName: "Product design" },
        });
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
          content: { _tag: "Text", text: "Can you review the draft?", mentions: [aliceId] },
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

        // The mention reached Alice's inbox, which shows it with the message that made it.
        const inbox = yield* asAlice.notifications.inbox({
          params: { workspaceId },
          query: { limit: 10, pendingOnly: true },
        });
        expect(inbox).toMatchObject([{ source: { message: { id: started.message.id } } }]);
        const notificationId = inbox[0]!.notification.id;
        expect(yield* asAlice.notifications.count({ params: { workspaceId } })).toEqual({
          pending: 1,
        });
        const seen = yield* asAlice.notifications.markSeen({
          params: { workspaceId, notificationId },
        });
        expect(seen.state).toMatchObject({ _tag: "Seen" });
        // Marking it again, as another device might, keeps the first time.
        expect(
          yield* asAlice.notifications.markSeen({ params: { workspaceId, notificationId } }),
        ).toEqual(seen);
        expect(
          yield* asAlice.notifications.inbox({
            params: { workspaceId },
            query: { limit: 10, pendingOnly: true },
          }),
        ).toEqual([]);
        expect(yield* asAlice.notifications.count({ params: { workspaceId } })).toEqual({
          pending: 0,
        });
        // Seeing everything through it again has nothing left to mark.
        expect(
          yield* asAlice.notifications.markSeenThrough({
            params: { workspaceId },
            payload: { through: { recordedAt: seen.recordedAt, id: seen.id } },
          }),
        ).toEqual({ marked: 0 });
        expect(
          yield* asAlice.notifications.inbox({ params: { workspaceId }, query: { limit: 10 } }),
        ).toMatchObject([{ notification: seen }]);

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
            message: { id: started.message.id, content: { text: "Can you review the draft?" } },
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
        ).toMatchObject({ _tag: "ReadStateService.BeyondTimeline", latestSequence: latest });
        yield* asBob.groups.markRead({ params: { workspaceId, groupId } });
        const [row] = yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } });
        expect(row).toMatchObject({ newActivity: false });
        expect(row!.readAt).not.toBeNull();

        // Bob stops following the thread; he still reads it through the group.
        const own = participants.find(
          (participant) =>
            ThreadParticipation.Reference.isAnyOf(["Member"])(participant.participant) &&
            participant.participant.memberId === bobId,
        )!;
        yield* asBob.threads.unfollow({
          params: { workspaceId, threadId },
          payload: { participationId: own.id },
        });
        expect(
          yield* asBob.threads
            .unfollow({ params: { workspaceId, threadId }, payload: { participationId: own.id } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ThreadParticipationService.AlreadyEnded" });
        const followed = yield* asBob.threads.follow({ params: { workspaceId, threadId } });
        expect(followed.participant).toEqual({ _tag: "Member", memberId: bobId });
        expect(followed.id).not.toBe(own.id);

        yield* asBob.groups.follow({
          params: { workspaceId, groupId },
          payload: { memberId: bobId },
        });
        // Bob is also in the workspace's general group, which he does not follow.
        expect(
          yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } }),
        ).toMatchObject([
          { following: true },
          { group: { id: Group.GeneralId }, following: false },
        ]);
        yield* asBob.groups.unfollow({
          params: { workspaceId, groupId },
          payload: { memberId: bobId },
        });
        // Only agents can be made to follow by someone else.
        expect(
          yield* asAlice.groups
            .follow({ params: { workspaceId, groupId }, payload: { memberId: bobId } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupFollowService.AgentRequired" });

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
        // Only the general group remains, which nobody leaves.
        expect(
          (yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } })).map(
            (item) => item.group.id,
          ),
        ).toEqual([Group.GeneralId]);
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );

  it.live("a public group is found and joined over HTTP; its threads stay with its members", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const { asAlice, asBob, workspace, aliceId, bobId } = yield* workspaceWithBob;
        const workspaceId = workspace.id;
        const lobby = yield* asAlice.groups.create({
          params: { workspaceId },
          headers: {},
          payload: { name: "Lobby", memberIds: [aliceId], visibility: "Public" },
        });
        const secret = yield* asAlice.groups.create({
          params: { workspaceId },
          headers: {},
          payload: { name: "Secret", memberIds: [aliceId] },
        });
        expect(lobby).toMatchObject({ kind: "Team", visibility: "Public" });
        expect(secret).toMatchObject({ kind: "Team", visibility: "Private" });
        const groupId = lobby.id;
        yield* asAlice.threads.start({
          params: { workspaceId, groupId },
          headers: {},
          payload: { text: "Welcome, everyone.", mentions: [] },
        });
        // Bob, a member, finds the public group but not the private one, and cannot read in yet.
        // He is already in the general group, which he joined with the workspace.
        const browse = () =>
          asBob.groups
            .listPublic({ params: { workspaceId }, query: { limit: 10 } })
            .pipe(Effect.map((items) => items.filter((item) => !Group.isGeneral(item.group))));
        expect(yield* browse()).toEqual([{ group: lobby, members: 1, joined: false }]);
        expect(
          yield* asBob.threads
            .list({ params: { workspaceId, groupId }, query: { limit: 10 } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ThreadService.GroupNotFound" });
        // Joining admits him, once; he then reads its threads like any member.
        const joined = yield* asBob.groups.join({ params: { workspaceId, groupId } });
        expect(joined).toMatchObject({ groupId, memberId: bobId, status: "active" });
        expect(yield* asBob.groups.join({ params: { workspaceId, groupId } })).toEqual(joined);
        expect(yield* browse()).toEqual([{ group: lobby, members: 2, joined: true }]);
        expect(
          yield* asBob.threads.list({ params: { workspaceId, groupId }, query: { limit: 10 } }),
        ).toHaveLength(1);
        expect(
          (yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } })).map(
            (item) => item.group.id,
          ),
        ).toEqual([groupId, Group.GeneralId]);
        // A private group answers as missing, as it does to anyone outside it.
        expect(
          yield* asBob.groups
            .join({ params: { workspaceId, groupId: secret.id } })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "GroupMembershipService.GroupNotFound" });
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
        // Everyone in it takes part in every thread, so none of them can be unfollowed.
        const participants = yield* asBob.threads.participants({
          params: { workspaceId, threadId: direct.thread.id },
          query: { limit: 10 },
        });
        const own = participants.find(
          (participant) =>
            ThreadParticipation.Reference.isAnyOf(["Member"])(participant.participant) &&
            participant.participant.memberId === bobId,
        )!;
        expect(
          yield* asBob.threads
            .unfollow({
              params: { workspaceId, threadId: direct.thread.id },
              payload: { participationId: own.id },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "ThreadParticipationService.FixedParticipation" });
        const [row] = yield* asBob.groups.list({ params: { workspaceId }, query: { limit: 10 } });
        expect(row).toMatchObject({
          group: { id: groupId, kind: "Direct", memberIds: [aliceId, bobId].sort() },
          newActivity: true,
          // A direct group keeps the members it started with.
          manageable: false,
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
        expect(newest).toMatchObject({
          thread: second.thread,
          message: { content: { text: "Another one" } },
        });
        expect(
          yield* asBob.threads.openings({
            params: { workspaceId, groupId },
            query: {
              limit: 10,
              before: { createdAt: newest!.thread.createdAt, threadId: newest!.thread.id },
            },
          }),
        ).toMatchObject([
          { thread: direct.thread, message: { content: { text: "Quick question" } }, replies: 0 },
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
            "/workspaces/{workspaceId}/notifications/inbox": {
              get: { operationId: "notifications.inbox" },
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
