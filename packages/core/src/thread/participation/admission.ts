import { Context, Crypto, Effect, Layer, Schema } from "effect";
import type { DateTime, PlatformError } from "effect";
import { Group } from "../../group/group.ts";
import { GroupMembership } from "../../group/membership/membership.ts";
import { GroupMembershipStore } from "../../group/membership/store.ts";
import { Member } from "../../workspace/member/member.ts";
import { MemberStore } from "../../workspace/member/store.ts";
import { Journal } from "../../journal/journal.ts";
import type { Publication } from "../../journal/publication.ts";
import type { Log } from "../../journal/log.ts";
import type { Event } from "../../journal/event.ts";
import type { Projection } from "../../journal/projection.ts";
import { Store } from "../../journal/store.ts";
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
export interface Eligible {
  readonly admission: GroupMembership.Record;
  readonly member: Member.Record;
}
export type ReadError =
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadParticipationStore.Failure;
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
  /**
   * Those of the given members with a current admission to the group and active workspace
   * membership, with both records. Reads only the members asked about.
   */
  readonly eligible: (
    groupId: Group.Id,
    memberIds: ReadonlyArray<Member.Id>,
  ) => Effect.Effect<ReadonlyMap<Member.Id, Eligible>, ReadError>;
  /**
   * Every current participant: an active participation whose member, if any, still has a current
   * group admission. Read in pages; a reply that addresses everyone needs them all.
   */
  readonly current: (
    thread: Thread.Record,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, ReadError>;
  /**
   * A page of current participants in participation-ID order after the cursor. Stored
   * participants that have lapsed are skipped, and reading continues to fill the page.
   */
  readonly page: (
    thread: Thread.Record,
    options: ThreadParticipation.ListOptions,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Record>, ReadError | Schema.SchemaError>;
  /** The current participations of these participants, reading only them. */
  readonly find: (
    thread: Thread.Record,
    participants: ReadonlyArray<ThreadParticipation.Reference>,
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
export const make = Effect.fn("ThreadParticipationAdmission.make")(function* () {
  const memberships = yield* GroupMembershipStore.Service;
  const members = yield* MemberStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  const membersById = (ids: ReadonlyArray<Member.Id>) =>
    Effect.map(
      members.getMany(ids),
      (found) => new Map(found.map((member) => [member.id, member] as const)),
    );
  const eligible = Effect.fn("ThreadParticipationAdmission.eligible")(function* (
    groupId: Group.Id,
    memberIds: ReadonlyArray<Member.Id>,
  ) {
    const result = new Map<Member.Id, Eligible>();
    if (memberIds.length === 0) return result;
    const admissions = yield* memberships.findActiveMany(groupId, memberIds);
    const found = yield* membersById(admissions.map((admission) => admission.memberId));
    for (const admission of admissions) {
      const member = found.get(admission.memberId);
      if (member?.status === "active") result.set(member.id, { admission, member });
    }
    return result;
  });
  /**
   * The stored active participations still current: contacts and triage take part without group
   * access, and members need their admission and workspace membership to be active.
   */
  const backed = Effect.fnUntraced(function* (rows: ReadonlyArray<ThreadParticipation.Record>) {
    const joined = rows.flatMap((p) => (p.participant._tag === "Member" ? [p.participant] : []));
    const admissions = new Map(
      (yield* memberships.getMany(joined.map((p) => p.groupMembershipId))).map(
        (admission) => [admission.id, admission] as const,
      ),
    );
    const found = yield* membersById(joined.map((p) => p.memberId));
    return rows.filter(
      (p) =>
        p.participant._tag !== "Member" ||
        (admissions.get(p.participant.groupMembershipId)?.status === "active" &&
          found.get(p.participant.memberId)?.status === "active"),
    );
  });
  /** Read one page of stored active participations: those current, and the cursor after it. */
  const pageAfter = Effect.fnUntraced(function* (
    thread: Thread.Record,
    options: ThreadParticipation.ListOptions,
  ) {
    const rows = yield* participations.pageActiveByThread(thread.id, options);
    const last = rows.at(-1);
    return {
      participants: yield* backed(rows),
      next: rows.length < options.limit || last === undefined ? undefined : last.id,
    };
  });
  /** Store pages a whole-thread read takes at a time. */
  const pageSize = 500;
  const current = Effect.fn("ThreadParticipationAdmission.current")(function* (
    thread: Thread.Record,
  ) {
    const result: Array<ThreadParticipation.Record> = [];
    let after: ThreadParticipation.Id | undefined;
    do {
      const read = yield* pageAfter(
        thread,
        after === undefined ? { limit: pageSize } : { after, limit: pageSize },
      );
      result.push(...read.participants);
      after = read.next;
    } while (after !== undefined);
    return result;
  });
  const page = Effect.fn("ThreadParticipationAdmission.page")(function* (
    thread: Thread.Record,
    request: ThreadParticipation.ListOptions,
  ) {
    const options = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.ListOptions))(
      request,
    );
    const result: Array<ThreadParticipation.Record> = [];
    let after = options.after;
    do {
      const read = yield* pageAfter(
        thread,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
      );
      // Anything past the limit follows the last one returned, so the caller's cursor finds it.
      result.push(...read.participants.slice(0, options.limit - result.length));
      after = read.next;
    } while (after !== undefined && result.length < options.limit);
    return result;
  });
  const find = Effect.fn("ThreadParticipationAdmission.find")(function* (
    thread: Thread.Record,
    references: ReadonlyArray<ThreadParticipation.Reference>,
  ) {
    if (references.length === 0) return [];
    return yield* backed(yield* participations.findActive(thread.id, references));
  });
  const ensure = Effect.fn("ThreadParticipationAdmission.ensure")(function* (
    thread: Thread.Record,
    requested: ReadonlyArray<ThreadParticipation.Reference>,
    sequence: number,
    occurredAt: DateTime.Utc,
  ) {
    yield* Store.Transaction;
    if (new Set(requested.map(ThreadParticipation.keyOf)).size !== requested.length)
      return yield* Effect.die("Participants to admit must be distinct");
    // Current participants are reused; they already hold the member's current admission.
    const existing = new Map(
      (yield* find(thread, requested)).map(
        (p) => [ThreadParticipation.keyOf(p.participant), p] as const,
      ),
    );
    const joining = requested.flatMap((reference) =>
      reference._tag === "Member" && !existing.has(ThreadParticipation.keyOf(reference))
        ? [reference.memberId]
        : [],
    );
    const candidates = yield* eligible(thread.groupId, joining);
    const result: Array<ThreadParticipation.Record> = [];
    const added: Array<Event.Type<typeof ThreadParticipationFacts.Added>> = [];
    for (const reference of requested) {
      const previous = existing.get(ThreadParticipation.keyOf(reference));
      if (previous !== undefined) {
        result.push(previous);
        continue;
      }
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
      const admitted: typeof ThreadParticipation.Admission.Type = {
        id: ThreadParticipation.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        participant,
        joinedAt: occurredAt,
        joinedAtSequence: sequence,
        status: "active",
        endedAt: null,
      };
      added.push(
        yield* journal.publish(ThreadParticipationFacts.Added, {
          ...admitted,
          groupId: thread.groupId,
        }),
      );
      result.push(admitted);
    }
    return { participants: result, added };
  });
  return Service.of({ eligible, current, page, find, ensure });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationAdmission from "./admission.ts";
