import { BuiltinRoles, Role, RoleFacts } from "@amends/core/authorization";
import { Journal, Publication } from "@amends/core/journal";
import { ChangeFeed, ChangeFeedService } from "@amends/core/change-feed";
import { GroupService, GroupFacts } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { NotificationService } from "@amends/core/notification";
import { ThreadService, ThreadMessageFacts } from "@amends/core/thread";
import { InvitationService, InvitationFacts, Member } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Queue, Stream } from "effect";
import type { Scope } from "effect";
import type { Harness } from "./harness.ts";
import {
  alice,
  bob,
  type Bound,
  boundTo,
  runHost,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

const issue = (recipient: Identity.HumanId) =>
  InvitationService.Service.use((invitations) =>
    Effect.flatMap(DateTime.now, (now) =>
      invitations.issue({
        recipientId: recipient,
        roleId: BuiltinRoles.MemberId,
        expiresAt: DateTime.add(now, { hours: 1 }),
      }),
    ),
  );

/** Buffer a subscription's messages for the enclosing scope. */
const listen = <E, R>(
  watch: Effect.Effect<Stream.Stream<ChangeFeed.Message, ChangeFeed.Unavailable>, E, R>,
) =>
  Effect.gen(function* () {
    const stream = yield* watch;
    const queue = yield* Queue.unbounded<ChangeFeed.Message>();
    yield* stream.pipe(
      Stream.runForEach((message) => Queue.offer(queue, message)),
      Effect.forkScoped,
    );
    return Queue.take(queue).pipe(Effect.timeout("10 seconds"));
  });
const committed = (message: ChangeFeed.Message) => {
  if (message._tag !== "Committed") throw new Error(`Expected a commit, got ${message._tag}`);
  return message;
};
const watch = (options?: ChangeFeed.WatchOptions) =>
  Effect.flatMap(ChangeFeedService.Service, (changeFeedService) =>
    changeFeedService.watch(options),
  );
const human = (name: string) => Identity.HumanId.make(name);
const memberActor = (name: string) =>
  Actor.Value.make({
    workspaceId,
    memberId: Member.Id.make(name),
    identity: { _tag: "Human", id: human(name) },
  });

/** The change feed read from the journal: delivery across hosts, resumption, and audiences. */
export const changeFeed = (harness: Harness) => {
  const { core, gateway, initialized, seed } = Support.make(harness);
  /** Record a role every member may see, as a trusted fixture would. */
  const marker = (bound: Bound) =>
    Effect.flatMap(Journal.Service, (journal) =>
      journal.commit(
        journal.publish(RoleFacts.Created, {
          roleId: Role.Id.make("marker"),
          workspaceId,
          name: "Marker",
          permissions: [],
        }),
      ),
    ).pipe(
      Effect.provideService(Publication.Service, testProvenance(workspaceId)),
      Effect.provide(core(bound)),
    );
  describe.skipIf(!harness.available)(`${harness.name}: change feed`, () => {
    it.live("a subscriber receives commits made through its own host and through another", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          // Each host keeps one gateway for the test, as a running process would.
          const first = yield* Layer.build(gateway(yield* storage.connect()));
          const second = yield* Layer.build(gateway(yield* storage.connect()));
          const on = <A, E>(
            host: typeof first,
            program: Effect.Effect<A, E, Gateway.Service | Scope.Scope>,
          ) => Effect.provide(program, host);
          const workspace = yield* on(
            first,
            Effect.flatMap(Gateway.Service, (gateway) =>
              gateway.createWorkspace(alice.id, { name: "Feed" }),
            ),
          );
          const next = yield* on(
            first,
            Effect.flatMap(Gateway.Service, (gateway) =>
              listen(gateway.asMemberScoped(workspace.id, alice, watch())),
            ),
          );
          const ready = yield* next;
          expect(ready).toMatchObject({ _tag: "Ready", workspaceId: workspace.id, reset: true });
          yield* on(
            second,
            Effect.flatMap(Gateway.Service, (gateway) =>
              gateway.asMember(workspace.id, alice, issue(bob.id)),
            ),
          );
          const fromOther = committed(yield* next);
          expect(fromOther.events.map((e) => e.name)).toEqual([InvitationFacts.Issued.name]);
          yield* on(
            first,
            Effect.flatMap(Gateway.Service, (gateway) =>
              gateway.asMember(workspace.id, alice, issue(human("carol"))),
            ),
          );
          const fromOwn = committed(yield* next);
          expect(Number(fromOwn.cursor)).toBeGreaterThan(Number(fromOther.cursor));
          if (ready._tag !== "Ready" || ready.cursor === null)
            return yield* Effect.die("Expected a cursor at the initialized workspace");
          expect(Number(fromOther.cursor)).toBeGreaterThan(Number(ready.cursor));
        }),
      ),
    );

    it.live("a cursor resumes on another host with the commits missed in between", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const first = yield* storage.connect();
          const second = yield* storage.connect();
          const workspace = yield* Effect.flatMap(Gateway.Service, (gateway) =>
            gateway.createWorkspace(alice.id, { name: "Resume" }),
          ).pipe(Effect.provide(gateway(first)));
          const cursor = yield* Effect.scoped(
            Effect.gen(function* () {
              const gateway = yield* Gateway.Service;
              const next = yield* listen(gateway.asMemberScoped(workspace.id, alice, watch()));
              yield* next;
              yield* gateway.asMember(workspace.id, alice, issue(bob.id));
              return committed(yield* next).cursor;
            }).pipe(Effect.provide(gateway(first))),
          );
          const missed = yield* Effect.flatMap(Gateway.Service, (gateway) =>
            Effect.forEach(["carol", "dave"], (name) =>
              gateway.asMember(workspace.id, alice, issue(human(name))),
            ),
          ).pipe(Effect.provide(gateway(first)));
          yield* Effect.gen(function* () {
            const gateway = yield* Gateway.Service;
            const next = yield* listen(
              gateway.asMemberScoped(workspace.id, alice, watch({ after: cursor })),
            );
            expect(yield* next).toEqual({
              _tag: "Ready",
              workspaceId: workspace.id,
              cursor,
              reset: false,
            });
            const replayed = [committed(yield* next), committed(yield* next)];
            expect(replayed.map((m) => m.events[0]?.payload)).toMatchObject(
              missed.map((invitation) => ({ id: invitation.details.id })),
            );
          }).pipe(Effect.provide(gateway(second)));
        }),
      ),
    );

    it.live("thread activity reaches the group's members with read access, and nobody else", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const workspace = yield* initialized(bound);
            const owner = Actor.Value.make({
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: alice,
            });
            const reader = memberActor("reader");
            const outsider = memberActor("outsider");
            const unpermitted = memberActor("unpermitted");
            yield* seed(bound, [reader, outsider, unpermitted], [reader, outsider]);
            // One core for the workspace, as one runtime serves every subscriber in a process.
            const services = yield* Layer.build(core(bound));
            const as = <A, E, R>(actor: Actor.Value, program: Effect.Effect<A, E, R>) =>
              program.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(services));
            const feeds = yield* Effect.forEach([reader, outsider, unpermitted], (actor) =>
              as(actor, listen(watch())),
            );
            for (const next of feeds) expect(yield* next).toMatchObject({ reset: true });
            const group = yield* as(
              owner,
              Effect.flatMap(GroupService.Service, (groupService) =>
                groupService.createTeam({
                  name: "Private",
                  memberIds: [owner.memberId, reader.memberId, unpermitted.memberId],
                }),
              ),
            );
            yield* as(
              owner,
              Effect.flatMap(ThreadService.Service, (threadService) =>
                threadService.startInGroup({
                  groupId: group.id,
                  mentions: [],
                  text: "Secret plan",
                }),
              ),
            );
            // A role every member may see marks the end of what each reader receives.
            yield* marker(bound);
            const [readerFeed, outsiderFeed, unpermittedFeed] = feeds;
            if (!readerFeed || !outsiderFeed || !unpermittedFeed)
              return yield* Effect.die("Expected three feeds");
            const created = committed(yield* readerFeed);
            expect(created.events.map((e) => e.name)).toContain(GroupFacts.Created.name);
            const started = committed(yield* readerFeed);
            const text = started.events.find((e) => e.name === ThreadMessageFacts.Published.name);
            expect(text?.payload).toMatchObject({ text: "Secret plan", groupId: group.id });
            expect(committed(yield* readerFeed).events[0]?.name).toBe(RoleFacts.Created.name);
            // Outside the group, or without read permission, only workspace facts arrive.
            for (const next of [outsiderFeed, unpermittedFeed])
              expect(committed(yield* next).events.map((e) => e.name)).toEqual([
                RoleFacts.Created.name,
              ]);
          }),
        ),
      ),
    );

    it.live("a mention's notification reaches its recipient as their inbox lists it", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const workspace = yield* initialized(bound);
            const owner = Actor.Value.make({
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: alice,
            });
            const mentioned = memberActor("mentioned");
            const bystander = memberActor("bystander");
            yield* seed(bound, [mentioned, bystander], [mentioned, bystander]);
            const services = yield* Layer.build(core(bound));
            const as = <A, E, R>(actor: Actor.Value, program: Effect.Effect<A, E, R>) =>
              program.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(services));
            const group = yield* as(
              owner,
              Effect.flatMap(GroupService.Service, (groupService) =>
                groupService.createTeam({
                  name: "Team",
                  memberIds: [owner.memberId, mentioned.memberId, bystander.memberId],
                }),
              ),
            );
            const [mentionedFeed, bystanderFeed] = yield* Effect.forEach(
              [mentioned, bystander],
              (actor) => as(actor, listen(watch())),
            );
            if (!mentionedFeed || !bystanderFeed) return yield* Effect.die("Expected two feeds");
            for (const next of [mentionedFeed, bystanderFeed]) yield* next;
            yield* as(
              owner,
              Effect.flatMap(ThreadService.Service, (threadService) =>
                threadService.startInGroup({
                  groupId: group.id,
                  mentions: [mentioned.memberId],
                  text: "Can you look?",
                }),
              ),
            );
            const started = committed(yield* mentionedFeed);
            const inbox = yield* as(
              mentioned,
              Effect.flatMap(NotificationService.Service, (notificationService) =>
                notificationService.list({ limit: 10 }),
              ),
            );
            expect(inbox).toHaveLength(1);
            expect(started.notifications).toEqual(inbox);
            // The bystander sees the conversation, but nothing addressed to someone else.
            const seen = committed(yield* bystanderFeed);
            expect(seen.cursor).toBe(started.cursor);
            expect(seen.events.map((e) => e.name)).toContain(ThreadMessageFacts.Published.name);
            expect(seen.notifications).toEqual([]);
          }),
        ),
      ),
    );
  });
};
