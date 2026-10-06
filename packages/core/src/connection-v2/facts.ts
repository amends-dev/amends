import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { ConnectionV2 } from "./connection.ts";

/** Connections are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

export const Created = Fact.make("connection-v2.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection-v2", payload.id),
  occurrence: (payload) => [payload.id],
  payload: ConnectionV2.Record,
});

export const Renamed = Fact.make("connection-v2.renamed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection-v2", payload.connectionId),
  payload: ConnectionV2.Renamed,
});

/** Its settings replaced as a whole. */
export const Configured = Fact.make("connection-v2.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection-v2", payload.connectionId),
  payload: ConnectionV2.Configured,
});

/**
 * Its key replaced with another, which the commit stored apart from the journal. The fact names no
 * key and changes nothing a reader sees; it records when the key was replaced, and by whom.
 */
export const KeyReplaced = Fact.make("connection-v2.key-replaced", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection-v2", payload.connectionId),
  payload: ConnectionV2.Change,
});

/** Removed from use, with its key; its record remains. */
export const Removed = Fact.make("connection-v2.removed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection-v2", payload.connectionId),
  occurrence: (payload) => [payload.connectionId],
  payload: ConnectionV2.Change,
});

export * as ConnectionV2Facts from "./facts.ts";
