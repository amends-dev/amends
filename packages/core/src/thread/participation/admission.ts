import { Context, Crypto, Effect, Layer, Schema } from "effect";
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
import type { Event } from "../../journal/event.ts";
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
export interface Ensured {
  readonly participants: ReadonlyArray<ThreadParticipation.Record>;
  readonly added: ReadonlyArray<Event.Type<typeof ThreadParticipationFacts.Added>>;
}
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  readonly eligible: (
    groupId: Group.Id,
  ) => Effect.Effect<ReadonlyMap<Member.Id, Eligible>, ReadError | Schema.SchemaError>;
  readonly current: (
    thread: Thread.Record,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, ReadError>;
  /**
   * Required admission steps of an authorized workflow. Members need a current group admission;
   * contacts and triage take part without one. Current participants are reused. Never opens or
   * captures a transaction.
   */
  readonly ensure: (
    thread: Thread.Record,
    references: ReadonlyArray<ThreadParticipation.Reference>,
    sequence: number,
    occurredAt: DateTime.Utc,
  ) => Effect.Effect<Ensured, Error, Store.Transaction | Publication.Service>;
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
  /** Load the requested members in one read, rejecting records the store should not return. */
  const loadMembers = Effect.fnUntraced(function* (ids: ReadonlyArray<Member.Id>) {
    const requested = new Set(ids);
    const result = new Map<Member.Id, Member.Record>();
    for (const row of yield* members.getMany([...requested])) {
      const member = yield* Schema.decodeEffect(Member.Record)(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (member.workspaceId !== workspaceId || !requested.has(member.id) || result.has(member.id))
        return yield* new InvalidResponse({
          message: "Member store returned another member or workspace",
        });
      result.set(member.id, member);
    }
    return result;
  });
  /** Load the requested group admissions in one read, rejecting records the store should not return. */
  const loadAdmissions = Effect.fnUntraced(function* (ids: ReadonlyArray<GroupMembership.Id>) {
    const requested = new Set(ids);
    const result = new Map<GroupMembership.Id, GroupMembership.Record>();
    for (const row of yield* memberships.getMany([...requested])) {
      const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (
        admission.workspaceId !== workspaceId ||
        !requested.has(admission.id) ||
        result.has(admission.id)
      )
        return yield* new InvalidResponse({
          message: "Admission store returned another admission or workspace",
        });
      result.set(admission.id, admission);
    }
    return result;
  });
  const eligible = Effect.fn("ThreadParticipationAdmission.eligible")(function* (
    groupId: Group.Id,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    const seen = new Set<GroupMembership.Id>();
    const active = new Map<Member.Id, GroupMembership.Record>();
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
      active.set(admission.memberId, admission);
    }
    const found = yield* loadMembers([...active.keys()]);
    const result = new Map<Member.Id, Eligible>();
    for (const [memberId, admission] of active) {
      const member = found.get(memberId);
      if (member === undefined)
        return yield* new InvalidResponse({ message: "Group admission has no workspace member" });
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
    const active: Array<ThreadParticipation.Record> = [];
    const seen = new Set<ThreadParticipation.Id>();
    const seenParticipants = new Set<string>();
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
      const key = ThreadParticipation.keyOf(participant.participant);
      if (seenParticipants.has(key))
        return yield* new InvalidResponse({ message: "Duplicate active thread participant" });
      seenParticipants.add(key);
      active.push(participant);
    }
    // Contacts and triage take part without group access; members need a current admission.
    const joined = active.flatMap((p) => (p.participant._tag === "Member" ? [p.participant] : []));
    const admissions = yield* loadAdmissions(joined.map((p) => p.groupMembershipId));
    const found = yield* loadMembers(joined.map((p) => p.memberId));
    const result: Array<ThreadParticipation.Record> = [];
    for (const participant of active) {
      if (participant.participant._tag !== "Member") {
        result.push(participant);
        continue;
      }
      const joined = participant.participant;
      const admission = admissions.get(joined.groupMembershipId);
      const member = found.get(joined.memberId);
      if (admission === undefined || member === undefined)
        return yield* new InvalidResponse({
          message: "Participation references a missing admission or workspace member",
        });
      if (
        admission.groupId !== thread.groupId ||
        admission.memberId !== joined.memberId ||
        !sameIdentity(member.identity, joined.identity)
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
    references: ReadonlyArray<ThreadParticipation.Reference>,
    sequence: number,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    const requested = yield* Schema.decodeEffect(Schema.Array(ThreadParticipation.Reference))(
      references,
    );
    if (new Set(requested.map(ThreadParticipation.keyOf)).size !== requested.length)
      return yield* new InvalidResponse({ message: "Participants must be distinct" });
    const candidates = requested.some((reference) => reference._tag === "Member")
      ? yield* eligible(thread.groupId)
      : new Map<Member.Id, Eligible>();
    const existing = new Map(
      (yield* current(thread)).map((p) => [ThreadParticipation.keyOf(p.participant), p] as const),
    );
    const result: Array<ThreadParticipation.Record> = [];
    const added: Array<Event.Type<typeof ThreadParticipationFacts.Added>> = [];
    for (const reference of requested) {
      let participant: ThreadParticipation.Participant;
      if (reference._tag === "Member") {
        const candidate = candidates.get(reference.memberId);
        if (candidate === undefined)
          return yield* new Unavailable({ memberId: reference.memberId });
        participant = {
          _tag: "Member",
          memberId: reference.memberId,
          groupMembershipId: candidate.admission.id,
          identity: candidate.member.identity,
        };
      } else participant = reference;
      const previous = existing.get(ThreadParticipation.keyOf(reference));
      if (previous !== undefined) {
        if (
          (participant._tag === "Member" &&
            (previous.participant._tag !== "Member" ||
              previous.participant.groupMembershipId !== participant.groupMembershipId)) ||
          previous.joinedAtSequence > sequence
        )
          return yield* new InvalidResponse({
            message: "Current participation has an inconsistent admission or sequence",
          });
        result.push(previous);
        continue;
      }
      const admitted = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Admission))({
        id: ThreadParticipation.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        participant,
        joinedAt: occurredAt,
        joinedAtSequence: sequence,
        status: "active",
        endedAt: null,
      });
      added.push(yield* journal.publish(ThreadParticipationFacts.Added, admitted));
      result.push(admitted);
    }
    return { participants: result, added };
  });
  return Service.of({ workspaceId, eligible, current, ensure });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationAdmission from "./admission.ts";
