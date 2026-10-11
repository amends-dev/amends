import { GroupService, GroupMembershipService } from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Log, Store } from "@amends-dev/core/journal";
import { Request } from "@amends-dev/core/request";
import { ThreadService, ThreadMessageService } from "@amends-dev/core/thread";
import { InvitationService, Member } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Layer, Option } from "effect";
import type { Fixture, Storage } from "./fixture.ts";
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
export const requests = (fixture: Fixture) => {
  const { core, initialized, seed, gateway } = Support;

  /** A workspace with its owner and another viewer, both in one team group. */
  const world = (storage: Storage) =>
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
        Effect.flatMap(GroupService.Service, (groupService) =>
          groupService.createTeam({
            name: "Team",
            memberIds: [owner.memberId, other.memberId],
          }),
        ),
      );
      const start = (text: string, options: Request.Options = { requestKey: key }) =>
        Effect.flatMap(ThreadService.Service, (threadService) =>
          threadService.startInGroup({ groupId: group.id, text, mentions: [] }, options),
        );
      return { storage, bound, owner, group, services, as, start };
    });

  describe.skipIf(!fixture.available)(`${fixture.name}: request keys`, () => {
    it.effect("a retried keyed start returns the first thread and records nothing more", () =>
      fixture.withStorage((storage) =>
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

    it.effect("a reused key returns what it created, whatever the retry asks for", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, as, start } = yield* world(storage);
          const first = yield* as(owner, start("Hello"));
          const before = yield* history(bound);
          expect(yield* as(owner, start("Goodbye"))).toEqual(first);
          expect(yield* history(bound)).toEqual(before);
          const direct = (text: string) =>
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.startDirect(
                { memberIds: [other.memberId], text, mentions: [] },
                { requestKey: key },
              ),
            );
          const opened = yield* as(owner, direct("Hi"));
          const afterDirect = yield* history(bound);
          expect(yield* as(owner, direct("Bye"))).toEqual(opened);
          expect(yield* history(bound)).toEqual(afterDirect);
        }),
      ),
    );

    it.effect("keys belong to their member and their operation", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { owner, as, start } = yield* world(storage);
          const mine = yield* as(owner, start("Hello"));
          const theirs = yield* as(other, start("Hello"));
          expect(theirs.thread.id).not.toBe(mine.thread.id);
          // The same key names a different request for another operation.
          const reply = yield* as(
            owner,
            Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
              threadMessageService.publish(
                { threadId: mine.thread.id, text: "Hello", mentions: [] },
                { requestKey: key },
              ),
            ),
          );
          expect(reply.id).not.toBe(mine.message.id);
        }),
      ),
    );

    it.effect("a retry passes the start's checks again before it finds the thread", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, group, as, start } = yield* world(storage);
          yield* as(other, start("Hello"));
          const admission = yield* bound.groupMemberships.findActive(group.id, other.memberId);
          yield* as(
            other,
            Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
              groupMembershipService.leave({
                groupId: group.id,
                membershipId: Option.getOrThrow(admission).id,
              }),
            ),
          );
          expect(yield* Effect.flip(as(other, start("Hello")))).toEqual(
            new ThreadService.GroupNotFound({ groupId: group.id }),
          );
        }),
      ),
    );

    it.effect("a retry after a rolled-back attempt runs again", () =>
      fixture.withStorage((storage) =>
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
      fixture.withStorage((storage) =>
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
      fixture.withStorage((storage) =>
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
            Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
              threadMessageService.publish(
                { threadId: started.thread.id, text: "Reply", mentions: [] },
                { requestKey },
              ),
            ),
          );
          yield* twice(
            Effect.flatMap(ThreadService.Service, (threadService) =>
              threadService.startDirect(
                { memberIds: [other.memberId], text: "Hi", mentions: [] },
                { requestKey },
              ),
            ),
          );
          yield* twice(
            Effect.flatMap(GroupService.Service, (groupService) =>
              groupService.createTeam({ name: "Second", memberIds: [] }, { requestKey }),
            ),
          );
          const expiresAt = yield* future;
          yield* twice(
            Effect.flatMap(InvitationService.Service, (invitationService) =>
              invitationService.issue(request(expiresAt, Identity.HumanId.make("carol")), {
                requestKey,
              }),
            ),
          );
        }),
      ),
    );

    it.effect("a created record's key returns it, whatever the retry asks for", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const { bound, owner, as } = yield* world(storage);
          const create = (name: string) =>
            Effect.flatMap(GroupService.Service, (groupService) =>
              groupService.createTeam({ name, memberIds: [] }, { requestKey: key }),
            );
          const first = yield* as(owner, create("Second"));
          const before = yield* history(bound);
          expect(yield* as(owner, create("Different"))).toEqual(first);
          expect(yield* history(bound)).toEqual(before);
        }),
      ),
    );

    it.effect("a keyed workspace creation returns the same workspace on retry", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const host = yield* storage.connect();
          const create = (name: string, creator = alice.id) =>
            Effect.flatMap(Gateway.Service, (gateway) =>
              gateway.createWorkspace(
                creator,
                { name, memberName: Member.Name.make(creator) },
                { requestKey: key },
              ),
            ).pipe(Effect.provide(gateway(host)));
          const first = yield* create("Studio");
          expect(yield* create("Studio")).toEqual(first);
          expect(yield* create("Other name")).toEqual(first);
          // Another creator's key names another workspace.
          const theirs = yield* create("Studio", Identity.HumanId.make("bob"));
          expect(theirs.id).not.toBe(first.id);
          // A retry on another host finds it too.
          const elsewhere = yield* storage.connect();
          expect(
            yield* Effect.flatMap(Gateway.Service, (gateway) =>
              gateway.createWorkspace(
                alice.id,
                { name: "Studio", memberName: "alice" },
                { requestKey: key },
              ),
            ).pipe(Effect.provide(gateway(elsewhere))),
          ).toEqual(first);
        }),
      ),
    );
  });
};
