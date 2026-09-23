import { Effect, Schema } from "effect";
import { AssignmentFacts } from "../authorization/assignment/facts.ts";
import { RoleFacts } from "../authorization/role/facts.ts";
import { Event } from "../journal/event.ts";
import type { Fact } from "../journal/fact.ts";
import { WorkspaceFacts } from "../workspace/facts.ts";
import { InvitationFacts } from "../workspace/invitation/facts.ts";
import { MemberFacts } from "../workspace/member/facts.ts";
import { ChangeFeed } from "./change-feed.ts";

/** Names of facts the feed publishes; an unregistered version of one fails normalization. */
const published = new Set<string>();
/** Publish one fact version in the feed, keeping its existing payload codec. */
const register = <
  const Name extends string,
  const Version extends number,
  P extends Schema.Constraint,
>(
  fact: Fact.Definition<Name, Version, P>,
) => {
  published.add(fact.name);
  return Event.makeSchema(fact);
};
/**
 * Facts the workspace-wide feed publishes. Facts of every other domain stay out of it, so private
 * names, audiences, and provenance never reach it by default. Register each version of a
 * published fact here; a version left out fails normalization rather than disappearing.
 */
const supported = Schema.Union([
  register(WorkspaceFacts.Initialized),
  register(WorkspaceFacts.OwnershipTransferred),
  register(MemberFacts.Added),
  register(MemberFacts.Removed),
  register(InvitationFacts.Issued),
  register(InvitationFacts.Accepted),
  register(InvitationFacts.Revoked),
  register(RoleFacts.Created),
  register(RoleFacts.Renamed),
  register(RoleFacts.PermissionsChanged),
  register(AssignmentFacts.Created),
  register(AssignmentFacts.Revoked),
]);
const encode = Schema.encodeUnknownEffect(Schema.toCodecJson(supported));

/** Whether the feed publishes this event's fact, whatever its version. */
export const isPublished = (event: { readonly name: string }) => published.has(event.name);

/** Normalize decoded values once for this consumer, without changing the shared bus event. */
export const normalize = Effect.fn("ChangeFeedEvents.normalize")(function* (event: Event.Record) {
  const encoded = yield* encode(event);
  const { payload } = yield* Schema.decodeUnknownEffect(Schema.Struct({ payload: Schema.Json }))(
    encoded,
  );
  return ChangeFeed.Event.make({
    id: event.id,
    name: event.name,
    version: event.version,
    recordedAt: event.recordedAt,
    provenance: event.provenance,
    payload,
  });
});

export * as ChangeFeedEvents from "./events.ts";
