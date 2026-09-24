import { ChangeFeedApplication } from "@amends/core/change-feed";
import { GroupApplication } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Log, Store } from "@amends/core/journal";
import { Request } from "@amends/core/request";
import { ThreadApplication, ThreadMessageApplication } from "@amends/core/thread";
import { InvitationApplication, Member } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Fiber, Layer, Queue, Stream } from "effect";
import type { Harness } from "./harness.ts";
import {
  alice,
  type Bound,
  failingLate,
  forWorkspace,
  future,
  request,
  Support,
  workspaceId,
} from "./support.ts";

const memberActor = (name: string) =>
  Actor.Value.make({
    workspaceId,
    memberId: Member.Id.make(name),
    identity: { _tag: "Human", id: Identity.HumanId.make(name) },
  });
const other = memberActor("other");
const key = Request.Key.make("request-1");
const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 500 });

/** Request keys: a retry of a creating request returns what its first attempt created. */
export const requests = (harness: Harness) => {
  const { core, initialized, seed, gateway } = Support.make(harness);

  /** A workspace with its owner and another viewer, both in one team group. */
  const world = (storage: Parameters<Parameters<Harness["withStorage"]>[0]>[0]) =>
    Effect.gen(function* () {
      const host = yield* storage.connect();
      const bound = yield* forWorkspace(host, workspaceId);
      const workspace = yield* initialized(bound);
      const owner = Actor.Value.make({
        workspaceId,
        memberId: workspace.ownerMemberId,
        identity: alice,
      });
      yield* seed(bound, [other], [other]);
      const services = yield* Layer.build(core(bound));
      const as = <A, E, R>(actor: Actor.Value, program: Effect.Effect<A, E, R>, on = services) =>
        program.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(on));
      const group = yield* as(
        owner,
        Effect.flatMap(GroupApplication.Service, (groups) =>
          groups.createPrivateTeam({ name: "Team", memberIds: [owner.memberId, other.memberId] }),
        ),
      );
      const start = (text: string, options: Request.Options = { requestKey: key }) =>
        Effect.flatMap(ThreadApplication.Service, (threads) =>
          threads.startInGroup({ groupId: group.id, text, mentions: [] }, options),
        );
      return { storage, bound, owner, group, services, as, start };
    });

  describe.skipIf(!harness.available)(`${harness.name}: request keys`, () => {
    it.effect("a retried keyed start returns the first thread and records nothing more", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, as, start } = yield* world(storage);
          const first = yield* as(owner, start("Hello"));
          const before = yield* history(bound);
          const retried = yield* as(owner, start("Hello"));
          expect(retried).toEqual(first);
          expect(yield* history(bound)).toEqual(before);
          expect(yield* bound.threads.listByGroup(first.thread.groupId)).toHaveLength(1);
          // Without a key, the same call creates another thread.
          const unkeyed = yield* as(owner, start("Hello", {}));
          expect(unkeyed.thread.id).not.toBe(first.thread.id);
        }),
      ),
    );

    it.effect("a key reused with a different input is refused and records nothing", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, as, start } = yield* world(storage);
          yield* as(owner, start("Hello"));
          const before = yield* history(bound);
          expect(yield* Effect.flip(as(owner, start("Goodbye")))).toEqual(
            new Request.Reused({ operation: "thread.start", key }),
          );
          expect(yield* history(bound)).toEqual(before);
        }),
      ),
    );

    it.effect("keys belong to their member and their operation", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { owner, as, start } = yield* world(storage);
          const mine = yield* as(owner, start("Hello"));
          const theirs = yield* as(other, start("Hello"));
          expect(theirs.thread.id).not.toBe(mine.thread.id);
          // The same key names a different request for another operation.
          const reply = yield* as(
            owner,
            Effect.flatMap(ThreadMessageApplication.Service, (messages) =>
              messages.publish(
                { threadId: mine.thread.id, text: "Hello", mentions: [] },
                { requestKey: key },
              ),
            ),
          );
          expect(reply.message.id).not.toBe(mine.message.id);
        }),
      ),
    );

    it.effect("a retry after a rolled-back attempt runs again", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, group, as, start } = yield* world(storage);
          const failure = new Store.Failure({ operation: "commit", cause: "injected" });
          const failing = yield* Layer.build(core(failingLate(bound, failure)));
          expect(Exit.isFailure(yield* Effect.exit(as(owner, start("Hello"), failing)))).toBe(true);
          expect(yield* bound.threads.listByGroup(group.id)).toEqual([]);
          const retried = yield* as(owner, start("Hello"));
          expect(yield* bound.threads.listByGroup(group.id)).toEqual([retried.thread]);
        }),
      ),
    );

    it.effect("concurrent duplicates create one thread, and another host's retry finds it", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, group, as, start } = yield* world(storage);
          const attempts = yield* Effect.forEach([1, 2, 3], () => as(owner, start("Hello")), {
            concurrency: "unbounded",
          });
          expect(new Set(attempts.map((started) => started.thread.id)).size).toBe(1);
          expect(yield* bound.threads.listByGroup(group.id)).toHaveLength(1);
          const elsewhere = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const services = yield* Layer.build(core(elsewhere));
          expect(yield* as(owner, start("Hello"), services)).toEqual(attempts[0]);
        }),
      ),
    );

    it.effect("replies, direct starts, group creation, and invitations also run once per key", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, as, start } = yield* world(storage);
          const started = yield* as(owner, start("Hello"));
          const twice = <A, E, R>(program: Effect.Effect<A, E, R>) =>
            Effect.gen(function* () {
              const first = yield* as(owner, program);
              const before = yield* history(bound);
              expect(yield* as(owner, program)).toEqual(first);
              expect(yield* history(bound)).toEqual(before);
              return first;
            });
          const requestKey = Request.Key.make("request-2");
          yield* twice(
            Effect.flatMap(ThreadMessageApplication.Service, (messages) =>
              messages.publish(
                { threadId: started.thread.id, text: "Reply", mentions: [] },
                { requestKey },
              ),
            ),
          );
          yield* twice(
            Effect.flatMap(ThreadApplication.Service, (threads) =>
              threads.startDirect(
                { memberIds: [other.memberId], text: "Hi", mentions: [] },
                { requestKey },
              ),
            ),
          );
          yield* twice(
            Effect.flatMap(GroupApplication.Service, (groups) =>
              groups.createPrivateTeam({ name: "Second", memberIds: [] }, { requestKey }),
            ),
          );
          const expiresAt = yield* future;
          yield* twice(
            Effect.flatMap(InvitationApplication.Service, (invitations) =>
              invitations.issue(request(expiresAt, Identity.HumanId.make("carol")), {
                requestKey,
              }),
            ),
          );
        }),
      ),
    );

    it.effect("receipts stay out of the change feed", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const { owner, as, start } = yield* world(storage);
          const names = yield* Effect.scoped(
            Effect.gen(function* () {
              const stream = yield* as(
                other,
                Effect.flatMap(ChangeFeedApplication.Service, (changes) => changes.watch()),
              );
              const queue = yield* Queue.unbounded<string>();
              const fiber = yield* stream.pipe(
                Stream.runForEach((message) =>
                  message._tag === "Committed"
                    ? Effect.forEach(message.events, (event) => Queue.offer(queue, event.name))
                    : Effect.void,
                ),
                Effect.forkScoped,
              );
              yield* as(owner, start("Hello"));
              yield* Queue.take(queue);
              yield* Fiber.interrupt(fiber);
              return yield* Queue.takeAll(queue);
            }),
          );
          expect(names).not.toContain("request.completed");
        }),
      ),
    );

    it.effect("a keyed workspace creation returns the same workspace on retry", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const host = yield* storage.connect();
          const create = (name: string, creator = alice.id) =>
            Effect.flatMap(Gateway.Service, (g) =>
              g.createWorkspace(creator, { name }, { requestKey: key }),
            ).pipe(Effect.provide(gateway(host)));
          const first = yield* create("Studio");
          expect(yield* create("Studio")).toEqual(first);
          expect(yield* Effect.flip(create("Other name"))).toEqual(
            new Request.Reused({ operation: "workspace.create", key }),
          );
          // Another creator's key names another workspace.
          const theirs = yield* create("Studio", Identity.HumanId.make("bob"));
          expect(theirs.id).not.toBe(first.id);
          // A retry on another host finds it too.
          const elsewhere = yield* storage.connect();
          expect(
            yield* Effect.flatMap(Gateway.Service, (g) =>
              g.createWorkspace(alice.id, { name: "Studio" }, { requestKey: key }),
            ).pipe(Effect.provide(gateway(elsewhere))),
          ).toEqual(first);
        }),
      ),
    );
  });
};
