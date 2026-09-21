import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { Group } from "../group/group.ts";
import { GroupAudience } from "../group/audience.ts";
import { GroupMembership } from "../group/membership/membership.ts";
import { GroupMembershipStore } from "../group/membership/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Thread } from "./thread.ts";
import { ThreadCreation } from "./creation.ts";
import { ThreadPermissions } from "./permissions.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadMessageFacts } from "./message/facts.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationFacts } from "./participation/facts.ts";
import { ThreadActivity } from "./activity/activity.ts";
import { ThreadActivityFacts } from "./activity/facts.ts";
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ThreadApplication.GroupNotFound",
  { groupId: Group.Id },
) {}
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadApplication.ParticipantUnavailable",
  { memberId: Member.Id },
) {}
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadApplication.HumanAuthorRequired",
  { memberId: Member.Id },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadApplication.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | ThreadCreation.Error
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  readonly startInGroup: (
    input: Thread.StartInGroupInput,
  ) => Effect.Effect<Thread.Started, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/application/Service",
) {}
/** Capture bound services; authorize the complete requested conversation inside its commit. @category constructors */
export const make = Effect.fn("ThreadApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const audience = yield* GroupAudience.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const members = yield* MemberStore.Service;
  const creation = yield* ThreadCreation.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [audience.workspaceId, memberships.workspaceId, members.workspaceId, creation.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Thread services belong to different workspaces",
    });
  const startInGroup = Effect.fn("ThreadApplication.startInGroup")(
    function* (input: Thread.StartInGroupInput) {
      const request = yield* Schema.decodeEffect(Thread.StartInGroupInput)(input);
      const authorAdmission = yield* audience
        .require(request.groupId)
        .pipe(
          Effect.catchTag("GroupAudience.NotMember", () =>
            Effect.fail(new GroupNotFound({ groupId: request.groupId })),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: request.groupId,
        }),
      ]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const eligible = new Map<
        Member.Id,
        { admission: GroupMembership.Record; member: Member.Record }
      >();
      const seen = new Set<GroupMembership.Id>();
      for (const found of yield* memberships.listByGroup(request.groupId)) {
        const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(found);
        if (
          admission.workspaceId !== workspaceId ||
          admission.groupId !== request.groupId ||
          seen.has(admission.id)
        )
          return yield* new InvalidResponse({ message: "Group admissions are inconsistent" });
        seen.add(admission.id);
        if (admission.status !== "active") continue;
        if (eligible.has(admission.memberId))
          return yield* new InvalidResponse({ message: "Duplicate active group admission" });
        const foundMember = yield* members.get(admission.memberId);
        if (Option.isNone(foundMember))
          return yield* new InvalidResponse({ message: "Group admission has no workspace member" });
        const member = yield* Schema.decodeEffect(Member.Record)(foundMember.value);
        if (member.id !== admission.memberId || member.workspaceId !== workspaceId)
          return yield* new InvalidResponse({
            message: "Group member belongs to another membership or workspace",
          });
        if (member.status === "active") eligible.set(member.id, { admission, member });
      }
      if (eligible.get(actor.memberId)?.admission.id !== authorAdmission.id)
        return yield* new InvalidResponse({
          message: "Group listing omitted the author's current admission",
        });
      const selected =
        request.mentions.length === 0
          ? [...eligible.keys()].sort()
          : [actor.memberId, ...request.mentions.filter((id) => id !== actor.memberId)];
      for (const memberId of selected) {
        const member = eligible.get(memberId)?.member;
        if (member === undefined) return yield* new ParticipantUnavailable({ memberId });
        if (member.identity._tag === "Agent")
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
          ]);
      }
      const occurredAt = yield* DateTime.now;
      const created = yield* creation.create({
        groupId: request.groupId,
        createdBy: actor.memberId,
        createdAt: occurredAt,
      });
      const thread = created.payload;
      const participants: Array<ThreadParticipation.Record> = [];
      for (const memberId of selected) {
        const entry = eligible.get(memberId);
        if (entry === undefined)
          return yield* new InvalidResponse({ message: "Selected participant disappeared" });
        const participant = {
          id: ThreadParticipation.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          threadId: thread.id,
          memberId,
          groupMembershipId: entry.admission.id,
          identity: entry.member.identity,
          joinedAt: occurredAt,
          joinedAtSequence: 1,
          status: "active",
          endedAt: null,
        } satisfies ThreadParticipation.Record;
        yield* journal
          .publish(ThreadParticipationFacts.Added, participant)
          .pipe(Publication.withCause(created, occurredAt));
        participants.push(participant);
      }
      const message = {
        id: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        authorMemberId: actor.memberId,
        kind: "User",
        text: request.text,
        mentions: request.mentions,
        publishedAt: occurredAt,
      } satisfies ThreadMessage.Record;
      const published = yield* journal
        .publish(ThreadMessageFacts.Published, message)
        .pipe(Publication.withCause(created, occurredAt));
      const activity = {
        id: ThreadActivity.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        sequence: 1,
        kind: "MessagePublished",
        messageId: message.id,
        occurredAt,
      } satisfies ThreadActivity.Record;
      const recipients = participants
        .filter(
          (participant) =>
            request.mentions.length === 0 || request.mentions.includes(participant.memberId),
        )
        .map((participant) => ({
          participationId: participant.id,
          identity: participant.identity,
        }));
      yield* journal
        .publish(ThreadActivityFacts.Recorded, { activity, recipients })
        .pipe(Publication.withCause(published, occurredAt));
      return { thread, message, activity } satisfies Thread.Started;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  return Service.of({ workspaceId, startInGroup });
});
/** Provide human opening-message workflows; agent execution and further publication are separate workflows. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadApplication from "./application.ts";
