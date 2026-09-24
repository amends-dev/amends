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
const operations = Layer.mergeAll(
  Layer.succeed(
    NotificationApplication.Service,
    NotificationApplication.Service.of({
      workspaceId,
      resolveSource: () => Effect.die("Source resolution is not exposed over HTTP yet"),
      acknowledge: () => Effect.die("Acknowledgment is not exposed over HTTP yet"),
      get: record("notification.get", (notificationId) =>
        notificationId === notification.id
          ? Effect.succeed(notification)
          : Effect.fail(new NotificationApplication.NotFound({ workspaceId, notificationId })),
      ),
      list: record("notification.list", () => Effect.succeed([notification])),
      listPending: record("notification.listPending", () => Effect.succeed([notification])),
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
      }),
    );
    expect(accepted).toEqual(member);
    expect(calls).toEqual([
      {
        operation: "createWorkspace",
        arguments: [alice.id, { name: "Test workspace" }, { requestKey: "create-1" }],
      },
      { operation: "inWorkspace", arguments: [workspaceId] },
      { operation: "accept", arguments: ["invitation-one", alice.id] },
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
          roleId: BuiltinRoles.ViewerId,
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
          roleId: BuiltinRoles.ViewerId,
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
