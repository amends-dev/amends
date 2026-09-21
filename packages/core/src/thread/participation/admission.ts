import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { DateTime, PlatformError } from "effect";
import { Group } from "../../group/group.ts";
import { GroupMembership } from "../../group/membership/membership.ts";
import { GroupMembershipStore } from "../../group/membership/store.ts";
import { Member } from "../../workspace/member/member.ts";
import { MemberStore } from "../../workspace/member/store.ts";
import { Identity } from "../../identity/identity.ts";
import { Journal } from "../../journal/journal.ts";
import { Store } from "../../journal/store.ts";
import type { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Thread } from "../thread.ts";
import { ThreadParticipation } from "./participation.ts";
import { ThreadParticipationStore } from "./store.ts";
import { ThreadParticipationFacts } from "./facts.ts";

export class Unavailable extends Schema.TaggedError<Unavailable>()(
  "ThreadParticipationAdmission.Unavailable",
  {
    memberId: Member.Id,
  },
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadParticipationAdmission.InvalidResponse",
  {
    message: Schema.String,
  },
) {}
export interface Eligible {
  readonly admission: GroupMembership.Record;
  readonly member: Member.Record;
}
export type ReadError =
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadParticipationStore.Failure
  | InvalidResponse;
export type Error =
  | ReadError
  | Unavailable
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  readonly eligible: (
    groupId: Group.Id,
  ) => Effect.Effect<ReadonlyMap<Member.Id, Eligible>, ReadError | Schema.SchemaError>;
  readonly current: (
    thread: Thread.Record,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, ReadError>;
  /** Required admission steps of an authorized workflow. Never opens or captures a transaction. */
  readonly ensure: (
    thread: Thread.Record,
    memberIds: ReadonlyArray<Member.Id>,
    sequence: number,
    occurredAt: DateTime.Utc,
  ) => Effect.Effect<
    ReadonlyArray<ThreadParticipation.Record>,
    Error,
    Store.Transaction | Publication.Service
  >;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/participation/admission/Service",
) {}
const sameIdentity = Schema.toEquivalence(Identity.MemberReference);
const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Invalid participation reference: ${cause.message}` });
export const make = Effect.fn("ThreadParticipationAdmission.make")(function* () {
  const memberships = yield* GroupMembershipStore.Service;
  const members = yield* MemberStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = memberships.workspaceId;
  if (members.workspaceId !== workspaceId || participations.workspaceId !== workspaceId)
    return yield* new InvalidResponse({
      message: "Participation services belong to different workspaces",
    });
  const eligible = Effect.fn("ThreadParticipationAdmission.eligible")(function* (
    groupId: Group.Id,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    const result = new Map<Member.Id, Eligible>();
    const seen = new Set<GroupMembership.Id>();
    const active = new Set<Member.Id>();
    for (const row of yield* memberships.listByGroup(id)) {
      const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (
        admission.workspaceId !== workspaceId ||
        admission.groupId !== id ||
        seen.has(admission.id)
      )
        return yield* new InvalidResponse({ message: "Group admissions are inconsistent" });
      seen.add(admission.id);
      if (admission.status !== "active") continue;
      if (active.has(admission.memberId))
        return yield* new InvalidResponse({ message: "Duplicate active group admission" });
      active.add(admission.memberId);
      const found = yield* members.get(admission.memberId);
      if (Option.isNone(found))
        return yield* new InvalidResponse({ message: "Group admission has no workspace member" });
      const member = yield* Schema.decodeEffect(Member.Record)(found.value).pipe(
        Effect.mapError(invalidRecord),
      );
      if (member.id !== admission.memberId || member.workspaceId !== workspaceId)
        return yield* new InvalidResponse({
          message: "Group admission references another member or workspace",
        });
      if (member.status === "active") result.set(member.id, { admission, member });
    }
    return result;
  });
  const current = Effect.fn("ThreadParticipationAdmission.current")(function* (
    input: Thread.Record,
  ) {
    const thread = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(input).pipe(
      Effect.mapError(invalidRecord),
    );
    if (thread.workspaceId !== workspaceId)
      return yield* new InvalidResponse({ message: "Thread belongs to another workspace" });
    const result: Array<ThreadParticipation.Record> = [];
    const seen = new Set<ThreadParticipation.Id>();
    const seenMembers = new Set<Member.Id>();
    for (const row of yield* participations.listByThread(thread.id)) {
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        row,
      ).pipe(Effect.mapError(invalidRecord));
      if (
        participant.workspaceId !== workspaceId ||
        participant.threadId !== thread.id ||
        seen.has(participant.id)
      )
        return yield* new InvalidResponse({
          message: "Participation store returned an inconsistent thread listing",
        });
      seen.add(participant.id);
      if (participant.status !== "active") continue;
      if (seenMembers.has(participant.memberId))
        return yield* new InvalidResponse({ message: "Duplicate active thread participant" });
      seenMembers.add(participant.memberId);
      const foundAdmission = yield* memberships.get(participant.groupMembershipId);
      const foundMember = yield* members.get(participant.memberId);
      if (Option.isNone(foundAdmission) || Option.isNone(foundMember))
        return yield* new InvalidResponse({
          message: "Participation references a missing admission or workspace member",
        });
      const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(
        foundAdmission.value,
      ).pipe(Effect.mapError(invalidRecord));
      const member = yield* Schema.decodeEffect(Member.Record)(foundMember.value).pipe(
        Effect.mapError(invalidRecord),
      );
      if (
        admission.id !== participant.groupMembershipId ||
        admission.workspaceId !== workspaceId ||
        admission.groupId !== thread.groupId ||
        admission.memberId !== participant.memberId ||
        member.workspaceId !== workspaceId ||
        member.id !== participant.memberId ||
        !sameIdentity(member.identity, participant.identity)
      )
        return yield* new InvalidResponse({
          message: "Participation references another admission, group, member, or workspace",
        });
      if (admission.status === "active" && member.status === "active") result.push(participant);
    }
    return result;
  });
  const ensure = Effect.fn("ThreadParticipationAdmission.ensure")(function* (
    thread: Thread.Record,
    memberIds: ReadonlyArray<Member.Id>,
    sequence: number,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const ids = yield* Schema.decodeEffect(Schema.UniqueArray(Member.Id))(memberIds);
    const candidates = yield* eligible(thread.groupId);
    const existing = new Map((yield* current(thread)).map((p) => [p.memberId, p]));
    const result: Array<ThreadParticipation.Record> = [];
    for (const memberId of ids) {
      const candidate = candidates.get(memberId);
      if (candidate === undefined) return yield* new Unavailable({ memberId });
      const previous = existing.get(memberId);
      if (previous !== undefined) {
        if (
          previous.groupMembershipId !== candidate.admission.id ||
          previous.joinedAtSequence > sequence
        )
          return yield* new InvalidResponse({
            message: "Current participation has an inconsistent admission or sequence",
          });
        result.push(previous);
        continue;
      }
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Admission))({
        id: ThreadParticipation.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        memberId,
        groupMembershipId: candidate.admission.id,
        identity: candidate.member.identity,
        joinedAt: occurredAt,
        joinedAtSequence: sequence,
        status: "active",
        endedAt: null,
      });
      yield* journal.publish(ThreadParticipationFacts.Added, participant);
      result.push(participant);
    }
    return result;
  });
  return Service.of({ workspaceId, eligible, current, ensure });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationAdmission from "./admission.ts";
