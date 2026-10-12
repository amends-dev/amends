import { Api, Authentication, Streams } from "@amends-dev/http";
import { BuiltinRoles } from "@amends-dev/core/authorization";
import { ChangeFeed } from "@amends-dev/core/change-feed";
import { GroupFacts } from "@amends-dev/core/group";
import { Identity } from "@amends-dev/core/identity";
import { Thread, ThreadService } from "@amends-dev/core/thread";
import { InvitationFacts, Member, MemberFacts, Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import {
  Context,
  DateTime,
  Effect,
  Exit,
  Layer,
  Queue,
  Redacted,
  Schema,
  Scope,
  Stream,
} from "effect";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import * as DevelopmentAuthentication from "../src/DevelopmentAuthentication.ts";
import * as LocalHost from "../src/LocalHost.ts";
import * as LocalServer from "../src/LocalServer.ts";
import { setup } from "./database.ts";

const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api.Api).pipe(Effect.provide(asToken(token)));
/**
 * The HTTP server over a host; the host's gateway stays available to seed what HTTP cannot. Limits
 * on open streams default to the server's own.
 */
const server = (url: string, limits?: Context.Service.Shape<typeof Streams.Limits>) =>
  HttpRouter.serve(LocalServer.layerRoutes, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provideMerge(
      Layer.merge(
        DevelopmentAuthentication.layer().pipe(
          Layer.provide(BunCrypto.layer),
          Layer.provideMerge(LocalHost.layer(Redacted.make(url))),
        ),
        limits === undefined ? Layer.empty : Layer.succeed(Streams.Limits, limits),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
const listen = (
  api: Effect.Success<ReturnType<typeof client>>,
  workspaceId: Workspace.Id,
  after?: ChangeFeed.Cursor,
) =>
  Effect.gen(function* () {
    const scope = yield* Scope.fork(yield* Scope.Scope);
    const queue = yield* Queue.unbounded<ChangeFeed.Message>();
    yield* Stream.unwrap(
      api.changeFeed.watch({
        params: { workspaceId },
        query: after === undefined ? {} : { after },
      }),
    ).pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.forkScoped,
      Scope.provide(scope),
    );
    const ready = yield* Queue.take(queue);
    if (!ChangeFeed.Message.isAnyOf(["Ready"])(ready))
      return yield* Effect.die("Expected Ready first");
    expect(ready).toMatchObject({ workspaceId, reset: after === undefined });
    return { ready, next: Queue.take(queue), close: Scope.close(scope, Exit.void) };
  });
const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "SSE keeps workspace services alive, carries real commits, isolates workspaces, and resumes from a cursor",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const alice = yield* client("alice");
          const workspace = yield* alice.workspaces.create({
            headers: {},
            payload: { name: "First", memberName: "alice" },
          });
          const other = yield* alice.workspaces.create({
            headers: {},
            payload: { name: "Other", memberName: "alice" },
          });
          const first = yield* listen(alice, workspace.id);
          const second = yield* listen(alice, workspace.id);
          const foreign = yield* listen(alice, other.id);
          const issue = (workspaceId: Workspace.Id, name = "bob") =>
            alice.invitations.issue({
              headers: {},
              params: { workspaceId },
              payload: {
                email: `${name}@example.com`,
                roleId: BuiltinRoles.MemberId,
                expiresAt: DateTime.add(DateTime.makeUnsafe("2036-09-20T12:00:00.123Z"), {
                  days: 1,
                }),
              },
            });
          const invitation = yield* issue(workspace.id);
          // Development tokens are human IDs: each invitee's is their account's.
          const bob = yield* client(invitation.details.recipientId);
          const received = yield* first.next;
          expect(yield* second.next).toEqual(received);
          if (!ChangeFeed.Message.isAnyOf(["Committed"])(received))
            return yield* Effect.die("Expected commit");
          expect(received.events).toHaveLength(1);
          expect(received.notifications).toEqual([]);
          const issued = received.events[0];
          if (issued === undefined) return yield* Effect.die("Expected an event");
          expect(issued.name).toBe(InvitationFacts.Issued.name);
          expect(DateTime.isDateTime(issued.recordedAt)).toBe(true);
          const payload = yield* Schema.decodeUnknownEffect(InvitationFacts.Issued.payload)(
            issued.payload,
          );
          expect(payload).toEqual(invitation.details);
          yield* issue(other.id, "carol");
          expect(yield* foreign.next).toMatchObject({ _tag: "Committed", workspaceId: other.id });
          const member = yield* bob.invitations.accept({
            params: { workspaceId: workspace.id, invitationId: invitation.details.id },
            payload: { name: "bob" },
          });
          const accepted = yield* first.next;
          expect(yield* second.next).toEqual(accepted);
          if (!ChangeFeed.Message.isAnyOf(["Committed"])(accepted))
            return yield* Effect.die("Expected commit");
          expect(accepted.workspaceId).toBe(workspace.id);
          expect(accepted.events.map((event) => event.name)).toContain(MemberFacts.Added.name);
          expect(accepted.events.map((event) => event.name)).toContain(
            InvitationFacts.Accepted.name,
          );
          expect(new Set(accepted.events.map((event) => event.id)).size).toBe(
            accepted.events.length,
          );
          expect(accepted.commitId).not.toBe(received.commitId);
          // Projection state is readable by the time the commit is delivered.
          expect(
            yield* alice.members.get({
              params: { workspaceId: workspace.id, memberId: member.id },
            }),
          ).toEqual(member);
          const asBob = yield* listen(bob, workspace.id);
          yield* first.close;
          const missed = yield* issue(workspace.id, "dave");
          const missedEvent = yield* second.next;
          expect(missedEvent).toMatchObject({
            _tag: "Committed",
            events: [{ payload: { id: missed.details.id } }],
          });
          // Resuming from the last commit it saw, the closed subscriber replays what it missed.
          const resumed = yield* listen(alice, workspace.id, accepted.cursor);
          expect(resumed.ready.cursor).toBe(accepted.cursor);
          expect(yield* resumed.next).toEqual(missedEvent);
          const reconnected = yield* listen(alice, workspace.id);
          expect(reconnected.ready.cursor).toBe(
            ChangeFeed.Message.isAnyOf(["Committed"])(missedEvent) ? missedEvent.cursor : null,
          );
          const after = yield* issue(workspace.id, "eve");
          const afterEvent = yield* reconnected.next;
          expect(afterEvent).toMatchObject({
            _tag: "Committed",
            events: [{ payload: { id: after.details.id } }],
          });
          expect(yield* second.next).toEqual(afterEvent);
          expect(yield* resumed.next).toEqual(afterEvent);
          // A viewer never sees invitations, which only invitation managers may list, but sees
          // the member an acceptance adds and their access.
          const eve = yield* client(after.details.recipientId);
          yield* eve.invitations.accept({
            params: { workspaceId: workspace.id, invitationId: after.details.id },
            payload: { name: "eve" },
          });
          const joined = yield* second.next;
          if (!ChangeFeed.Message.isAnyOf(["Committed"])(joined))
            return yield* Effect.die("Expected commit");
          expect(joined.events.map((event) => event.name)).toContain(InvitationFacts.Accepted.name);
          const seenByBob = yield* asBob.next;
          if (!ChangeFeed.Message.isAnyOf(["Committed"])(seenByBob))
            return yield* Effect.die("Expected commit");
          expect(seenByBob.cursor).toBe(joined.cursor);
          expect(seenByBob.events.map((event) => event.name).toSorted()).toEqual(
            joined.events
              .map((event) => event.name)
              .filter((name) => !name.startsWith("workspace.invitation."))
              .toSorted(),
          );
          // A member naming themselves reaches everyone who may read the members.
          yield* eve.members.rename({
            params: { workspaceId: workspace.id },
            payload: { name: Member.Name.make("Eve Moss") },
          });
          const renamed = yield* second.next;
          expect(renamed).toMatchObject({
            _tag: "Committed",
            events: [{ name: MemberFacts.Renamed.name, payload: { name: "Eve Moss" } }],
          });
          expect(yield* asBob.next).toEqual(renamed);
          // A public group's creation reaches everyone who might join it, not only its members.
          const lobby = yield* alice.groups.create({
            params: { workspaceId: workspace.id },
            headers: {},
            payload: { name: "Lobby", memberIds: [], visibility: "Public" },
          });
          expect(yield* asBob.next).toMatchObject({
            _tag: "Committed",
            events: [{ name: GroupFacts.Created.name, payload: { id: lobby.id } }],
          });
          yield* second.next;
          yield* asBob.close;
          yield* alice.members.remove({
            params: { workspaceId: workspace.id, memberId: member.id },
          });
          expect(
            yield* bob.changeFeed
              .watch({ params: { workspaceId: workspace.id }, query: {} })
              .pipe(Effect.flip),
          ).toMatchObject({ _tag: "GatewayErrors.NotMember" });
          yield* Effect.all([second.close, foreign.close, reconnected.close, resumed.close]);
        }).pipe(Effect.timeout("10 seconds"), Effect.scoped, Effect.provide(server(url))),
      ),
  );

  it.live("typing over HTTP reaches the thread's other readers through their subscription", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const alice = yield* client("alice");
        const workspace = yield* alice.workspaces.create({
          headers: {},
          payload: { name: "Typing", memberName: "alice" },
        });
        const invitation = yield* alice.invitations.issue({
          headers: {},
          params: { workspaceId: workspace.id },
          payload: {
            email: "bob@example.com",
            roleId: BuiltinRoles.MemberId,
            expiresAt: DateTime.makeUnsafe("2036-09-20T12:00:00.123Z"),
          },
        });
        const bob = yield* client(invitation.details.recipientId);
        const member = yield* bob.invitations.accept({
          params: { workspaceId: workspace.id, invitationId: invitation.details.id },
          payload: { name: "bob" },
        });
        // No HTTP endpoint starts threads yet; the host's gateway does it as alice.
        const gateway = yield* Gateway.Gateway;
        const started = yield* gateway.asMember(
          workspace.id,
          { _tag: "Human", id: Identity.HumanId.make("alice") },
          Effect.flatMap(ThreadService.ThreadService, (threadService) =>
            threadService.startDirect({ memberIds: [member.id], mentions: [], text: "Hello" }),
          ),
        );
        const threadId = started.thread.id;
        const watching = yield* listen(bob, workspace.id);
        yield* alice.threads.typing({ params: { workspaceId: workspace.id, threadId } });
        const typing = yield* watching.next;
        expect(typing).toMatchObject({
          _tag: "Signal",
          workspaceId: workspace.id,
          signal: { _tag: "Typing", threadId, groupId: started.thread.groupId },
        });
        expect(
          yield* alice.threads
            .typing({
              params: { workspaceId: workspace.id, threadId: Thread.Id.make("missing") },
            })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "CoreError.NotFound", resource: "Thread", id: "missing" });
        const http = yield* HttpClient.HttpClient;
        const path = `/workspaces/${workspace.id}/threads/${threadId}/typing`;
        expect((yield* http.post(path)).status).toBe(401);
        expect(
          (yield* http.post(path, { headers: { authorization: "Bearer outsider" } })).status,
        ).toBe(403);
        yield* watching.close;
      }).pipe(Effect.timeout("10 seconds"), Effect.scoped, Effect.provide(server(url))),
    ),
  );

  it.live(
    "SSE requires authentication and active membership before sending Ready, and validates cursors",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const alice = yield* client("alice");
          const workspace = yield* alice.workspaces.create({
            headers: {},
            payload: { name: "First", memberName: "alice" },
          });
          const http = yield* HttpClient.HttpClient;
          const path = `/workspaces/${workspace.id}/changes`;
          expect((yield* http.get(path)).status).toBe(401);
          expect(
            (yield* http.get(path, { headers: { authorization: "Bearer outsider" } })).status,
          ).toBe(403);
          for (const after of ["-1", "x", "1.5"])
            expect(
              (yield* http.get(`${path}?after=${after}`, {
                headers: { authorization: "Bearer alice" },
              })).status,
            ).toBe(400);
          const response = yield* http.get(path, {
            headers: { authorization: "Bearer alice" },
          });
          expect(response.headers["content-type"]).toMatch(/^text\/event-stream/);
          expect(response.headers["cache-control"]).toBe("no-store");
          const chunks = yield* response.stream.pipe(
            Stream.decodeText,
            Stream.take(1),
            Stream.runCollect,
          );
          const text = chunks.join("");
          expect(text).toContain('"_tag":"Ready"');
          expect(text).toContain('"reset":true');
          const openapi = yield* (yield* http.get("/openapi.json")).json;
          expect(openapi).toMatchObject({
            paths: {
              "/workspaces/{workspaceId}/changes": { get: { operationId: "changeFeed.watch" } },
            },
          });
        }).pipe(Effect.timeout("10 seconds"), Effect.scoped, Effect.provide(server(url))),
      ),
  );

  it.live("each workspace, and each member of it, may hold only so many open streams", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const alice = yield* client("alice");
        const workspace = yield* alice.workspaces.create({
          headers: {},
          payload: { name: "Busy", memberName: "alice" },
        });
        const admitMember = Effect.fn(function* (name: string) {
          const invitation = yield* alice.invitations.issue({
            headers: {},
            params: { workspaceId: workspace.id },
            payload: {
              email: `${name}@example.com`,
              roleId: BuiltinRoles.MemberId,
              expiresAt: DateTime.add(DateTime.makeUnsafe("2036-09-20T12:00:00.123Z"), { days: 1 }),
            },
          });
          const api = yield* client(invitation.details.recipientId);
          yield* api.invitations.accept({
            params: { workspaceId: workspace.id, invitationId: invitation.details.id },
            payload: { name },
          });
          return api;
        });
        const bob = yield* admitMember("bob");
        const carol = yield* admitMember("carol");
        const refused = (api: typeof alice) =>
          Effect.flip(
            Effect.scoped(
              api.changeFeed.watch({ params: { workspaceId: workspace.id }, query: {} }),
            ),
          );
        const first = yield* listen(alice, workspace.id);
        yield* listen(alice, workspace.id);
        expect(yield* refused(alice)).toMatchObject({
          _tag: "ApiErrors.TooManyStreams",
          limit: "member",
        });
        yield* listen(bob, workspace.id);
        expect(yield* refused(carol)).toMatchObject({
          _tag: "ApiErrors.TooManyStreams",
          limit: "workspace",
        });
        // Closing a stream gives its place back, to its member and to the workspace.
        yield* first.close;
        yield* Effect.sleep("200 millis");
        yield* listen(carol, workspace.id);
      }).pipe(
        Effect.timeout("10 seconds"),
        Effect.scoped,
        Effect.provide(server(url, { perWorkspace: 3, perMember: 2 })),
      ),
    ),
  );
});
