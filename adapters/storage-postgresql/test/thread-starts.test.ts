import { describe, expect, it } from "@effect/vitest";
import { Assignment, AssignmentFacts, BuiltinRoles } from "@amends/core/authorization";
import { Group, GroupApplication } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Journal, Log, Publication } from "@amends/core/journal";
import { Notification } from "@amends/core/notification";
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
} from "@amends/core/thread";
import { Member, MemberFacts } from "@amends/core/workspace";
import { DateTime, Effect, Layer, Option } from "effect";
import {
  setup,
  boundTo,
  initialized,
  inDatabase,
  core,
  type Bound,
  workspaceId,
  testProvenance,
} from "./support.ts";

const { available, withDatabase } = setup();

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

describe.skipIf(!available)("PostgreSQL thread starts", () => {
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
              s.startInGroup({
                groupId: trio.thread.groupId,
                text: "Just Bob",
                mentions: [humanId],
              }),
            ),
          );
          expect(yield* participantsOf(bound, mentioned.thread.id)).toHaveLength(3);
          expect(yield* inbox(bound, human.identity)).toHaveLength(humanInbox + 1);
          expect(yield* inbox(bound, owner.identity)).toHaveLength(ownerInbox);
          // Direct groups need another member, and every member must be available.
          const before = yield* history(bound);
          expect(
            yield* Effect.flip(run(bound, owner, startDirect([owner.memberId]))),
          ).toMatchObject({
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
              expect(yield* inbox(bound, recipient)).toHaveLength(
                recipient._tag === "Human" ? 1 : 2,
              );
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
});
