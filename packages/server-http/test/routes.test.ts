import { Request } from "@amends/core/request";
import { BuiltinRoles } from "@amends/core/authorization";
import { expect, it } from "@effect/vitest";
import { Api, Authentication } from "@amends/api-http";
import type * as Core from "@amends/core";
import { Authorization, Requirement, Target } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Entry } from "@amends/core/journal";
import { Notification, NotificationApplication } from "@amends/core/notification";
import {
  Group,
  GroupApplication,
  GroupFollowApplication,
  GroupMembership,
  GroupMembershipApplication,
} from "@amends/core/group";
import {
  Thread,
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipation,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import { ReadStateApplication } from "@amends/core/attention";
import {
  Invitation,
  InvitationApplication,
  Member,
  MemberApplication,
  MemberPermissions,
  Workspace,
} from "@amends/core/workspace";
import { Credentials, Gateway, GatewayErrors, SignIn, WorkspaceDirectory } from "@amends/gateway";
import { DateTime, Effect, Layer, Redacted } from "effect";
import { HttpClientRequest, HttpServer } from "effect/unstable/http";
import { HttpApiMiddleware, HttpApiTest } from "effect/unstable/httpapi";
import { Routes } from "../src/index.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const workspaceId = Workspace.Id.make("workspace-one");
const memberId = Member.Id.make("member-one");
const member: Member.Record = { id: memberId, workspaceId, identity: alice, status: "active" };
const workspace: Workspace.Record = {
  id: workspaceId,
  createdBy: alice.id,
  name: "Test workspace",
  ownerMemberId: memberId,
};

/** Records every call so encoding can be checked without storage. */
const calls: Array<{ readonly operation: string; readonly arguments: ReadonlyArray<unknown> }> = [];
const record =
  <A extends ReadonlyArray<unknown>, R>(operation: string, respond: (...args: A) => R) =>
  (...args: A) => {
    calls.push({ operation, arguments: args });
    return respond(...args);
  };
const denied = new Authorization.Denied({
  memberId,
  requirement: Requirement.make(
    MemberPermissions.Read,
    Target.Reference.cases.Member.make({ workspaceId, memberId }),
  ),
});
const actor = Actor.Value.make({ workspaceId, memberId, identity: alice });
const notification: Notification.Record = {
  id: Notification.Id.make("pending"),
  workspaceId,
  source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make("entry-one") },
  recipient: Notification.ofMember(memberId, alice),
  recordedAt: DateTime.makeUnsafe("2026-01-01T00:00:00.123Z"),
  state: { _tag: "Pending" },
};
const groupId = Group.Id.make("group-one");
const team: Group.TeamRecord = {
  id: groupId,
  workspaceId,
  kind: "Team",
  visibility: "Private",
  name: "Studio",
  createdBy: memberId,
  createdAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
};
const threadId = Thread.Id.make("thread-one");
/** Conversation services record their inputs; failures show that each tag keeps its status. */
const conversations = Layer.mergeAll(
  Layer.succeed(
    GroupApplication.Service,
    GroupApplication.Service.of({
      workspaceId,
      createTeam: record("group.create", () => Effect.succeed(team)),
      rename: record("group.rename", () => Effect.succeed(team)),
      get: record("group.get", (id) => Effect.fail(new GroupApplication.NotFound({ groupId: id }))),
      listMine: record("group.listMine", () => Effect.succeed([])),
      listPublic: record("group.listPublic", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    GroupMembershipApplication.Service,
    GroupMembershipApplication.Service.of({
      workspaceId,
      add: record("group.add", (input) =>
        Effect.fail(new GroupMembershipApplication.AlreadyMember(input)),
      ),
      join: record("group.join", (groupId) =>
        Effect.fail(new GroupMembershipApplication.GroupNotFound({ groupId })),
      ),
      remove: record("group.remove", (input) =>
        Effect.fail(new GroupMembershipApplication.FixedMembership({ groupId: input.groupId })),
      ),
      leave: record("group.leave", (input) =>
        Effect.fail(new GroupMembershipApplication.AlreadyRemoved(input)),
      ),
      listCurrent: record("group.members", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    GroupFollowApplication.Service,
    GroupFollowApplication.Service.of({
      workspaceId,
      follow: record("group.follow", () => Effect.void),
      unfollow: record("group.unfollow", (input) =>
        Effect.fail(new GroupFollowApplication.NotFollowable({ groupId: input.groupId })),
      ),
    }),
  ),
  Layer.succeed(
    ThreadApplication.Service,
    ThreadApplication.Service.of({
      workspaceId,
      startInGroup: record("thread.start", () =>
        Effect.fail(new ThreadApplication.ParticipantUnavailable({ memberId })),
      ),
      startDirect: record("thread.startDirect", () =>
        Effect.fail(new ThreadApplication.DirectMembersRequired()),
      ),
      get: record("thread.get", (id) =>
        Effect.fail(new ThreadApplication.NotFound({ threadId: id })),
      ),
      listInGroup: record("thread.list", () => Effect.succeed([])),
      listOpenings: record("thread.openings", () => Effect.succeed([])),
      readTimeline: record("thread.timeline", () => Effect.succeed([])),
      listParticipants: record("thread.participants", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    ThreadMessageApplication.Service,
    ThreadMessageApplication.Service.of({
      workspaceId,
      publish: record("thread.publish", () =>
        Effect.fail(new ThreadMessageApplication.HumanAuthorRequired({ memberId })),
      ),
    }),
  ),
  Layer.succeed(
    ThreadParticipationApplication.Service,
    ThreadParticipationApplication.Service.of({
      workspaceId,
      follow: record("thread.follow", (id) =>
        Effect.fail(new ThreadParticipationApplication.ThreadNotFound({ threadId: id })),
      ),
      unfollow: record("thread.unfollow", (input) =>
        Effect.fail(new ThreadParticipationApplication.AlreadyEnded(input)),
      ),
    }),
  ),
  Layer.succeed(
    ReadStateApplication.Service,
    ReadStateApplication.Service.of({
      workspaceId,
      markThreadRead: record("thread.markRead", ({ threadId, throughSequence }) =>
        Effect.fail(
          new ReadStateApplication.BeyondTimeline({ threadId, throughSequence, latestSequence: 3 }),
        ),
      ),
      markGroupRead: record("group.markRead", () => Effect.void),
    }),
  ),
);
const operations = Layer.mergeAll(
  conversations,
  Layer.succeed(
    NotificationApplication.Service,
    NotificationApplication.Service.of({
      workspaceId,
      resolveSource: record("notification.resolveSource", (notificationId) =>
        Effect.fail(new NotificationApplication.SourceUnavailable({ notificationId })),
      ),
      acknowledge: record("notification.acknowledge", (notificationId) =>
        Effect.fail(new NotificationApplication.AlreadyHandled({ notificationId })),
      ),
      get: record("notification.get", (notificationId) =>
        notificationId === notification.id
          ? Effect.succeed(notification)
          : Effect.fail(new NotificationApplication.NotFound({ workspaceId, notificationId })),
      ),
      list: record("notification.list", () => Effect.succeed([notification])),
      listPending: record("notification.listPending", () => Effect.succeed([notification])),
      inbox: record("notification.inbox", () => Effect.succeed([{ notification }])),
      acknowledgeThrough: record("notification.acknowledgeThrough", () => Effect.succeed(2)),
      countPending: Effect.succeed(3),
    }),
  ),
  Layer.succeed(
    MemberApplication.Service,
    MemberApplication.Service.of({
      workspaceId,
      get: record("get", (target) =>
        target === memberId
          ? Effect.succeed(member)
          : Effect.fail(new MemberApplication.NotFound({ workspaceId, memberId: target })),
      ),
      remove: record("remove", () => Effect.fail(denied)),
      rename: record("rename", (name) =>
        Effect.succeed({
          id: member.id,
          workspaceId: member.workspaceId,
          identity: member.identity,
          name,
          status: member.status,
        }),
      ),
      list: Effect.succeed([member]),
    }),
  ),
  Layer.succeed(
    InvitationApplication.Service,
    InvitationApplication.Service.of({
      issue: record("issue", (request) =>
        Effect.succeed({
          details: {
            recipientId: request.recipientId,
            roleId: request.roleId,
            expiresAt: request.expiresAt,
            id: Invitation.Id.make("invitation-one"),
            workspaceId,
            inviterMemberId: memberId,
            issuedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
          },
          state: { _tag: "Pending" },
        } satisfies Invitation.Record),
      ),
      accept: record("accept", () => Effect.succeed(member)),
      revoke: record("revoke", () => Effect.die("unused")),
      list: Effect.succeed([]),
    }),
  ),
);
/** Runs programs against the stubbed services; the stubs fail only with public outcomes. */
const gateway = Layer.succeed(
  Gateway.Service,
  Gateway.Service.of({
    asMemberScoped: () => Effect.die("unused"),
    runBackground: () => Effect.die("unused"),
    executeTurns: () => Effect.die("unused"),
    createWorkspace: record("createWorkspace", () => Effect.succeed(workspace)),
    inWorkspace: <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, Core.Operations>) => {
      calls.push({ operation: "inWorkspace", arguments: [id] });
      return Effect.provide(program, operations) as Effect.Effect<A, GatewayErrors.ExposedError<E>>;
    },
    asMember: <A, E>(
      id: Workspace.Id,
      identity: Identity.MemberReference,
      program: Effect.Effect<A, E, Core.Operations | Actor.Service>,
    ) => {
      calls.push({ operation: "asMember", arguments: [id, identity] });
      if (identity.id !== alice.id)
        return Effect.fail(new GatewayErrors.NotMember({ workspaceId: id }));
      return Effect.provide(
        Effect.provideService(program, Actor.Service, actor),
        operations,
      ) as Effect.Effect<A, GatewayErrors.ExposedError<E> | GatewayErrors.NotMember>;
    },
  }),
);

/** Trusts the token as a human ID, like the local host's development credentials. */
const credentials = Layer.succeed(
  Credentials.Service,
  Credentials.Service.of({
    resolve: (credential) => {
      const token = Redacted.value(credential);
      if (token === "agent")
        return Effect.succeed(
          Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make(token) }),
        );
      if (token.length === 0 || token === "invalid")
        return Effect.fail(new Credentials.Rejected({ reason: "unknown" }));
      return Effect.succeed(
        Identity.Reference.cases.Human.make({ id: Identity.HumanId.make(token) }),
      );
    },
  }),
);
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
/** Sign-in and the directory are host services with their own tests; the stubs answer plainly. */
const signIn = Layer.succeed(
  SignIn.Service,
  SignIn.Service.of({
    start: record("start", () => Effect.void),
    complete: record("complete", (email, code) =>
      code === "419270"
        ? Effect.succeed({ token: email, humanId: Identity.HumanId.make(email) })
        : Effect.fail(new SignIn.Rejected({ reason: "mismatch" })),
    ),
  }),
);
const directory = Layer.succeed(
  WorkspaceDirectory.Service,
  WorkspaceDirectory.Service.of({
    list: record("list", () =>
      Effect.succeed({
        memberships: [{ workspace, member, activeMemberCount: 1 }],
        invitations: [],
      }),
    ),
  }),
);
const services = Layer.mergeAll(
  Routes.layerHandlers.pipe(Layer.provide(Layer.mergeAll(gateway, signIn, credentials, directory))),
  HttpServer.layerServices,
);
const run = <A, E>(
  token: string,
  program: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
) =>
  Effect.scoped(Effect.flatMap(makeClient, program)).pipe(
    Effect.provide(Layer.mergeAll(services, asToken(token))),
  );
const makeClient = HttpApiTest.groups(Api, [
  "session",
  "me",
  "workspaces",
  "members",
  "invitations",
  "notifications",
  "groups",
  "threads",
]);
it.effect("notification queries decode cursors and select the requested application read", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const after = { recordedAt: notification.recordedAt, id: Notification.Id.make("a + & é") };
    const pages = yield* run("alice", (client) =>
      Effect.gen(function* () {
        const first = yield* client.notifications.list({
          params: { workspaceId },
          query: { limit: 1 },
        });
        const next = yield* client.notifications.list({
          params: { workspaceId },
          query: { limit: 2, after, pendingOnly: true },
        });
        yield* client.notifications.list({
          params: { workspaceId },
          query: { limit: 3, pendingOnly: false },
        });
        return [first, next];
      }),
    );
    expect(pages).toEqual([[notification], [notification]]);
    expect(calls).toEqual([
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "notification.list", arguments: [{ limit: 1 }] },
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "notification.listPending", arguments: [{ limit: 2, after }] },
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "notification.list", arguments: [{ limit: 3 }] },
    ]);
  }),
);

it.effect("the inbox route decodes its cursor and passes the page to the application", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const before = { recordedAt: notification.recordedAt, id: Notification.Id.make("a + & é") };
    const pages = yield* run("alice", (client) =>
      Effect.gen(function* () {
        const first = yield* client.notifications.inbox({
          params: { workspaceId },
          query: { limit: 1 },
        });
        const next = yield* client.notifications.inbox({
          params: { workspaceId },
          query: { limit: 2, before, pendingOnly: true },
        });
        return [first, next];
      }),
    );
    // The inbox is its own route, never a notification named "inbox".
    expect(pages).toEqual([[{ notification }], [{ notification }]]);
    expect(calls).toEqual([
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "notification.inbox", arguments: [{ limit: 1 }] },
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "notification.inbox", arguments: [{ limit: 2, before, pendingOnly: true }] },
    ]);
  }),
);

it.effect("individual notification reads encode records and expose a typed 404", () =>
  Effect.gen(function* () {
    const found = yield* run("alice", (client) =>
      client.notifications.get({
        params: { workspaceId, notificationId: notification.id },
      }),
    );
    expect(found).toEqual(notification);
    const missing = yield* run("alice", (client) =>
      client.notifications
        .get({
          params: { workspaceId, notificationId: Notification.Id.make("missing") },
        })
        .pipe(Effect.flip),
    );
    expect(missing).toMatchObject({
      _tag: "NotificationApplication.NotFound",
      workspaceId,
      notificationId: "missing",
    });
  }),
);

it.effect("member reads pass the bearer principal and path parameters to the gateway", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const fetched = yield* run("alice", (client) =>
      client.members.get({ params: { workspaceId, memberId } }),
    );
    expect(fetched).toEqual(member);
    expect(calls).toEqual([
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "get", arguments: [memberId] },
    ]);
  }),
);

it.effect("domain outcomes keep their tags and statuses", () =>
  Effect.gen(function* () {
    const missing = yield* run("alice", (client) =>
      client.members
        .get({ params: { workspaceId, memberId: Member.Id.make("missing") } })
        .pipe(Effect.flip),
    );
    expect(missing).toMatchObject({ _tag: "MemberApplication.NotFound", memberId: "missing" });
    const notMember = yield* run("bob", (client) =>
      client.members.get({ params: { workspaceId, memberId } }).pipe(Effect.flip),
    );
    expect(notMember).toMatchObject({ _tag: "Gateway.NotMember", workspaceId });
    const forbidden = yield* run("alice", (client) =>
      client.members
        .remove({ params: { workspaceId, memberId }, responseMode: "decoded-and-response" })
        .pipe(Effect.flip),
    );
    expect(forbidden).toMatchObject({
      _tag: "Authorization.Denied",
      requirement: { permission: { name: "member.read" } },
    });
    const statuses = yield* run("alice", (client) =>
      Effect.all([
        client.members.get({ params: { workspaceId, memberId }, responseMode: "response-only" }),
        client.members.get({
          params: { workspaceId, memberId: Member.Id.make("missing") },
          responseMode: "response-only",
        }),
        client.members.remove({ params: { workspaceId, memberId }, responseMode: "response-only" }),
        client.workspaces.create({
          headers: {},
          payload: { name: "Test workspace" },
          responseMode: "response-only",
        }),
      ]).pipe(Effect.map((responses) => responses.map((response) => response.status))),
    );
    expect(statuses).toEqual([200, 404, 403, 201]);
  }),
);

it.effect("missing or rejected credentials are unauthorized before any gateway call", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const rejected = yield* run("invalid", (client) =>
      client.members.get({ params: { workspaceId, memberId } }).pipe(Effect.flip),
    );
    expect(rejected).toMatchObject({ _tag: "Api.Unauthorized" });
    expect(calls).toEqual([]);
  }),
);

it.effect("workspace creation and acceptance require a human principal", () =>
  Effect.gen(function* () {
    calls.length = 0;
    // The Idempotency-Key header reaches the operation as its request key.
    const created = yield* run("alice", (client) =>
      client.workspaces.create({
        headers: { "idempotency-key": Request.Key.make("create-1") },
        payload: { name: "Test workspace" },
      }),
    );
    expect(created).toEqual(workspace);
    const refused = yield* run("agent", (client) =>
      client.workspaces
        .create({ headers: {}, payload: { name: "Test workspace" } })
        .pipe(Effect.flip),
    );
    expect(refused).toMatchObject({ _tag: "Api.HumanRequired" });
    const accepted = yield* run("alice", (client) =>
      client.invitations.accept({
        params: { workspaceId, invitationId: Invitation.Id.make("invitation-one") },
        payload: {},
      }),
    );
    expect(accepted).toEqual(member);
    expect(calls).toEqual([
      {
        operation: "createWorkspace",
        arguments: [alice.id, { name: "Test workspace" }, { requestKey: "create-1" }],
      },
      { operation: "inWorkspace", arguments: [workspaceId] },
      { operation: "accept", arguments: ["invitation-one", alice.id, {}] },
    ]);
  }),
);

it.effect("invitation payloads round-trip dates and roles through JSON", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const expiresAt = DateTime.makeUnsafe("2026-02-01T00:00:00Z");
    const issued = yield* run("alice", (client) =>
      client.invitations.issue({
        headers: { "idempotency-key": Request.Key.make("issue-1") },
        params: { workspaceId },
        payload: {
          recipientId: Identity.HumanId.make("bob"),
          expiresAt,
          roleId: BuiltinRoles.MemberId,
        },
      }),
    );
    expect(issued.details.recipientId).toBe(Identity.HumanId.make("bob"));
    expect(DateTime.toEpochMillis(issued.details.expiresAt)).toBe(
      DateTime.toEpochMillis(expiresAt),
    );
    expect(issued.state).toEqual({ _tag: "Pending" });
    expect(calls[1]).toMatchObject({
      operation: "issue",
      arguments: [
        {
          recipientId: "bob",
          roleId: BuiltinRoles.MemberId,
        },
        { requestKey: "issue-1" },
      ],
    });
  }),
);

it.effect("sign-in needs no credential, and the directory answers for the principal", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const email = "jo@mercier.co";
    const outcome = yield* run("", (client) =>
      Effect.gen(function* () {
        yield* client.session.start({ payload: { email } });
        const rejected = yield* Effect.flip(
          client.session.complete({ payload: { email, code: "000000" } }),
        );
        const session = yield* client.session.complete({ payload: { email, code: "419270" } });
        const malformed = yield* Effect.flip(
          client.session.start({ payload: { email: "not-an-address" } }),
        );
        return { rejected, session, malformed };
      }),
    );
    expect(outcome.rejected).toMatchObject({ _tag: "SignIn.Rejected", reason: "mismatch" });
    expect(outcome.session).toEqual({ token: email, humanId: Identity.HumanId.make(email) });
    // The client rejects a malformed address before any request is sent.
    expect(outcome.malformed._tag).toBe("SchemaError");
    expect(calls.map((call) => call.operation)).toEqual(["start", "complete", "complete"]);
    calls.length = 0;
    const listing = yield* run("alice", (client) => client.me.workspaces());
    expect(listing.memberships).toHaveLength(1);
    expect(calls).toEqual([{ operation: "list", arguments: [alice] }]);
  }),
);

it.effect("session and directory responses retain their existing JSON field names", () =>
  Effect.gen(function* () {
    const session = yield* run("", (client) =>
      client.session
        .complete({
          payload: { email: "jo@mercier.co", code: "419270" },
          responseMode: "response-only",
        })
        .pipe(Effect.flatMap((response) => response.json)),
    );
    expect(session).toEqual({ token: "jo@mercier.co", identity: "jo@mercier.co" });
    const directory = yield* run("alice", (client) =>
      client.me
        .workspaces({ responseMode: "response-only" })
        .pipe(Effect.flatMap((response) => response.json)),
    );
    expect(directory).toEqual({ memberships: [{ workspace, member, people: 1 }], invitations: [] });
  }),
);

it.effect(
  "conversation routes pass path parameters, cursors, and request keys into core inputs",
  () =>
    Effect.gen(function* () {
      calls.length = 0;
      const before = {
        latestActivityAt: DateTime.makeUnsafe("2026-01-02T03:04:05.678Z"),
        threadId: Thread.Id.make("a + & é"),
      };
      const opened = { createdAt: before.latestActivityAt, threadId: before.threadId };
      const membershipId = GroupMembership.Id.make("admission-one");
      const participationId = ThreadParticipation.Id.make("participation-one");
      const key = Request.Key.make("start-1");
      const statuses = yield* run("alice", (client) =>
        Effect.all([
          client.groups.create({
            params: { workspaceId },
            headers: { "idempotency-key": Request.Key.make("group-1") },
            payload: { name: "Studio", memberIds: [memberId], visibility: "Public" },
            responseMode: "response-only",
          }),
          client.groups.list({
            params: { workspaceId },
            query: { limit: 20, after: groupId },
            responseMode: "response-only",
          }),
          client.groups.listPublic({
            params: { workspaceId },
            query: { limit: 20, after: groupId },
            responseMode: "response-only",
          }),
          client.groups.get({ params: { workspaceId, groupId }, responseMode: "response-only" }),
          client.groups.members({
            params: { workspaceId, groupId },
            query: { limit: 5 },
            responseMode: "response-only",
          }),
          client.groups.addMember({
            params: { workspaceId, groupId },
            payload: { memberId },
            responseMode: "response-only",
          }),
          client.groups.removeMember({
            params: { workspaceId, groupId, membershipId },
            responseMode: "response-only",
          }),
          client.groups.leave({
            params: { workspaceId, groupId, membershipId },
            responseMode: "response-only",
          }),
          client.groups.join({ params: { workspaceId, groupId }, responseMode: "response-only" }),
          client.groups.follow({
            params: { workspaceId, groupId },
            payload: { memberId },
            responseMode: "response-only",
          }),
          client.groups.unfollow({
            params: { workspaceId, groupId },
            payload: { memberId },
            responseMode: "response-only",
          }),
          client.groups.markRead({
            params: { workspaceId, groupId },
            responseMode: "response-only",
          }),
          client.threads.list({
            params: { workspaceId, groupId },
            query: { limit: 10, before },
            responseMode: "response-only",
          }),
          client.threads.openings({
            params: { workspaceId, groupId },
            query: { limit: 10, before: opened },
            responseMode: "response-only",
          }),
          client.threads.start({
            params: { workspaceId, groupId },
            headers: { "idempotency-key": key },
            payload: { text: "  Hello\n", mentions: [memberId] },
            responseMode: "response-only",
          }),
          client.threads.startDirect({
            params: { workspaceId },
            headers: {},
            payload: { memberIds: [memberId], text: "Hi", mentions: [] },
            responseMode: "response-only",
          }),
          client.threads.get({ params: { workspaceId, threadId }, responseMode: "response-only" }),
          client.threads.timeline({
            params: { workspaceId, threadId },
            query: { limit: 50, beforeSequence: 9, from: "newest" },
            responseMode: "response-only",
          }),
          client.threads.participants({
            params: { workspaceId, threadId },
            query: { limit: 5, after: participationId },
            responseMode: "response-only",
          }),
          client.threads.publish({
            params: { workspaceId, threadId },
            headers: { "idempotency-key": Request.Key.make("reply-1") },
            payload: { text: "Reply", mentions: [] },
            responseMode: "response-only",
          }),
          client.threads.follow({
            params: { workspaceId, threadId },
            responseMode: "response-only",
          }),
          client.threads.unfollow({
            params: { workspaceId, threadId },
            payload: { participationId },
            responseMode: "response-only",
          }),
          client.threads.markRead({
            params: { workspaceId, threadId },
            payload: { throughSequence: 4 },
            responseMode: "response-only",
          }),
          client.notifications.source({
            params: { workspaceId, notificationId: notification.id },
            responseMode: "response-only",
          }),
          client.notifications.acknowledge({
            params: { workspaceId, notificationId: notification.id },
            responseMode: "response-only",
          }),
        ]).pipe(Effect.map((responses) => responses.map((response) => response.status))),
      );
      expect(statuses).toEqual([
        201, 200, 200, 404, 200, 409, 409, 409, 404, 204, 409, 204, 200, 200, 409, 400, 404, 200,
        200, 403, 404, 409, 409, 404, 409,
      ]);
      expect(calls.filter((call) => call.operation !== "asMember")).toEqual([
        {
          operation: "group.create",
          arguments: [
            { name: "Studio", memberIds: [memberId], visibility: "Public" },
            { requestKey: "group-1" },
          ],
        },
        { operation: "group.listMine", arguments: [{ limit: 20, after: groupId }] },
        { operation: "group.listPublic", arguments: [{ limit: 20, after: groupId }] },
        { operation: "group.get", arguments: [groupId] },
        { operation: "group.members", arguments: [groupId, { limit: 5 }] },
        { operation: "group.add", arguments: [{ groupId, memberId }] },
        { operation: "group.remove", arguments: [{ groupId, membershipId }] },
        { operation: "group.leave", arguments: [{ groupId, membershipId }] },
        { operation: "group.join", arguments: [groupId] },
        { operation: "group.follow", arguments: [{ groupId, memberId }] },
        { operation: "group.unfollow", arguments: [{ groupId, memberId }] },
        { operation: "group.markRead", arguments: [{ groupId }] },
        { operation: "thread.list", arguments: [groupId, { limit: 10, before }] },
        { operation: "thread.openings", arguments: [groupId, { limit: 10, before: opened }] },
        {
          operation: "thread.start",
          arguments: [{ groupId, text: "  Hello\n", mentions: [memberId] }, { requestKey: key }],
        },
        {
          operation: "thread.startDirect",
          arguments: [{ memberIds: [memberId], text: "Hi", mentions: [] }, {}],
        },
        { operation: "thread.get", arguments: [threadId] },
        {
          operation: "thread.timeline",
          arguments: [threadId, { limit: 50, beforeSequence: 9, from: "newest" }],
        },
        {
          operation: "thread.participants",
          arguments: [threadId, { limit: 5, after: participationId }],
        },
        {
          operation: "thread.publish",
          arguments: [{ threadId, text: "Reply", mentions: [] }, { requestKey: "reply-1" }],
        },
        { operation: "thread.follow", arguments: [threadId] },
        { operation: "thread.unfollow", arguments: [{ threadId, participationId }] },
        { operation: "thread.markRead", arguments: [{ threadId, throughSequence: 4 }] },
        { operation: "notification.resolveSource", arguments: [notification.id] },
        { operation: "notification.acknowledge", arguments: [notification.id] },
      ]);
    }),
);
