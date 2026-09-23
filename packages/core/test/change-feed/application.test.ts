import { Notification, NotificationFacts } from "@amends/core/notification";
import {
  Thread,
  ThreadFacts,
  ThreadMessage,
  ThreadMessageFacts,
  ThreadParticipation,
  ThreadParticipationFacts,
  ThreadActivity,
  ThreadActivityFacts,
} from "@amends/core/thread";
import { Subject } from "@amends/core/journal";
import { Group, GroupFacts, GroupMembership, GroupMembershipFacts } from "@amends/core/group";
import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, it } from "@effect/vitest";
import { Array, DateTime, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { Authorization } from "../../src/authorization/authorization.ts";
import { AssignmentStore } from "../../src/authorization/assignment/store.ts";
import { GrantResolver } from "../../src/authorization/grant-resolver.ts";
import { PermissionCatalog } from "../../src/authorization/permission-catalog.ts";
import { RoleStore } from "../../src/authorization/role/store.ts";
import { ChangeFeedApplication } from "../../src/change-feed/application.ts";
import { ChangeFeed } from "../../src/change-feed/change-feed.ts";
import { Actor } from "../../src/identity/actor.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { Invitation } from "../../src/workspace/invitation/invitation.ts";
import { InvitationFacts } from "../../src/workspace/invitation/facts.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberFacts } from "../../src/workspace/member/facts.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { Role } from "../../src/authorization/role/role.ts";
import { make, type Fixture } from "../memory-store.ts";

const testSubject = () => Subject.make("test", "entity");
const workspaceId = Workspace.Id.make("workspace");
const actor = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("alice-member"),
  identity: {
    _tag: "Human",
    id: Identity.HumanId.make("alice"),
  },
});
const invitation: Invitation.Issuance = {
  id: Invitation.Id.make("invitation"),
  workspaceId,
  inviterMemberId: actor.memberId,
  recipientId: Identity.HumanId.make("bob"),
  roleId: Role.Id.make("viewer"),
  issuedAt: DateTime.makeUnsafe("2026-09-20T12:00:00.123Z"),
  expiresAt: DateTime.makeUnsafe("2026-09-21T12:00:00.456Z"),
};
type Services =
  | ChangeFeedApplication.Service
  | Journal.Service
  | CommittedEvents.Service
  | Actor.Service
  | Scope.Scope;
const run = <A, E>(use: (fixture: Fixture) => Effect.Effect<A, E, Services>, capacity = 256) =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* fixture.store.transaction(
      fixture.members(workspaceId).insert({
        id: actor.memberId,
        workspaceId,
        identity: actor.identity,
        status: "active",
      }),
    );
    const host = Layer.mergeAll(
      Layer.succeed(Store.Service, fixture.store),
      Layer.succeed(Checkpoint.Service, fixture.checkpoints),
      Layer.succeed(MemberStore.Service, fixture.members(workspaceId)),
      Layer.succeed(RoleStore.Service, fixture.roles(workspaceId)),
      Layer.succeed(AssignmentStore.Service, fixture.assignments(workspaceId)),
      PermissionCatalog.layer([]),
      CommittedEvents.layer(workspaceId, { capacity }),
    );
    const services = Layer.mergeAll(
      Journal.layer({ logId: Log.Id.make("journal"), projections: [] }).pipe(
        Layer.provide(Log.layer),
      ),
      Authorization.layer.pipe(Layer.provide(GrantResolver.layer)),
    ).pipe(Layer.provideMerge(host));
    const configured = ChangeFeedApplication.layer.pipe(Layer.provideMerge(services));
    return yield* use(fixture).pipe(
      Effect.provide(configured),
      Effect.provideService(Actor.Service, actor),
    );
  }).pipe(Effect.scoped);
it.effect(
  "registers before Ready, skips history and preserves committed batches with encoded payloads",
  () =>
    run(() =>
      Effect.gen(function* () {
        const journal = yield* Journal.Service;
        const changes = yield* ChangeFeedApplication.Service;
        yield* journal
          .publish(MemberFacts.Added, {
            workspaceId,
            memberId: Member.Id.make("historical-member"),
            identity: actor.identity,
          })
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        const stream = yield* changes.watch;
        // Publish before even pulling Ready: a successful subscription must retain this commit.
        const events = yield* journal.commit(
          Effect.gen(function* () {
            const first = yield* journal
              .publish(MemberFacts.Added, {
                workspaceId,
                memberId: actor.memberId,
                identity: actor.identity,
              })
              .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
            const second = yield* journal
              .publish(InvitationFacts.Issued, invitation)
              .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
            return [first, second] as const;
          }),
        );
        const messages = yield* stream.pipe(Stream.take(2), Stream.runCollect);
        expect(messages).toEqual([
          { _tag: "Ready", workspaceId },
          {
            _tag: "Committed",
            workspaceId,
            commitId: events[0].commitId,
            events: Array.map(events, (event) => ({
              id: event.id,
              name: event.name,
              version: event.version,
              recordedAt: event.recordedAt,
              provenance: event.provenance,
              payload:
                event.name === MemberFacts.Added.name
                  ? event.payload
                  : Schema.encodeSync(Invitation.Issuance)(invitation),
            })),
          },
        ]);
        expect(DateTime.isDateTime(events[1].payload.expiresAt)).toBe(true);
        const committed = messages[1];
        if (committed === undefined) return yield* Effect.die("Missing committed message");
        const encoded = yield* Schema.encodeEffect(ChangeFeed.Message)(committed);
        expect(yield* Schema.decodeEffect(ChangeFeed.Message)(encoded)).toEqual(committed);
        expect(
          (yield* journal.log.read({ limit: 10 })).flatMap((batch) => batch.entries),
        ).toHaveLength(3);
      }),
    ),
);

it.effect("checks current membership and opens a stream without a transaction", () =>
  run((fixture) =>
    Effect.gen(function* () {
      const changes = yield* ChangeFeedApplication.Service;
      const attempts = yield* fixture.attempts;
      expect(yield* (yield* changes.watch).pipe(Stream.take(1), Stream.runCollect)).toEqual([
        { _tag: "Ready", workspaceId },
      ]);
      expect(yield* (yield* Journal.Service).log.read({ limit: 10 })).toEqual([]);
      expect(yield* fixture.attempts).toBe(attempts);
      yield* fixture.store.transaction(fixture.members(workspaceId).markRemoved(actor.memberId));
      expect(yield* Effect.flip(changes.watch)).toMatchObject({
        _tag: "Authorization.InvalidActor",
      });
    }),
  ),
);

it.effect("lag fails the stream so a reconnect must establish a fresh Ready boundary", () =>
  run(
    () =>
      Effect.gen(function* () {
        const changes = yield* ChangeFeedApplication.Service;
        const journal = yield* Journal.Service;
        const stream = yield* changes.watch;
        for (let index = 0; index < 3; index++)
          yield* journal
            .publish(MemberFacts.Added, {
              workspaceId,
              memberId: Member.Id.make(`member-${index}`),
              identity: actor.identity,
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        expect(yield* stream.pipe(Stream.runDrain, Effect.flip)).toEqual(
          new ChangeFeed.Unavailable({}),
        );
        const fresh = yield* changes.watch;
        yield* journal
          .publish(InvitationFacts.Issued, invitation)
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        expect(
          (yield* fresh.pipe(Stream.take(2), Stream.runCollect)).map((message) => message._tag),
        ).toEqual(["Ready", "Committed"]);
      }),
    1,
  ),
);

it.effect("unknown fact versions fail normalization instead of emitting an incomplete batch", () =>
  run(() =>
    Effect.gen(function* () {
      const stream = yield* (yield* ChangeFeedApplication.Service).watch;
      const future = Fact.make(MemberFacts.Added.name, {
        subject: testSubject,
        version: 2,
        payload: Schema.Struct({}),
      });
      yield* (yield* Journal.Service)
        .publish(future, {})
        .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
      expect(yield* stream.pipe(Stream.runDrain, Effect.flip)).toEqual(
        new ChangeFeed.Unavailable({}),
      );
    }),
  ),
);

it.effect("private group commits are withheld and mixed commits retain only public events", () =>
  run(() =>
    Effect.gen(function* () {
      const stream = yield* (yield* ChangeFeedApplication.Service).watch;
      const journal = yield* Journal.Service;
      const group = {
        id: Group.Id.make("private-group"),
        workspaceId,
        kind: "Team" as const,
        visibility: "Private" as const,
        name: "Private name",
        createdBy: actor.memberId,
        createdAt: invitation.issuedAt,
      };
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(GroupFacts.Created, group);
          yield* journal.publish(GroupMembershipFacts.Added, {
            id: GroupMembership.Id.make("private-membership"),
            workspaceId,
            groupId: group.id,
            memberId: actor.memberId,
            status: "active",
            admittedAt: group.createdAt,
          });
          const threadId = Thread.Id.make("private-thread");
          const messageId = ThreadMessage.Id.make("private-message");
          const participationId = ThreadParticipation.Id.make("private-participation");
          yield* journal.publish(ThreadFacts.Created, {
            id: threadId,
            workspaceId,
            groupId: group.id,
            createdBy: actor.memberId,
            createdAt: group.createdAt,
          });
          yield* journal.publish(ThreadParticipationFacts.Added, {
            id: participationId,
            workspaceId,
            threadId,
            participant: {
              _tag: "Member",
              memberId: actor.memberId,
              groupMembershipId: GroupMembership.Id.make("private-membership"),
              identity: actor.identity,
            },
            joinedAt: group.createdAt,
            joinedAtSequence: 1,
            status: "active",
            endedAt: null,
          });
          yield* journal.publish(ThreadParticipationFacts.Ended, {
            reason: "unfollowed",
            workspaceId,
            threadId,
            participationId,
          });
          yield* journal.publish(ThreadActivityFacts.Recorded, {
            recipients: [],
            activity: {
              id: ThreadActivity.Id.make("private-follow"),
              workspaceId,
              threadId,
              participationId,
              sequence: 2,
              kind: "ParticipationFollowed",
              occurredAt: group.createdAt,
            },
          });
          yield* journal.publish(NotificationFacts.Acknowledged, {
            workspaceId,
            notificationId: Notification.Id.make("private-notification"),
            recipient: actor.identity,
            acknowledgment: { outcome: { _tag: "Seen" }, acknowledgedAt: group.createdAt },
          });
          yield* journal.publish(ThreadMessageFacts.Published, {
            id: messageId,
            workspaceId,
            threadId,
            author: { _tag: "Member", memberId: actor.memberId },
            kind: "User",
            text: "Private proposal",
            mentions: [],
            publishedAt: group.createdAt,
          });
          yield* journal.publish(ThreadActivityFacts.Recorded, {
            activity: {
              id: ThreadActivity.Id.make("private-activity"),
              workspaceId,
              threadId,
              sequence: 1,
              kind: "MessagePublished",
              messageId,
              occurredAt: group.createdAt,
            },
            recipients: [{ participationId, recipient: actor.identity }],
          });
          yield* journal.publish(GroupMembershipFacts.Removed, {
            workspaceId,
            groupId: group.id,
            membershipId: GroupMembership.Id.make("private-membership"),
            memberId: actor.memberId,
            reason: "left",
          });
        }).pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId))),
      );
      const publicEvent = yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(GroupFacts.Created, {
            ...group,
            id: Group.Id.make("another-private-group"),
          });
          yield* journal.publish(GroupMembershipFacts.Removed, {
            workspaceId,
            groupId: Group.Id.make("another-private-group"),
            membershipId: GroupMembership.Id.make("another-private-membership"),
            memberId: actor.memberId,
            reason: "workspace-removed",
          });
          return yield* journal.publish(InvitationFacts.Issued, invitation);
        }).pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId))),
      );
      const messages = yield* stream.pipe(Stream.take(2), Stream.runCollect);
      expect(messages[0]).toEqual({ _tag: "Ready", workspaceId });
      const committed = messages[1];
      if (committed?._tag !== "Committed") return yield* Effect.die("Missing public change");
      expect(committed.commitId).toBe(publicEvent.commitId);
      expect(committed.events.map(({ name }) => name)).toEqual([InvitationFacts.Issued.name]);
      expect(JSON.stringify(messages)).not.toContain("private-group");
      expect(JSON.stringify(messages)).not.toContain("Private name");
      expect(JSON.stringify(messages)).not.toContain("private-thread");
      expect(JSON.stringify(messages)).not.toContain("Private proposal");
      expect(JSON.stringify(messages)).not.toContain("private-notification");
    }),
  ),
);

it.effect(
  "closing the caller scope interrupts pending reads without closing another subscription",
  () =>
    run(() =>
      Effect.gen(function* () {
        const changes = yield* ChangeFeedApplication.Service;
        const scope = yield* Scope.fork(yield* Scope.Scope);
        const stream = yield* changes.watch.pipe(Scope.provide(scope));
        const other = yield* changes.watch;
        const pending = yield* stream.pipe(
          Stream.runDrain,
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Scope.close(scope, Exit.void);
        expect(Exit.hasInterrupts(yield* Fiber.await(pending))).toBe(true);
        yield* (yield* Journal.Service)
          .publish(InvitationFacts.Issued, invitation)
          .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
        expect(yield* other.pipe(Stream.take(2), Stream.runCollect)).toHaveLength(2);
      }),
    ),
);
