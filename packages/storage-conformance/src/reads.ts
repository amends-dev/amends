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
import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Option, Stream } from "effect";
import type { Harness } from "./harness.ts";
import { alice, boundTo, forWorkspace, Support } from "./support.ts";

/** Reads outside transactions, which never wait for writers. */
export const reads = (harness: Harness) => {
  const { gateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: reads`, () => {
    it.effect(
      "workspace reads and SSE open while another host's transaction holds the writer",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const host = yield* storage.connect({ failFast: true });
            yield* Effect.gen(function* () {
              const gateway = yield* Gateway.Service;
              // Creating the workspace also completes boot; this test exercises warm requests.
              const workspace = yield* gateway.createWorkspace(alice.id, {
                name: "Read concurrency",
              });
              const bound = yield* boundTo(workspace.id);
              const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
              const writer = yield* forWorkspace(yield* storage.connect(), workspace.id);
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
              yield* Deferred.await(entered);
              yield* Effect.gen(function* () {
                yield* gateway.asMemberScoped(
                  workspace.id,
                  alice,
                  Effect.gen(function* () {
                    expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(
                      true,
                    );
                    const members = yield* MemberApplication.Service;
                    expect((yield* members.get(workspace.ownerMemberId)).identity).toEqual(alice);
                    expect(yield* members.list).toHaveLength(1);
                    expect(yield* (yield* InvitationApplication.Service).list).toEqual([]);
                    const assignments = yield* AssignmentApplication.Service;
                    expect(yield* assignments.roles).toHaveLength(3);
                    expect(
                      (yield* assignments.list(workspace.ownerMemberId)).assignments,
                    ).toHaveLength(1);
                    expect((yield* (yield* OwnershipApplication.Service).get).workspace).toEqual(
                      workspace,
                    );
                    const notifications = yield* NotificationApplication.Service;
                    expect(yield* notifications.list({ limit: 10 })).toEqual([]);
                    expect(yield* notifications.listPending({ limit: 10 })).toEqual([]);
                    expect(
                      yield* Effect.flip(notifications.get(Notification.Id.make("missing"))),
                    ).toMatchObject({ _tag: "NotificationApplication.NotFound" });
                    const stream = yield* (yield* ChangeFeedApplication.Service).watch();
                    expect(yield* stream.pipe(Stream.take(1), Stream.runCollect)).toMatchObject([
                      { _tag: "Ready", workspaceId: workspace.id, reset: true },
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
              }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
              yield* Fiber.join(writing);
              expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(
                before,
              );
            }).pipe(Effect.provide(gateway(host)));
          }),
        ),
    );
  });
};
