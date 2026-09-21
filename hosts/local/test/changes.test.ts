import { Api, Authentication } from "@amends/api-http";
import { BuiltinRoles } from "@amends/core/authorization";
import { ChangeFeed } from "@amends/core/change-feed";
import { Identity } from "@amends/core/identity";
import { InvitationFacts, MemberFacts, Workspace } from "@amends/core/workspace";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Layer, Queue, Schema, Scope, Stream } from "effect";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DevelopmentAuthentication } from "../src/authentication/authentication.ts";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";

const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));
const server = (filename: string) =>
  HttpRouter.serve(LocalServer.layerRoutes, {
    disableLogger: true,
    disableListenLog: true,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layerSqlite(filename),
        DevelopmentAuthentication.layer().pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
const temporary = Effect.fnUntraced(function* <A, E, R>(
  use: (filename: string) => Effect.Effect<A, E, R>,
) {
  const directory = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "amends-changes-http-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  );
  return yield* use(join(directory, "test.sqlite"));
}, Effect.scoped);
const listen = (api: Effect.Success<ReturnType<typeof client>>, workspaceId: Workspace.Id) =>
  Effect.gen(function* () {
    const scope = yield* Scope.fork(yield* Scope.Scope);
    const queue = yield* Queue.unbounded<ChangeFeed.Message>();
    yield* Stream.unwrap(api.changes.watch({ params: { workspaceId } })).pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.forkScoped,
      Scope.provide(scope),
    );
    expect(yield* Queue.take(queue)).toEqual({ _tag: "Ready", workspaceId });
    return { next: Queue.take(queue), close: Scope.close(scope, Exit.void) };
  });
it.live(
  "SSE keeps workspace services alive, carries real commits, isolates workspaces, and reconnects without replay",
  () =>
    temporary((filename) =>
      Effect.gen(function* () {
        const alice = yield* client("alice");
        const bob = yield* client("bob");
        const workspace = yield* alice.workspaces.create({ payload: { name: "First" } });
        const other = yield* alice.workspaces.create({ payload: { name: "Other" } });
        const first = yield* listen(alice, workspace.id);
        const second = yield* listen(alice, workspace.id);
        const foreign = yield* listen(alice, other.id);
        const issue = (workspaceId: Workspace.Id, recipientId = "bob") =>
          alice.invitations.issue({
            params: { workspaceId },
            payload: {
              recipientId: Identity.HumanId.make(recipientId),
              roleId: BuiltinRoles.ViewerId,
              expiresAt: DateTime.add(DateTime.makeUnsafe("2036-09-20T12:00:00.123Z"), { days: 1 }),
            },
          });
        const invitation = yield* issue(workspace.id);
        const received = yield* first.next;
        expect(yield* second.next).toEqual(received);
        if (received._tag !== "Committed") return yield* Effect.die("Expected commit");
        expect(received.events).toHaveLength(1);
        const issued = received.events[0];
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
        });
        const accepted = yield* first.next;
        expect(yield* second.next).toEqual(accepted);
        if (accepted._tag !== "Committed") return yield* Effect.die("Expected commit");
        expect(accepted.workspaceId).toBe(workspace.id);
        expect(accepted.events.map((event) => event.name)).toContain(MemberFacts.Added.name);
        expect(accepted.events.map((event) => event.name)).toContain(InvitationFacts.Accepted.name);
        expect(new Set(accepted.events.map((event) => event.id)).size).toBe(accepted.events.length);
        expect(accepted.commitId).not.toBe(received.commitId);
        // Projection state is readable by the time the commit is delivered.
        expect(
          yield* alice.members.get({ params: { workspaceId: workspace.id, memberId: member.id } }),
        ).toEqual(member);
        const asBob = yield* listen(bob, workspace.id);
        yield* first.close;
        const missed = yield* issue(workspace.id, "dave");
        const missedEvent = yield* second.next;
        expect(missedEvent).toMatchObject({
          _tag: "Committed",
          events: [{ payload: { id: missed.details.id } }],
        });
        expect(yield* asBob.next).toEqual(missedEvent);
        const reconnected = yield* listen(alice, workspace.id);
        const after = yield* issue(workspace.id, "eve");
        const afterEvent = yield* reconnected.next;
        expect(afterEvent).toMatchObject({
          _tag: "Committed",
          events: [{ payload: { id: after.details.id } }],
        });
        expect(yield* second.next).toEqual(afterEvent);
        expect(yield* asBob.next).toEqual(afterEvent);
        yield* asBob.close;
        yield* alice.members.remove({ params: { workspaceId: workspace.id, memberId: member.id } });
        expect(
          yield* bob.changes.watch({ params: { workspaceId: workspace.id } }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "Gateway.NotMember" });
        yield* Effect.all([second.close, foreign.close, reconnected.close]);
      }).pipe(Effect.timeout("10 seconds"), Effect.scoped, Effect.provide(server(filename))),
    ),
);

it.live(
  "SSE requires authentication and active membership before sending Ready; wire format has no resume ID",
  () =>
    temporary((filename) =>
      Effect.gen(function* () {
        const alice = yield* client("alice");
        const workspace = yield* alice.workspaces.create({ payload: { name: "First" } });
        const http = yield* HttpClient.HttpClient;
        const path = `/workspaces/${workspace.id}/changes`;
        expect((yield* http.get(path)).status).toBe(401);
        expect(
          (yield* http.get(path, { headers: { authorization: "Bearer outsider" } })).status,
        ).toBe(403);
        const response = yield* http.get(path, {
          headers: { authorization: "Bearer alice", "last-event-id": "ignored" },
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
        expect(text).not.toMatch(/^id:/m);
        const openapi = yield* (yield* http.get("/openapi.json")).json;
        expect(openapi).toMatchObject({
          paths: { "/workspaces/{workspaceId}/changes": { get: { operationId: "changes.watch" } } },
        });
      }).pipe(Effect.timeout("10 seconds"), Effect.scoped, Effect.provide(server(filename))),
    ),
);
