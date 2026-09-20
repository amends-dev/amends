import { Effect, Schema } from "effect";
import { AssignmentFacts } from "../authorization/assignment/facts.ts";
import { RoleFacts } from "../authorization/role/facts.ts";
import { Event } from "../journal/event.ts";
import { WorkspaceFacts } from "../workspace/facts.ts";
import { InvitationFacts } from "../workspace/invitation/facts.ts";
import { MemberFacts } from "../workspace/member/facts.ts";
import { ChangeFeed } from "./change-feed.ts";

/** Register fact versions here when adding a domain; preserve their existing payload codecs. */
const supported = Schema.Union([
  Event.makeSchema(WorkspaceFacts.Initialized),
  Event.makeSchema(WorkspaceFacts.OwnershipTransferred),
  Event.makeSchema(MemberFacts.Added),
  Event.makeSchema(MemberFacts.Removed),
  Event.makeSchema(InvitationFacts.Issued),
  Event.makeSchema(InvitationFacts.Accepted),
  Event.makeSchema(InvitationFacts.Revoked),
  Event.makeSchema(RoleFacts.Created),
  Event.makeSchema(RoleFacts.Renamed),
  Event.makeSchema(RoleFacts.PermissionsChanged),
  Event.makeSchema(AssignmentFacts.Created),
  Event.makeSchema(AssignmentFacts.Revoked),
]);
const encode = Schema.encodeUnknownEffect(Schema.toCodecJson(supported));

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
    payload,
  });
});

export * as ChangeFeedEvents from "./events.ts";
