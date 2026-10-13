import { Channel, ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { Connection } from "@amends-dev/core/connection";
import { Request } from "@amends-dev/core/request";
import { BuiltinRoles } from "@amends-dev/core/authorization";
import { expect, it } from "@effect/vitest";
import { Api, Authentication, Routes, WorkspaceMember } from "../src/index.ts";
import type * as Core from "@amends-dev/core";
import { Requirement, Target } from "@amends-dev/core/authorization";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Entry } from "@amends-dev/core/journal";
import { Notification, NotificationService } from "@amends-dev/core/notification";
import {
  Group,
  GroupService,
  GroupFollowService,
  GroupMembership,
  GroupMembershipService,
} from "@amends-dev/core/group";
import {
  Thread,
  ThreadService,
  ThreadMessageService,
  ThreadParticipation,
  ThreadParticipationService,
  ThreadMessage,
} from "@amends-dev/core/thread";
import { ReadStateService } from "@amends-dev/core/read-state";
import { TaskService } from "@amends-dev/core/task";
import {
  Invitation,
  InvitationService,
  Member,
  MemberService,
  MemberPermissions,
  Workspace,
} from "@amends-dev/core/workspace";
import { Accounts, SessionTokens, Gateway, SignIn, WorkspaceDirectory } from "@amends-dev/gateway";
import { DateTime, Effect, Layer, Redacted } from "effect";
import type { Scope } from "effect";
import { HttpClientRequest, HttpServer } from "effect/http";
import { HttpApiMiddleware, HttpApiTest, OpenApi } from "effect/http-api";
import { CoreError } from "@amends-dev/core/error";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.HumanId.make("bob");
const workspaceId = Workspace.Id.make("workspace-one");
const memberId = Member.Id.make("member-one");
const member: Member.Member = {
  id: memberId,
  workspaceId,
  identity: alice,
  name: Member.Name.make("alice"),
  status: "active",
};
const workspace: Workspace.Workspace = {
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
const denied = new CoreError.Denied({
  reason: new CoreError.NotGranted({
    memberId,
    requirement: Requirement.make(
      MemberPermissions.Read,
      Target.Reference.cases.Member.make({ workspaceId, memberId }),
    ),
  }),
});
const actor = Actor.Actor.of({ workspaceId, memberId, identity: alice });
const pending = ({
  recipientId,
  roleId,
  expiresAt,
}: Invitation.IssueInput): Invitation.Invitation => ({
  details: {
    recipientId,
    roleId,
    expiresAt,
    id: Invitation.Id.make("invitation-one"),
    workspaceId,
    inviterMemberId: memberId,
    issuedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
  },
  state: { _tag: "Pending" },
});
const notification: Notification.Notification = {
  id: Notification.Id.make("pending"),
  workspaceId,
  source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make("entry-one") },
  recipient: Notification.ofMember(memberId, alice),
  recordedAt: DateTime.makeUnsafe("2026-01-01T00:00:00.123Z"),
  state: { _tag: "Pending" },
};
const groupId = Group.Id.make("group-one");
const team: Group.Team = {
  id: groupId,
  workspaceId,
  kind: "Team",
  visibility: "Private",
  name: "Studio",
  createdBy: memberId,
  createdAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
};
const threadId = Thread.Id.make("thread-one");
const messageId = ThreadMessage.Id.make("message-one");
/** Conversation services record their inputs; failures show that each tag keeps its status. */
const conversations = Layer.mergeAll(
  Layer.succeed(
    GroupService.GroupService,
    GroupService.GroupService.of({
      createTeam: record("group.create", () => Effect.succeed(team)),
      rename: record("group.rename", () => Effect.succeed(team)),
      get: record("group.get", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "Group", id })),
      ),
      listMine: record("group.listMine", () => Effect.succeed([])),
      listPublic: record("group.listPublic", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    GroupMembershipService.GroupMembershipService,
    GroupMembershipService.GroupMembershipService.of({
      add: record("group.add", (input) =>
        Effect.fail(new CoreError.Conflict({ reason: new CoreError.AlreadyMember(input) })),
      ),
      join: record("group.join", (groupId) =>
        Effect.fail(new CoreError.NotFound({ resource: "Group", id: groupId })),
      ),
      remove: record("group.remove", (input) =>
        Effect.fail(
          new CoreError.Invalid({
            reason: new CoreError.FixedMembership({ groupId: input.groupId }),
          }),
        ),
      ),
      leave: record("group.leave", (input) =>
        Effect.fail(
          new CoreError.Conflict({
            reason: new CoreError.AlreadyEnded({
              resource: "GroupMembership",
              id: input.membershipId,
            }),
          }),
        ),
      ),
      listCurrent: record("group.members", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    GroupFollowService.GroupFollowService,
    GroupFollowService.GroupFollowService.of({
      follow: record("group.follow", () => Effect.void),
      unfollow: record("group.unfollow", (input) =>
        Effect.fail(
          new CoreError.Invalid({
            reason: new CoreError.NotFollowable({ groupId: input.groupId }),
          }),
        ),
      ),
    }),
  ),
  Layer.succeed(
    ThreadService.ThreadService,
    ThreadService.ThreadService.of({
      startInGroup: record("thread.start", () =>
        Effect.fail(
          new CoreError.Conflict({ reason: new CoreError.ParticipantUnavailable({ memberId }) }),
        ),
      ),
      startDirect: record("thread.startDirect", () =>
        Effect.fail(new CoreError.Invalid({ reason: new CoreError.DirectMembersRequired() })),
      ),
      get: record("thread.get", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "Thread", id })),
      ),
      rename: record("thread.rename", (input) =>
        Effect.fail(new CoreError.Changed({ resource: "Thread", id: input.threadId })),
      ),
      listInGroup: record("thread.list", () => Effect.succeed([])),
      listOpenings: record("thread.openings", () => Effect.succeed([])),
      readTimeline: record("thread.timeline", () => Effect.succeed([])),
      listParticipants: record("thread.participants", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    TaskService.TaskService,
    TaskService.TaskService.of({
      create: record("task.create", (input) =>
        Effect.fail(
          new CoreError.Conflict({
            reason: new CoreError.AlreadyTask({ threadId: input.threadId }),
          }),
        ),
      ),
      update: record("task.update", (input) =>
        Effect.fail(new CoreError.Changed({ resource: "Task", id: input.threadId })),
      ),
      get: record("task.get", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "Task", id })),
      ),
      listInGroup: record("task.list", () => Effect.succeed([])),
    }),
  ),
  Layer.succeed(
    ThreadMessageService.ThreadMessageService,
    ThreadMessageService.ThreadMessageService.of({
      publish: record("thread.publish", () =>
        Effect.fail(new CoreError.Denied({ reason: new CoreError.HumanRequired() })),
      ),
      edit: record("thread.edit", (input) =>
        Effect.fail(new CoreError.Changed({ resource: "ThreadMessage", id: input.messageId })),
      ),
      delete: record("thread.delete", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "ThreadMessage", id })),
      ),
      typing: record("thread.typing", () => Effect.void),
    }),
  ),
  Layer.succeed(
    ThreadParticipationService.ThreadParticipationService,
    ThreadParticipationService.ThreadParticipationService.of({
      follow: record("thread.follow", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "Thread", id })),
      ),
      unfollow: record("thread.unfollow", (input) =>
        Effect.fail(
          new CoreError.Conflict({
            reason: new CoreError.AlreadyEnded({
              resource: "ThreadParticipation",
              id: input.participationId,
            }),
          }),
        ),
      ),
    }),
  ),
  Layer.succeed(
    ReadStateService.ReadStateService,
    ReadStateService.ReadStateService.of({
      markThreadRead: record("thread.markRead", ({ threadId, throughSequence }) =>
        Effect.fail(
          new CoreError.Conflict({
            reason: new CoreError.BeyondTimeline({ threadId, throughSequence, latestSequence: 3 }),
          }),
        ),
      ),
      markGroupRead: record("group.markRead", () => Effect.void),
    }),
  ),
);
/** Channel services record their inputs; intake answers what the system is to be told. */
const channelId = Channel.Id.make("channel-one");
const channels = Layer.mergeAll(
  Layer.succeed(
    ChannelService.ChannelService,
    ChannelService.ChannelService.of({
      list: Effect.suspend(() => {
        calls.push({ operation: "channel.list", arguments: [] });
        return Effect.succeed([]);
      }),
      create: record("channel.create", (input) =>
        Effect.fail(
          new CoreError.Invalid({
            reason: new CoreError.ConnectionUnusable({ connectionId: input.connectionId }),
          }),
        ),
      ),
      get: record("channel.get", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "Channel", id })),
      ),
      redirect: record("channel.redirect", (input) =>
        Effect.fail(new CoreError.NotFound({ resource: "Group", id: input.groupId })),
      ),
      remove: record("channel.remove", () => Effect.void),
      getBinding: record("channel.binding", (id) =>
        Effect.fail(new CoreError.NotFound({ resource: "ChannelBinding", id })),
      ),
    }),
  ),
  Layer.succeed(
    ChannelIntake.ChannelIntake,
    ChannelIntake.ChannelIntake.of({
      receive: record("channel.receive", () => Effect.succeed({ answer: "ack", intakes: [] })),
      intake: () => Effect.die("unused"),
    }),
  ),
);
const operations = Layer.mergeAll(
  conversations,
  channels,
  Layer.succeed(
    NotificationService.NotificationService,
    NotificationService.NotificationService.of({
      markSeen: record("notification.markSeen", (notificationId) =>
        notificationId === notification.id
          ? Effect.fail(
              new CoreError.Conflict({ reason: new CoreError.AlreadyHandled({ notificationId }) }),
            )
          : Effect.fail(new CoreError.NotFound({ resource: "Notification", id: notificationId })),
      ),
      inbox: record("notification.inbox", () => Effect.succeed([{ notification }])),
      markSeenThrough: record("notification.markSeenThrough", () => Effect.succeed(2)),
      countPending: Effect.succeed(3),
    }),
  ),
  Layer.succeed(
    MemberService.MemberService,
    MemberService.MemberService.of({
      get: record("get", (target) =>
        target === memberId
          ? Effect.succeed(member)
          : Effect.fail(new CoreError.NotFound({ resource: "Member", id: target })),
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
    InvitationService.InvitationService,
    InvitationService.InvitationService.of({
      issue: record("issue", (input) => Effect.succeed(pending(input))),
      accept: record("accept", () => Effect.succeed(member)),
      revoke: record("revoke", () => Effect.die("unused")),
      list: Effect.succeed([
        pending({
          recipientId: bob,
          roleId: BuiltinRoles.MemberId,
          expiresAt: DateTime.makeUnsafe("2026-02-01T00:00:00Z"),
        }),
      ]),
    }),
  ),
);
/** Runs programs against the stubbed services; the stubs fail only with public outcomes. */
const gateway = Layer.succeed(
  Gateway.Gateway,
  Gateway.Gateway.of({
    createWorkspace: record("createWorkspace", () => Effect.succeed(workspace)),
    inWorkspace: <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, unknown>) => {
      calls.push({ operation: "inWorkspace", arguments: [id] });
      return Effect.provide(
        program as Effect.Effect<A, E, Layer.Success<typeof operations>>,
        operations,
      );
    },
    asMember: <A, E>(
      id: Workspace.Id,
      identity: Identity.MemberReference,
      program: Effect.Effect<A, E, Core.Operations | Actor.Actor | Scope.Scope>,
    ) => {
      calls.push({ operation: "asMember", arguments: [id, identity] });
      if (identity.id !== alice.id)
        return Effect.fail(
          new CoreError.Denied({ reason: new CoreError.NotMember({ workspaceId: id }) }),
        );
      return Effect.provide(
        Effect.provideService(program, Actor.Actor, actor),
        operations,
      ) as Effect.Effect<A, E | CoreError.Denied, Scope.Scope>;
    },
  }),
);

/** Trusts the token as a human ID, like the local host's development credentials. */
const credentials = Layer.succeed(
  SessionTokens.SessionTokens,
  SessionTokens.SessionTokens.of({
    resolve: (credential) => {
      const token = Redacted.value(credential);
      if (token === "agent")
        return Effect.succeed(
          Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make(token) }),
        );
      if (token.length === 0 || token === "invalid")
        return Effect.fail(new SessionTokens.Rejected({ reason: "unknown" }));
      return Effect.succeed(
        Identity.Reference.cases.Human.make({ id: Identity.HumanId.make(token) }),
      );
    },
    revoke: record("revoke", () => Effect.void),
  }),
);
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
/** Sign-in and the directory are host services with their own tests; the stubs answer plainly. */
const jo: Accounts.Account = {
  id: Identity.HumanId.make("jo"),
  email: Accounts.Email.make("jo@mercier.co"),
};
const methods: SignIn.Methods = {
  emailCode: true,
  providers: [{ id: "google", name: "Google" }],
};
const signIn = Layer.succeed(
  SignIn.SignIn,
  SignIn.SignIn.of({
    methods,
    start: record("start", (email) =>
      email === "busy@mercier.co" ? Effect.fail(new SignIn.Limited()) : Effect.void,
    ),
    complete: record("complete", (_email, code) =>
      code === "419270"
        ? Effect.succeed({ token: jo.id, account: jo })
        : Effect.fail(new SignIn.Rejected({ reason: "mismatch" })),
    ),
  }),
);
/** Alice's and Bob's accounts, and one for any other address the first time it comes up. */
const addresses = new Map<Identity.HumanId, Accounts.Email>([
  [alice.id, Accounts.Email.make("alice@example.com")],
  [bob, Accounts.Email.make("bob@example.com")],
]);
const accounts = Layer.succeed(
  Accounts.Accounts,
  Accounts.Accounts.of({
    findOrCreate: record("findOrCreate", (email) =>
      Effect.sync(() => {
        const found = [...addresses].find(([, address]) => address === email);
        if (found !== undefined) return { id: found[0], email };
        const id = Identity.HumanId.make(crypto.randomUUID());
        addresses.set(id, email);
        return { id, email };
      }),
    ),
    findByIds: record("findByIds", (ids) =>
      Effect.succeed(
        ids.flatMap((id) => {
          const email = addresses.get(id);
          return email === undefined ? [] : [{ id, email }];
        }),
      ),
    ),
  }),
);
const directory = Layer.succeed(
  WorkspaceDirectory.WorkspaceDirectory,
  WorkspaceDirectory.WorkspaceDirectory.of({
    list: record("list", () =>
      Effect.succeed({
        memberships: [{ workspace, member, activeMemberCount: 1 }],
        invitations: [],
      }),
    ),
  }),
);
const services = Layer.mergeAll(
  Routes.layerHandlers.pipe(
    Layer.provide(Layer.mergeAll(gateway, signIn, credentials, directory, accounts)),
  ),
  HttpServer.layerServices,
);
const run = <A, E>(
  token: string,
  program: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E>,
) =>
  Effect.scoped(Effect.flatMap(makeClient, program)).pipe(
    Effect.provide(
      Layer.mergeAll(services, asToken(token), WorkspaceMember.layerClient(workspaceId)),
    ),
  );
const makeClient = HttpApiTest.groups(Api.Api, [
  "session",
  "me",
  "accounts",
  "workspaces",
  "settings",
  "tasks",
  "members",
  "invitations",
  "notifications",
  "groups",
  "threads",
  "channels",
  "channelEvents",
]);
it.effect("the inbox route decodes its cursor and passes the page to the application", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const before = { recordedAt: notification.recordedAt, id: Notification.Id.make("a + & é") };
    const pages = yield* run("alice", (client) =>
      Effect.gen(function* () {
        const first = yield* client.notifications.inbox({
          query: { limit: 1 },
        });
        const next = yield* client.notifications.inbox({
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

it.effect("marking a missing notification seen exposes a typed 404", () =>
  Effect.gen(function* () {
    const missing = yield* run("alice", (client) =>
      client.notifications
        .markSeen({
          params: { notificationId: Notification.Id.make("missing") },
        })
        .pipe(Effect.flip),
    );
    expect(missing).toMatchObject({
      _tag: "CoreError.NotFound",
      resource: "Notification",
      id: "missing",
    });
  }),
);

it.effect("member reads pass the bearer principal and path parameters to the gateway", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const fetched = yield* run("alice", (client) => client.members.get({ params: { memberId } }));
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
      client.members.get({ params: { memberId: Member.Id.make("missing") } }).pipe(Effect.flip),
    );
    expect(missing).toMatchObject({
      _tag: "CoreError.NotFound",
      resource: "Member",
      id: "missing",
    });
    const notMember = yield* run("bob", (client) =>
      client.members.get({ params: { memberId } }).pipe(Effect.flip),
    );
    expect(notMember).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotMember", workspaceId },
    });
    const forbidden = yield* run("alice", (client) =>
      client.members
        .remove({ params: { memberId }, responseMode: "decoded-and-response" })
        .pipe(Effect.flip),
    );
    expect(forbidden).toMatchObject({
      _tag: "CoreError.Denied",
      reason: { _tag: "NotGranted", requirement: { permission: { name: "member.read" } } },
    });
    const statuses = yield* run("alice", (client) =>
      Effect.all([
        client.members.get({ params: { memberId }, responseMode: "response-only" }),
        client.members.get({
          params: { memberId: Member.Id.make("missing") },
          responseMode: "response-only",
        }),
        client.members.remove({ params: { memberId }, responseMode: "response-only" }),
        client.workspaces.create({
          headers: {},
          payload: { name: "Test workspace", memberName: member.name },
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
      client.members.get({ params: { memberId } }).pipe(Effect.flip),
    );
    expect(rejected).toMatchObject({ _tag: "Authentication.Unauthorized" });
    expect(calls).toEqual([]);
  }),
);

// A member's request names its workspace in a header, which the client's side of the middleware
// sets; one that sends none, or an empty one, never reaches the gateway.
it.effect("a member's request names its workspace in the Amends-Workspace header", () =>
  Effect.gen(function* () {
    const sending = (value: string | undefined) =>
      HttpApiMiddleware.layerClient(WorkspaceMember.WorkspaceMember, ({ next, request }) =>
        next(
          value === undefined
            ? request
            : HttpClientRequest.setHeader(request, WorkspaceMember.header, value),
        ),
      );
    const withHeader = (value: string | undefined) =>
      Effect.scoped(
        Effect.flatMap(makeClient, (client) =>
          client.members.get({ params: { memberId }, responseMode: "decoded-and-response" }),
        ),
      ).pipe(Effect.provide(Layer.mergeAll(services, asToken("alice"), sending(value))));
    calls.length = 0;
    for (const value of [undefined, ""])
      expect(yield* Effect.flip(withHeader(value))).toMatchObject({
        _tag: "CoreError.Invalid",
        reason: { _tag: "Malformed" },
      });
    expect(calls).toEqual([]);
    const [fetched, response] = yield* withHeader(workspaceId);
    expect(fetched).toEqual(member);
    expect(response.headers["vary"]).toContain(WorkspaceMember.header);
    expect(calls).toEqual([
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "get", arguments: [memberId] },
    ]);
  }),
);

it("the OpenAPI document declares the header on every endpoint a member calls, and no other", () => {
  const spec = OpenApi.fromApi(Api.Api);
  const declaring = (operation: {
    readonly parameters?: ReadonlyArray<{ readonly name: string }>;
  }) => (operation.parameters ?? []).some((parameter) => parameter.name === WorkspaceMember.header);
  const operations = Object.values(spec.paths).flatMap((item) =>
    Object.values(item).filter(
      (operation) => typeof operation === "object" && "operationId" in operation,
    ),
  );
  const declared = operations.filter(declaring).map((operation) => operation.operationId);
  expect(declared).toContain("members.get");
  expect(declared).toContain("settings.transferOwnership");
  expect(declared).not.toContain("workspaces.create");
  expect(declared).not.toContain("workspaces.acceptInvitation");
  expect(declared).not.toContain("me.workspaces");
  expect(declared).not.toContain("channelEvents.receive");
  expect(declared.length).toBeGreaterThan(70);
});

it.effect("workspace creation and acceptance require a human principal", () =>
  Effect.gen(function* () {
    calls.length = 0;
    // The Idempotency-Key header reaches the operation as its request key.
    const created = yield* run("alice", (client) =>
      client.workspaces.create({
        headers: { "idempotency-key": Request.Key.make("create-1") },
        payload: { name: "Test workspace", memberName: member.name },
      }),
    );
    expect(created).toEqual(workspace);
    const refused = yield* run("agent", (client) =>
      client.workspaces
        .create({ headers: {}, payload: { name: "Test workspace", memberName: member.name } })
        .pipe(Effect.flip),
    );
    expect(refused).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } });
    const accepted = yield* run("alice", (client) =>
      client.workspaces.acceptInvitation({
        params: { workspaceId, invitationId: Invitation.Id.make("invitation-one") },
        payload: { name: member.name },
      }),
    );
    expect(accepted).toEqual(member);
    expect(calls).toEqual([
      {
        operation: "createWorkspace",
        arguments: [
          alice.id,
          { name: "Test workspace", memberName: member.name },
          { requestKey: "create-1" },
        ],
      },
      { operation: "inWorkspace", arguments: [workspaceId] },
      { operation: "accept", arguments: ["invitation-one", alice.id, member.name] },
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
        payload: { email: "bob@example.com", expiresAt, roleId: BuiltinRoles.MemberId },
      }),
    );
    // The invitation goes to the account of the address it names.
    expect(issued.details.recipientId).toBe(bob);
    expect(DateTime.toEpochMillis(issued.details.expiresAt)).toBe(
      DateTime.toEpochMillis(expiresAt),
    );
    expect(issued.state).toEqual({ _tag: "Pending" });
    expect(calls.slice(1)).toMatchObject([
      { operation: "findOrCreate", arguments: ["bob@example.com"] },
      {
        operation: "issue",
        arguments: [{ recipientId: bob, roleId: BuiltinRoles.MemberId }, { requestKey: "issue-1" }],
      },
    ]);
  }),
);

it.effect("sign-in needs no credential, and the directory answers for the principal", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const email = "jo@mercier.co";
    const outcome = yield* run("", (client) =>
      Effect.gen(function* () {
        expect(yield* client.session.methods()).toEqual(methods);
        yield* client.session.start({ payload: { email } });
        const rejected = yield* Effect.flip(
          client.session.complete({ payload: { email, code: "000000" } }),
        );
        const session = yield* client.session.complete({ payload: { email, code: "419270" } });
        const malformed = yield* Effect.flip(
          client.session.start({ payload: { email: "not-an-address" } }),
        );
        const limited = yield* Effect.flip(
          client.session.start({ payload: { email: "busy@mercier.co" } }),
        );
        return { rejected, session, malformed, limited };
      }),
    );
    expect(outcome.rejected).toMatchObject({ _tag: "SignIn.Rejected", reason: "mismatch" });
    expect(outcome.session).toEqual({ token: jo.id, account: jo });
    // The client rejects a malformed address before any request is sent.
    expect(outcome.malformed._tag).toBe("SchemaError");
    expect(outcome.limited).toMatchObject({ _tag: "SignIn.Limited" });
    expect(calls.map((call) => call.operation)).toEqual(["start", "complete", "complete", "start"]);
    calls.length = 0;
    const listing = yield* run("alice", (client) => client.me.workspaces());
    expect(listing.memberships).toHaveLength(1);
    expect(calls).toEqual([{ operation: "list", arguments: [alice] }]);
  }),
);

it.effect("session and directory responses keep their JSON field names", () =>
  Effect.gen(function* () {
    const session = yield* run("", (client) =>
      client.session
        .complete({
          payload: { email: "jo@mercier.co", code: "419270" },
          responseMode: "response-only",
        })
        .pipe(Effect.flatMap((response) => response.json)),
    );
    expect(session).toEqual({ token: "jo", account: { id: "jo", email: "jo@mercier.co" } });
    const directory = yield* run("alice", (client) =>
      client.me
        .workspaces({ responseMode: "response-only" })
        .pipe(Effect.flatMap((response) => response.json)),
    );
    expect(directory).toEqual({ memberships: [{ workspace, member, people: 1 }], invitations: [] });
  }),
);

it.effect("a person reads their account, and signs out with the credential they presented", () =>
  Effect.gen(function* () {
    calls.length = 0;
    expect(yield* run("alice", (client) => client.me.account())).toEqual({
      id: alice.id,
      email: "alice@example.com",
    });
    const agent = yield* run("agent", (client) => Effect.flip(client.me.account()));
    expect(agent).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "HumanRequired" } });
    // A session no account holds is not honored.
    const unknown = yield* run("carol", (client) =>
      client.me.account({ responseMode: "response-only" }),
    );
    expect(unknown.status).toBe(401);
    const signedOut = yield* run("alice", (client) =>
      client.me.signOut({ responseMode: "response-only" }),
    );
    expect(signedOut.status).toBe(204);
    expect(calls.map(({ operation }) => operation)).toEqual(["findByIds", "findByIds", "revoke"]);
    const credential = calls[2]?.arguments[0];
    expect(Redacted.isRedacted(credential) && Redacted.value(credential)).toBe("alice");
  }),
);

it.effect("a workspace's accounts are those of its human members and its invitees", () =>
  Effect.gen(function* () {
    calls.length = 0;
    const listed = yield* run("alice", (client) => client.accounts.list());
    expect(listed).toEqual([
      { id: alice.id, email: "alice@example.com" },
      { id: bob, email: "bob@example.com" },
    ]);
    expect(calls).toEqual([
      { operation: "asMember", arguments: [workspaceId, alice] },
      { operation: "findByIds", arguments: [[alice.id, bob]] },
    ]);
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
            headers: { "idempotency-key": Request.Key.make("group-1") },
            payload: { name: "Studio", memberIds: [memberId], visibility: "Public" },
            responseMode: "response-only",
          }),
          client.groups.list({
            query: { limit: 20, after: groupId },
            responseMode: "response-only",
          }),
          client.groups.listPublic({
            query: { limit: 20, after: groupId },
            responseMode: "response-only",
          }),
          client.groups.get({ params: { groupId }, responseMode: "response-only" }),
          client.groups.members({
            params: { groupId },
            query: { limit: 5 },
            responseMode: "response-only",
          }),
          client.groups.addMember({
            params: { groupId },
            payload: { memberId },
            responseMode: "response-only",
          }),
          client.groups.removeMember({
            params: { groupId, membershipId },
            responseMode: "response-only",
          }),
          client.groups.leave({
            params: { groupId, membershipId },
            responseMode: "response-only",
          }),
          client.groups.join({ params: { groupId }, responseMode: "response-only" }),
          client.groups.follow({
            params: { groupId },
            payload: { memberId },
            responseMode: "response-only",
          }),
          client.groups.unfollow({
            params: { groupId },
            payload: { memberId },
            responseMode: "response-only",
          }),
          client.groups.markRead({
            params: { groupId },
            responseMode: "response-only",
          }),
          client.threads.list({
            params: { groupId },
            query: { limit: 10, before },
            responseMode: "response-only",
          }),
          client.threads.openings({
            params: { groupId },
            query: { limit: 10, before: opened },
            responseMode: "response-only",
          }),
          client.threads.start({
            params: { groupId },
            headers: { "idempotency-key": key },
            payload: { text: "  Hello\n", mentions: [memberId] },
            responseMode: "response-only",
          }),
          client.threads.startDirect({
            headers: {},
            payload: { memberIds: [memberId], text: "Hi", mentions: [] },
            responseMode: "response-only",
          }),
          client.threads.get({ params: { threadId }, responseMode: "response-only" }),
          client.threads.rename({
            params: { threadId },
            payload: { title: "Launch plan", expectedTitle: null },
            responseMode: "response-only",
          }),
          client.threads.timeline({
            params: { threadId },
            query: { limit: 50, beforeSequence: 9, from: "newest" },
            responseMode: "response-only",
          }),
          client.threads.participants({
            params: { threadId },
            query: { limit: 5, after: participationId },
            responseMode: "response-only",
          }),
          client.threads.publish({
            params: { threadId },
            headers: { "idempotency-key": Request.Key.make("reply-1") },
            payload: { text: "Reply", mentions: [] },
            responseMode: "response-only",
          }),
          client.threads.edit({
            params: { messageId },
            payload: { text: "Edited", mentions: [], expectedRevision: 1 },
            responseMode: "response-only",
          }),
          client.threads.delete({
            params: { messageId },
            responseMode: "response-only",
          }),
          client.threads.follow({
            params: { threadId },
            responseMode: "response-only",
          }),
          client.threads.unfollow({
            params: { threadId },
            payload: { participationId },
            responseMode: "response-only",
          }),
          client.threads.markRead({
            params: { threadId },
            payload: { throughSequence: 4 },
            responseMode: "response-only",
          }),
          client.tasks.list({
            params: { groupId },
            query: { limit: 10, status: "todo" },
            responseMode: "response-only",
          }),
          client.tasks.get({ params: { threadId }, responseMode: "response-only" }),
          client.tasks.create({
            params: { threadId },
            payload: { assignee: memberId },
            responseMode: "response-only",
          }),
          client.tasks.update({
            params: { threadId },
            payload: { change: { _tag: "Status", from: "triage", to: "todo" } },
            responseMode: "response-only",
          }),
          client.notifications.markSeen({
            params: { notificationId: notification.id },
            responseMode: "response-only",
          }),
        ]).pipe(Effect.map((responses) => responses.map((response) => response.status))),
      );
      expect(statuses).toEqual([
        201, 200, 200, 404, 200, 409, 422, 409, 404, 204, 422, 204, 200, 200, 409, 422, 404, 409,
        200, 200, 403, 409, 404, 404, 409, 409, 200, 404, 409, 409, 409,
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
          operation: "thread.rename",
          arguments: [{ threadId, title: "Launch plan", expectedTitle: null }],
        },
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
        {
          operation: "thread.edit",
          arguments: [{ messageId, text: "Edited", mentions: [], expectedRevision: 1 }],
        },
        { operation: "thread.delete", arguments: [messageId] },
        { operation: "thread.follow", arguments: [threadId] },
        { operation: "thread.unfollow", arguments: [{ threadId, participationId }] },
        { operation: "thread.markRead", arguments: [{ threadId, throughSequence: 4 }] },
        { operation: "task.list", arguments: [groupId, { limit: 10, status: "todo" }] },
        { operation: "task.get", arguments: [threadId] },
        { operation: "task.create", arguments: [{ threadId, assignee: memberId }] },
        {
          operation: "task.update",
          arguments: [{ threadId, change: { _tag: "Status", from: "triage", to: "todo" } }],
        },
        { operation: "notification.markSeen", arguments: [notification.id] },
      ]);
    }),
);

it.effect(
  "channel routes pass path parameters and request keys into core inputs, and what a system sends reaches intake as text",
  () =>
    Effect.gen(function* () {
      calls.length = 0;
      const connectionId = Connection.Id.make("connection-one");
      const key = Request.Key.make("channel-1");
      const statuses = yield* run("alice", (client) =>
        Effect.all([
          client.channels.list({ responseMode: "response-only" }),
          client.channels.create({
            headers: { "idempotency-key": key },
            payload: { connectionId, groupId, name: "Support", opensTasks: true },
            responseMode: "response-only",
          }),
          client.channels.get({
            params: { channelId },
            responseMode: "response-only",
          }),
          client.channels.redirect({
            params: { channelId },
            payload: { groupId },
            responseMode: "response-only",
          }),
          client.channels.remove({
            params: { channelId },
            responseMode: "response-only",
          }),
          client.channels.binding({
            params: { threadId },
            responseMode: "response-only",
          }),
        ]).pipe(Effect.map((responses) => responses.map((response) => response.status))),
      );
      expect(statuses).toEqual([200, 422, 404, 404, 204, 404]);
      // The system's request needs no session; its body and headers go to intake as they came.
      const answer = yield* run("", (client) =>
        client.channelEvents.receive({
          params: { workspaceId, channelId },
          payload: '{"events":[]}',
        }),
      );
      expect(answer).toBe("ack");
      expect(
        calls.filter((call) => call.operation !== "asMember" && call.operation !== "inWorkspace"),
      ).toMatchObject([
        { operation: "channel.list", arguments: [] },
        {
          operation: "channel.create",
          arguments: [
            { connectionId, groupId, name: "Support", opensTasks: true },
            { requestKey: key },
          ],
        },
        { operation: "channel.get", arguments: [channelId] },
        { operation: "channel.redirect", arguments: [{ channelId, groupId }] },
        { operation: "channel.remove", arguments: [channelId] },
        { operation: "channel.binding", arguments: [threadId] },
        {
          operation: "channel.receive",
          arguments: [
            channelId,
            { body: '{"events":[]}', headers: { "content-type": "text/plain" } },
          ],
        },
      ]);
    }),
);
