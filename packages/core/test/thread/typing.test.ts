import { expect, it } from "@effect/vitest";
import { Context, Crypto, DateTime, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import * as Authorization from "../../src/authorization/authorization.ts";
import type * as Requirement from "../../src/authorization/requirement.ts";
import * as Group from "../../src/group/group.ts";
import * as Actor from "../../src/identity/actor.ts";
import * as Identity from "../../src/identity/identity.ts";
import * as Journal from "../../src/journal/journal.ts";
import * as Store from "../../src/journal/store.ts";
import * as ReadStateCommand from "../../src/read-state/command.ts";
import * as SignalHub from "../../src/signal/hub.ts";
import * as Signal from "../../src/signal/signal.ts";
import * as ThreadCommand from "../../src/thread/ThreadCommand.ts";
import * as ThreadMessageService from "../../src/thread/ThreadMessageService.ts";
import * as ThreadMessageStore from "../../src/thread/ThreadMessageStore.ts";
import * as ThreadQuery from "../../src/thread/ThreadQuery.ts";
import * as Thread from "../../src/thread/Thread.ts";
import * as Member from "../../src/workspace/member/member.ts";
import * as Workspace from "../../src/workspace/workspace.ts";
import { make } from "../memory.ts";

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
  title: null,
  origin: null,
  createdBy: { _tag: "Member", memberId: actor.memberId },
  createdAt: DateTime.makeUnsafe("2026-09-23T12:00:00.000Z"),
});
const readable = new Set(["open", "other"]);

/** A service typing never calls: every method dies. */
const unused = <I, S extends object>(key: Context.Key<I, S>) =>
  Layer.succeed(
    key,
    new Proxy({} as S, { get: () => () => Effect.die(`Typing uses nothing of ${key.key}`) }),
  );

/** The operation over fake access and authorization, recording what it publishes. */
const run = <A, E>(
  use: (
    published: ReadonlyArray<Signal.Value>,
  ) => Effect.Effect<A, E, ThreadMessageService.ThreadMessageService | Actor.Actor>,
  options: { readonly deny?: boolean } = {},
) =>
  Effect.gen(function* () {
    const published: Array<Signal.Value> = [];
    const requirements: Array<Requirement.Value> = [];
    const unexpected = () => Effect.die("Typing reads nothing but thread access");
    const threadQuery = ThreadQuery.ThreadQuery.of({
      requireAccess: (threadId) =>
        readable.has(threadId)
          ? Effect.succeed(thread(threadId))
          : Effect.fail(new ThreadQuery.NotFound({ threadId })),
      requireReadable: unexpected,
      eligibleMembers: unexpected,
      followers: unexpected,
      currentParticipants: unexpected,
      pageParticipants: unexpected,
      findParticipants: unexpected,
      listReadable: unexpected,
      readTimeline: unexpected,
      readTimelineItem: unexpected,
    });
    const authorization = Authorization.Authorization.of({
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
    const signalHub = SignalHub.SignalHub.of({
      publish: (signal) =>
        Effect.sync(() => {
          published.push(signal);
        }),
      subscribe: Effect.die("Unexpected subscription"),
    });
    const result = yield* use(published).pipe(
      Effect.provide(
        ThreadMessageService.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(ThreadQuery.ThreadQuery, threadQuery),
              Layer.succeed(Authorization.Authorization, authorization),
              Layer.succeed(SignalHub.SignalHub, signalHub),
              Layer.succeed(Store.Store, (yield* make(workspaceId)).store),
              unused(ThreadCommand.ThreadCommand),
              unused(ReadStateCommand.ReadStateCommand),
              unused(ThreadMessageStore.ThreadMessageStore),
              unused(Journal.Journal),
              unused(Crypto.Crypto),
            ),
          ),
        ),
      ),
      Effect.provideService(Actor.Actor, actor),
    );
    return { result, requirements };
  });
const typing = (threadId: string) =>
  Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
    threadMessageService.typing(Thread.Id.make(threadId)),
  );

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
      expect(published.map((s) => Signal.Value.isAnyOf(["Typing"])(s) && s.threadId)).toEqual([
        "open",
        "other",
      ]);
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
          new ThreadMessageService.NotFound({ threadId: Thread.Id.make("hidden") }),
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
