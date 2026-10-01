import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { Authorization } from "../../src/authorization/authorization.ts";
import type { Requirement } from "../../src/authorization/requirement.ts";
import { Group } from "../../src/group/group.ts";
import { Actor } from "../../src/identity/actor.ts";
import { Identity } from "../../src/identity/identity.ts";
import { SignalApplication } from "../../src/signal/application.ts";
import { Signal } from "../../src/signal/signal.ts";
import { Signals } from "../../src/signal/signals.ts";
import { Store } from "../../src/journal/store.ts";
import { ThreadQuery } from "../../src/thread/query.ts";
import { Thread } from "../../src/thread/thread.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { make } from "../memory-store.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const groupId = Group.Id.make("group");
const actor = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("alice-member"),
  identity: { _tag: "Human", id: Identity.HumanId.make("alice") },
});
const thread = (id: string): Thread.Record => ({
  id: Thread.Id.make(id),
  workspaceId,
  groupId,
  createdBy: { _tag: "Member", memberId: actor.memberId },
  createdAt: DateTime.makeUnsafe("2026-09-23T12:00:00.000Z"),
});
const readable = new Set(["open", "other"]);

/** The operation over fake access and authorization, recording what it publishes. */
const run = <A, E>(
  use: (
    published: ReadonlyArray<Signal.Value>,
  ) => Effect.Effect<A, E, SignalApplication.Service | Actor.Service>,
  options: { readonly deny?: boolean } = {},
) =>
  Effect.gen(function* () {
    const published: Array<Signal.Value> = [];
    const requirements: Array<Requirement.Value> = [];
    const unexpected = () => Effect.die("Typing reads nothing but thread access");
    const threadQuery = ThreadQuery.Service.of({
      requireAccess: (threadId) =>
        readable.has(threadId)
          ? Effect.succeed(thread(threadId))
          : Effect.fail(new ThreadQuery.NotFound({ threadId })),
      eligibleMembers: unexpected,
      currentParticipants: unexpected,
      pageParticipants: unexpected,
      findParticipants: unexpected,
      readTimeline: unexpected,
      readTimelineItem: unexpected,
    });
    const authorization = Authorization.Service.of({
      require: (needed) =>
        Effect.suspend(() => {
          requirements.push(...needed);
          return options.deny === true && needed.length > 0
            ? Effect.fail(
                new Authorization.Denied({ memberId: actor.memberId, requirement: needed[0]! }),
              )
            : Effect.void;
        }),
      permitted: () => Effect.die("Unexpected permitted check"),
    });
    const signals = Signals.Service.of({
      publish: (signal) =>
        Effect.sync(() => {
          published.push(signal);
        }),
      subscribe: Effect.die("Unexpected subscription"),
    });
    const result = yield* use(published).pipe(
      Effect.provide(
        SignalApplication.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(ThreadQuery.Service, threadQuery),
              Layer.succeed(Authorization.Service, authorization),
              Layer.succeed(Signals.Service, signals),
              Layer.succeed(Store.Service, (yield* make(workspaceId)).store),
            ),
          ),
        ),
      ),
      Effect.provideService(Actor.Service, actor),
    );
    return { result, requirements };
  });
const typing = (threadId: string) =>
  Effect.flatMap(SignalApplication.Service, (signals) => signals.typing(Thread.Id.make(threadId)));

it.effect(
  "typing tells the thread's readers for the next few seconds, and needs permission to post",
  () =>
    Effect.gen(function* () {
      const { requirements } = yield* run((published) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now;
          yield* typing("open");
          expect(published).toEqual([
            Signal.Value.cases.Typing.make({
              workspaceId,
              groupId,
              threadId: Thread.Id.make("open"),
              memberId: actor.memberId,
              until: DateTime.add(now, { seconds: 6 }),
            }),
          ]);
        }),
      );
      expect(requirements.map((r) => [r.permission.name, r.target])).toEqual([
        ["thread.publish", { _tag: "Thread", workspaceId, threadId: "open" }],
      ]);
    }),
);

it.effect("repeats within two seconds are dropped per thread, and later ones go through", () =>
  run((published) =>
    Effect.gen(function* () {
      yield* typing("open");
      yield* TestClock.adjust("1 second");
      yield* typing("open");
      yield* typing("other");
      expect(published.map((s) => s._tag === "Typing" && s.threadId)).toEqual(["open", "other"]);
      yield* TestClock.adjust("1 second");
      yield* typing("open");
      expect(published).toHaveLength(3);
    }),
  ),
);

it.effect("inaccessible threads and missing permission publish nothing", () =>
  Effect.gen(function* () {
    yield* run((published) =>
      Effect.gen(function* () {
        expect(yield* Effect.flip(typing("hidden"))).toEqual(
          new SignalApplication.ThreadNotFound({ threadId: Thread.Id.make("hidden") }),
        );
        expect(published).toEqual([]);
      }),
    );
    yield* run(
      (published) =>
        Effect.gen(function* () {
          expect(yield* Effect.flip(typing("open"))).toMatchObject({
            _tag: "Authorization.Denied",
          });
          expect(published).toEqual([]);
        }),
      { deny: true },
    );
  }),
);
