import { expect, it } from "@effect/vitest";
import { AssignmentApplication } from "@amends/core/authorization";
import { ChangeFeedApplication } from "@amends/core/change-feed";
import { Log, Store } from "@amends/core/journal";
import { Notification, NotificationApplication } from "@amends/core/notification";
import {
  InvitationApplication,
  Member,
  MemberApplication,
  OwnershipApplication,
} from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Deferred, Effect, Fiber, Layer, Option, Stream } from "effect";
import { SqliteDatabase } from "../src/database.ts";
import { alice, boundTo, host, temporary, views } from "./support.ts";

it.effect("workspace reads and SSE open while another transaction holds the writer lock", () =>
  temporary((location) =>
    Effect.scoped(
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        // Creating the workspace also completes boot; this test exercises warm requests.
        const workspace = yield* gateway.createWorkspace(alice.id, { name: "Read concurrency" });
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        // The host's single SQLite connection remains serialized. A second connection
        // proves ordinary reads no longer contend for the database's writer lock.
        const writerContext = yield* Layer.build(SqliteDatabase.layer(location));
        const storage = yield* views.pipe(Effect.provide(writerContext));
        const writer = yield* storage.forWorkspace(workspace.id);
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const writing = yield* writer.store
          .transaction(
            Effect.gen(function* () {
              yield* (yield* Store.Transaction).append({
                logId: Log.Id.make("background"),
                entries: [{ payload: new Uint8Array([1]) }],
              });
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
            }),
          )
          .pipe(Effect.forkChild);
        yield* Deferred.await(entered).pipe(Effect.timeout("3 seconds"));
        yield* Effect.gen(function* () {
          yield* gateway.asMemberScoped(
            workspace.id,
            alice,
            Effect.gen(function* () {
              expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
              const members = yield* MemberApplication.Service;
              expect((yield* members.get(workspace.ownerMemberId)).identity).toEqual(alice);
              expect(yield* members.list).toHaveLength(1);
              expect(yield* (yield* InvitationApplication.Service).list).toEqual([]);
              const assignments = yield* AssignmentApplication.Service;
              expect(yield* assignments.roles).toHaveLength(3);
              expect((yield* assignments.list(workspace.ownerMemberId)).assignments).toHaveLength(
                1,
              );
              expect((yield* (yield* OwnershipApplication.Service).get).workspace).toEqual(
                workspace,
              );
              const notifications = yield* NotificationApplication.Service;
              expect(yield* notifications.list({ limit: 10 })).toEqual([]);
              expect(yield* notifications.listPending({ limit: 10 })).toEqual([]);
              expect(
                yield* Effect.flip(notifications.get(Notification.Id.make("missing"))),
              ).toMatchObject({
                _tag: "NotificationApplication.NotFound",
              });
              const stream = yield* (yield* ChangeFeedApplication.Service).watch;
              expect(yield* stream.pipe(Stream.take(1), Stream.runCollect)).toEqual([
                { _tag: "Ready", workspaceId: workspace.id },
              ]);
            }),
          );
          // Write operations still enter their transaction before checking the target.
          expect(
            yield* Effect.flip(
              gateway.asMember(
                workspace.id,
                alice,
                Effect.flatMap(MemberApplication.Service, (members) =>
                  members.remove(Member.Id.make("missing")),
                ),
              ),
            ),
          ).toMatchObject({ _tag: "Gateway.Conflict" });
        }).pipe(Effect.timeout("3 seconds"), Effect.ensuring(Deferred.succeed(release, undefined)));
        yield* Fiber.join(writing);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
      }),
    ).pipe(Effect.provide(host(location))),
  ),
);
