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
  /**
   * Those of the given members with a current admission to the group and active workspace
   * membership, with both records. Reads only the members asked about.
   */
  readonly eligible: (
    groupId: Group.Id,
    memberIds: ReadonlyArray<Member.Id>,
  ) => Effect.Effect<ReadonlyMap<Member.Id, Eligible>, ReadError | Schema.SchemaError>;
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
    memberIds: ReadonlyArray<Member.Id>,
  ) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    const requested = new Set(memberIds);
    const result = new Map<Member.Id, Eligible>();
    if (requested.size === 0) return result;
    const seen = new Set<GroupMembership.Id>();
    const active = new Map<Member.Id, GroupMembership.Record>();
    for (const row of yield* memberships.findActiveMany(id, [...requested])) {
      const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (
        admission.workspaceId !== workspaceId ||
        admission.groupId !== id ||
        admission.status !== "active" ||
        !requested.has(admission.memberId) ||
        seen.has(admission.id)
      )
        return yield* new InvalidResponse({ message: "Group admissions are inconsistent" });
      seen.add(admission.id);
      if (active.has(admission.memberId))
        return yield* new InvalidResponse({ message: "Duplicate active group admission" });
      active.set(admission.memberId, admission);
    }
    const found = yield* loadMembers([...active.keys()]);
    for (const [memberId, admission] of active) {
      const member = found.get(memberId);
      if (member === undefined)
        return yield* new InvalidResponse({ message: "Group admission has no workspace member" });
      if (member.status === "active") result.set(member.id, { admission, member });
    }
    return result;
  });
  const checkThread = Effect.fnUntraced(function* (input: Thread.Record) {
    const thread = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(input).pipe(
      Effect.mapError(invalidRecord),
    );
    if (thread.workspaceId !== workspaceId)
      return yield* new InvalidResponse({ message: "Thread belongs to another workspace" });
    return thread;
  });
  /** What one read of a thread's active participations has seen, so later reads cannot repeat it. */
  interface Seen {
    readonly ids: Set<ThreadParticipation.Id>;
    readonly participants: Set<string>;
  }
  const unseen = (): Seen => ({ ids: new Set(), participants: new Set() });
  /**
   * Validate stored active participations of the thread, then keep those still current: contacts
   * and triage take part without group access, and members need their current admission.
   */
  const backed = Effect.fnUntraced(function* (
    thread: Thread.Record,
    rows: ReadonlyArray<ThreadParticipation.Record>,
    seen: Seen,
  ) {
    const active: Array<ThreadParticipation.Record> = [];
    for (const row of rows) {
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        row,
      ).pipe(Effect.mapError(invalidRecord));
      if (
        participant.workspaceId !== workspaceId ||
        participant.threadId !== thread.id ||
        participant.status !== "active" ||
        seen.ids.has(participant.id)
      )
        return yield* new InvalidResponse({
          message: "Participation store returned an inconsistent thread listing",
        });
      seen.ids.add(participant.id);
      const key = ThreadParticipation.keyOf(participant.participant);
      if (seen.participants.has(key))
        return yield* new InvalidResponse({ message: "Duplicate active thread participant" });
      seen.participants.add(key);
      active.push(participant);
    }
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
  /** Read one page of stored active participations: those current, and the cursor after it. */
  const pageAfter = Effect.fnUntraced(function* (
    thread: Thread.Record,
    options: ThreadParticipation.ListOptions,
    seen: Seen,
  ) {
    const rows = yield* participations.pageActiveByThread(thread.id, options);
    if (rows.length > options.limit)
      return yield* new InvalidResponse({ message: "Participation page exceeds its limit" });
    const participants = yield* backed(thread, rows, seen);
    const last = rows.at(-1);
    return {
      participants,
      next: rows.length < options.limit || last === undefined ? undefined : last.id,
    };
  });
  /** Store pages a whole-thread read takes at a time. */
  const pageSize = 500;
  const current = Effect.fn("ThreadParticipationAdmission.current")(function* (
    input: Thread.Record,
  ) {
    const thread = yield* checkThread(input);
    const seen = unseen();
    const result: Array<ThreadParticipation.Record> = [];
    let after: ThreadParticipation.Id | undefined;
    do {
      const read = yield* pageAfter(
        thread,
        after === undefined ? { limit: pageSize } : { after, limit: pageSize },
        seen,
      );
      result.push(...read.participants);
      after = read.next;
    } while (after !== undefined);
    return result;
  });
  const page = Effect.fn("ThreadParticipationAdmission.page")(function* (
    input: Thread.Record,
    request: ThreadParticipation.ListOptions,
  ) {
    const thread = yield* checkThread(input);
    const options = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.ListOptions))(
      request,
    );
    const seen = unseen();
    const result: Array<ThreadParticipation.Record> = [];
    let after = options.after;
    do {
      const read = yield* pageAfter(
        thread,
        after === undefined ? { limit: options.limit } : { after, limit: options.limit },
        seen,
      );
      // Anything past the limit follows the last one returned, so the caller's cursor finds it.
      result.push(...read.participants.slice(0, options.limit - result.length));
      after = read.next;
    } while (after !== undefined && result.length < options.limit);
    return result;
  });
  const find = Effect.fn("ThreadParticipationAdmission.find")(function* (
    input: Thread.Record,
    references: ReadonlyArray<ThreadParticipation.Reference>,
  ) {
    const thread = yield* checkThread(input);
    const requested = new Set(references.map(ThreadParticipation.keyOf));
    if (requested.size === 0) return [];
    const rows = yield* participations.findActive(thread.id, references);
    if (rows.some((row) => !requested.has(ThreadParticipation.keyOf(row.participant))))
      return yield* new InvalidResponse({
        message: "Participation store returned a participant not asked for",
      });
    return yield* backed(thread, rows, unseen());
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
    const candidates =
      joining.length > 0
        ? yield* eligible(thread.groupId, joining)
        : new Map<Member.Id, Eligible>();
    const result: Array<ThreadParticipation.Record> = [];
    const added: Array<Event.Type<typeof ThreadParticipationFacts.Added>> = [];
    for (const reference of requested) {
      const previous = existing.get(ThreadParticipation.keyOf(reference));
      if (previous !== undefined) {
        if (previous.joinedAtSequence > sequence)
          return yield* new InvalidResponse({
            message: "Current participation has an inconsistent admission or sequence",
          });
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
  return Service.of({ workspaceId, eligible, current, page, find, ensure });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationAdmission from "./admission.ts";
