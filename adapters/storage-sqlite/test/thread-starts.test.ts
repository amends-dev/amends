import { expect, it } from "@effect/vitest";
import { Assignment, AssignmentFacts, BuiltinRoles } from "@amends/core/authorization";
import { Group, GroupApplication, GroupStore, GroupMembershipStore } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Journal, Log, Publication } from "@amends/core/journal";
import { Notification, NotificationStore } from "@amends/core/notification";
import {
  Thread,
  ThreadActivityRecording,
  ThreadApplication,
  ThreadCreation,
  ThreadMessageApplication,
  ThreadMessagePublication,
  ThreadParticipation,
  ThreadParticipationAdmission,
  ThreadStart,
  ThreadStore,
  ThreadParticipationStore,
  ThreadMessageStore,
  ThreadActivityStore,
} from "@amends/core/thread";
import { Member, MemberFacts, MemberStore } from "@amends/core/workspace";
import { DateTime, Effect, Layer, Option, Context } from "effect";
import {
  temporary as withDatabase,
  boundTo,
  initialized,
  inDatabase,
  core,
  type Bound,
  workspaceId,
  testProvenance,
} from "./support.ts";

const humanId = Member.Id.make("human");
const otherId = Member.Id.make("other");
const contactId = Identity.ContactId.make("customer");
const run = <A, E, R>(bound: Bound, actor: Actor.Value, program: Effect.Effect<A, E, R>) =>
  program.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(core(bound)));
/** The internal start that channel and task workflows will call, built over core's services. */
const internal = ThreadStart.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      ThreadCreation.layer,
      ThreadMessagePublication.layer.pipe(
        Layer.provide(
          Layer.mergeAll(ThreadParticipationAdmission.layer, ThreadActivityRecording.layer),
        ),
      ),
    ),
  ),
);
const trusted = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
    Effect.provide(internal.pipe(Layer.provideMerge(core(bound)))),
  );
const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 200 });
const startDirect = (
  memberIds: ReadonlyArray<Member.Id>,
  mentions: ReadonlyArray<Member.Id> = [],
) =>
  Effect.flatMap(ThreadApplication.Service, (s) =>
    s.startDirect({ memberIds, text: "Hello", mentions }),
  );
const participantsOf = (bound: Bound, threadId: Thread.Id) =>
  Effect.map(bound.participations.listByThread(threadId), (records) =>
    records.map((record) => ThreadParticipation.referenceOf(record.participant)),
  );
const inbox = (bound: Bound, recipient: Notification.Recipient) =>
  bound.notifications.listByRecipient(recipient, { limit: 100 });
const prepare = Effect.fnUntraced(function* () {
  const bound = yield* boundTo(workspaceId);
  const workspace = yield* initialized(bound);
  const owner = Actor.Value.make({
    workspaceId,
    memberId: workspace.ownerMemberId,
    identity: { _tag: "Human", id: workspace.createdBy },
  });
  yield* trusted(
    bound,
    Effect.flatMap(Journal.Service, (journal) =>
      journal.commit(
        // Members join with the Viewer role, as invitation acceptance grants it.
        Effect.forEach([humanId, otherId], (memberId) =>
          Effect.andThen(
            journal.publish(MemberFacts.Added, {
              workspaceId,
              memberId,
              identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
            }),
            journal.publish(AssignmentFacts.Created, {
              workspaceId,
              assignmentId: Assignment.Id.make(`viewer-${memberId}`),
              memberId,
              source: {
                _tag: "Role",
                roleId: BuiltinRoles.ViewerId,
                scope: { _tag: "Workspace", workspaceId },
              },
            }),
          ),
        ),
      ),
    ),
  );
  return { bound, owner };
});

/** Wrap a store so every read method call is counted under `name.method`; writes pass through. */
const countReads = <S extends object>(name: string, store: S, counts: Map<string, number>): S =>
  Object.fromEntries(
    Object.entries(store).map(([method, value]) => [
      method,
      typeof value === "function" && /^(get|list|find|latest|read)/.test(method)
        ? (...args: ReadonlyArray<unknown>) => {
            const key = `${name}.${method}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            return value(...args);
          }
        : value,
    ]),
  ) as S;
/** The binding with its record stores counted, and a way to take and reset the counts. */
const countingReads = (bound: Bound) => {
  const counts = new Map<string, number>();
  const context = Context.mergeAll(
    bound.context,
    Context.make(MemberStore.Service, countReads("members", bound.members, counts)),
    Context.make(GroupStore.Service, countReads("groups", bound.groups, counts)),
    Context.make(
      GroupMembershipStore.Service,
      countReads("groupMemberships", bound.groupMemberships, counts),
    ),
    Context.make(ThreadStore.Service, countReads("threads", bound.threads, counts)),
    Context.make(
      ThreadParticipationStore.Service,
      countReads("participations", bound.participations, counts),
    ),
    Context.make(ThreadMessageStore.Service, countReads("messages", bound.messages, counts)),
    Context.make(ThreadActivityStore.Service, countReads("activities", bound.activities, counts)),
    Context.make(
      NotificationStore.Service,
      countReads("notifications", bound.notifications, counts),
    ),
  );
  const take = () => {
    const taken = Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : 1)));
    counts.clear();
    return taken;
  };
  return { bound: { ...bound, context }, take };
};

it.effect("starting a direct group reuses it for the same members and enrolls all of them", () =>
  withDatabase((location) =>
    inDatabase(
      location,
      Effect.gen(function* () {
        const { bound, owner } = yield* prepare();
        const first = yield* run(bound, owner, startDirect([humanId]));
        const group = Option.getOrThrow(yield* bound.groups.get(first.thread.groupId));
        expect(group).toMatchObject({
          kind: "Direct",
          memberIds: Group.directMembers([owner.memberId, humanId]),
          createdBy: owner.memberId,
        });
        expect(first.thread.createdBy).toEqual({ _tag: "Member", memberId: owner.memberId });
        expect(yield* participantsOf(bound, first.thread.id)).toEqual(
          expect.arrayContaining([
            { _tag: "Member", memberId: owner.memberId },
            { _tag: "Member", memberId: humanId },
          ]),
        );
        // The same members, in any order and including the author, reuse the group.
        const human = Actor.Value.make({
          workspaceId,
          memberId: humanId,
          identity: { _tag: "Human", id: Identity.HumanId.make(humanId) },
        });
        const again = yield* run(bound, human, startDirect([owner.memberId, humanId]));
        expect(again.thread.groupId).toBe(group.id);
        expect(again.thread.id).not.toBe(first.thread.id);
        const trio = yield* run(bound, owner, startDirect([otherId, humanId]));
        expect(trio.thread.groupId).not.toBe(group.id);
        // A thread in a direct group enrolls all members; mentions only narrow notification.
        const humanInbox = (yield* inbox(bound, human.identity)).length;
        const ownerInbox = (yield* inbox(bound, owner.identity)).length;
        const mentioned = yield* run(
          bound,
          owner,
          Effect.flatMap(ThreadApplication.Service, (s) =>
            s.startInGroup({ groupId: trio.thread.groupId, text: "Just Bob", mentions: [humanId] }),
          ),
        );
        expect(yield* participantsOf(bound, mentioned.thread.id)).toHaveLength(3);
        expect(yield* inbox(bound, human.identity)).toHaveLength(humanInbox + 1);
        expect(yield* inbox(bound, owner.identity)).toHaveLength(ownerInbox);
        // Direct groups need another member, and every member must be available.
        const before = yield* history(bound);
        expect(yield* Effect.flip(run(bound, owner, startDirect([owner.memberId])))).toMatchObject({
          _tag: "ThreadApplication.DirectMembersRequired",
        });
        expect(
          yield* Effect.flip(run(bound, owner, startDirect([Member.Id.make("missing")]))),
        ).toMatchObject({
          _tag: "ThreadApplication.ParticipantUnavailable",
          memberId: "missing",
        });
        expect(
          yield* Effect.flip(run(bound, owner, startDirect([humanId], [otherId]))),
        ).toMatchObject({ _tag: "ThreadApplication.ParticipantUnavailable", memberId: otherId });
        expect(yield* history(bound)).toEqual(before);
      }),
    ),
  ),
);

it.effect(
  "the shared start opens a contact's conversation with contact and triage participants only",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const team = yield* run(
            bound,
            owner,
            Effect.flatMap(GroupApplication.Service, (s) =>
              s.createPrivateTeam({ name: "Support", memberIds: [owner.memberId, humanId] }),
            ),
          );
          const contact: Notification.Recipient = { _tag: "Contact", id: contactId };
          const started = yield* trusted(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                Effect.flatMap(ThreadStart.Service, (starts) =>
                  Effect.flatMap(DateTime.now, (occurredAt) =>
                    starts.start({
                      groupId: team.id,
                      participants: [{ _tag: "Contact", contactId }, { _tag: "Triage" }],
                      first: {
                        _tag: "Message",
                        author: { _tag: "Contact", contactId },
                        text: "My order is late",
                        mentions: [],
                      },
                      occurredAt,
                    }),
                  ),
                ),
              ),
            ),
          );
          expect(started.thread.createdBy).toEqual({ _tag: "Contact", contactId });
          expect(started.message.author).toEqual({ _tag: "Contact", contactId });
          expect(yield* participantsOf(bound, started.thread.id)).toEqual(
            expect.arrayContaining([{ _tag: "Contact", contactId }, { _tag: "Triage" }]),
          );
          expect(yield* participantsOf(bound, started.thread.id)).toHaveLength(2);
          for (const recipient of [contact, { _tag: "Triage" } as const])
            expect(yield* inbox(bound, recipient)).toHaveLength(1);
          expect(yield* inbox(bound, owner.identity)).toEqual([]);
          // A member reply without mentions reaches every participant, including the contact.
          yield* run(
            bound,
            owner,
            Effect.flatMap(ThreadMessageApplication.Service, (s) =>
              s.publish({ threadId: started.thread.id, text: "Looking into it", mentions: [] }),
            ),
          );
          for (const recipient of [contact, { _tag: "Triage" } as const, owner.identity])
            expect(yield* inbox(bound, recipient)).toHaveLength(recipient._tag === "Human" ? 1 : 2);
          // Mentions narrow a reply to the mentioned members.
          yield* run(
            bound,
            owner,
            Effect.flatMap(ThreadMessageApplication.Service, (s) =>
              s.publish({ threadId: started.thread.id, text: "Bob?", mentions: [humanId] }),
            ),
          );
          expect(yield* inbox(bound, contact)).toHaveLength(2);
          expect(
            yield* inbox(bound, { _tag: "Human", id: Identity.HumanId.make(humanId) }),
          ).toHaveLength(1);
        }),
      ),
    ),
);

it.effect(
  "group creation, starts, replies, and timelines read storage the same way at any size",
  () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare();
          const extra = Array.from({ length: 10 }, (_, index) => Member.Id.make(`member-${index}`));
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                Effect.forEach(extra, (memberId) =>
                  journal.publish(MemberFacts.Added, {
                    workspaceId,
                    memberId,
                    identity: { _tag: "Human", id: Identity.HumanId.make(memberId) },
                  }),
                ),
              ),
            ),
          );
          const counted = countingReads(bound);
          const measure = Effect.fnUntraced(function* (size: number) {
            counted.take();
            const team = yield* run(
              counted.bound,
              owner,
              Effect.flatMap(GroupApplication.Service, (s) =>
                s.createPrivateTeam({
                  name: `Team ${size}`,
                  memberIds: [owner.memberId, ...extra.slice(0, size)],
                }),
              ),
            );
            const create = counted.take();
            const started = yield* run(
              counted.bound,
              owner,
              Effect.flatMap(ThreadApplication.Service, (s) =>
                s.startInGroup({ groupId: team.id, text: "Hello", mentions: [] }),
              ),
            );
            const start = counted.take();
            const reply = Effect.flatMap(ThreadMessageApplication.Service, (s) =>
              s.publish({ threadId: started.thread.id, text: "Reply", mentions: [] }),
            );
            yield* run(counted.bound, owner, reply);
            const replied = counted.take();
            // A longer timeline for the larger group: its page must not read per item either.
            for (let index = 0; index < size; index++) yield* run(bound, owner, reply);
            counted.take();
            const page = yield* run(
              counted.bound,
              owner,
              Effect.flatMap(ThreadApplication.Service, (s) =>
                s.readTimeline(started.thread.id, { limit: 50 }),
              ),
            );
            expect(page).toHaveLength(size + 2);
            return { create, start, replied, timeline: counted.take() };
          });
          const small = yield* measure(1);
          const large = yield* measure(10);
          expect(large).toEqual(small);
          expect(small.replied).toMatchObject({ "members.getMany": expect.any(Number) });
        }),
      ),
    ),
);
