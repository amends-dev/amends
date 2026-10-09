import { Audience } from "../journal/audience.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { Connection } from "./connection.ts";

/** Connections are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

export const Created = Fact.make("connection.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Connection.Record,
});

export const Renamed = Fact.make("connection.renamed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Renamed,
});

/** Its settings replaced as a whole. */
export const Configured = Fact.make("connection.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Configured,
});

/**
 * Its key replaced with another, which the commit stored apart from the journal. The fact names no
 * key and changes nothing a reader sees; it records when the key was replaced, and by whom.
 */
export const KeyReplaced = Fact.make("connection.key-replaced", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Reference,
});

/** Removed from use, with its key; its record remains. */
export const Removed = Fact.make("connection.removed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  occurrence: (payload) => [payload.connectionId],
  payload: Connection.Reference,
});

export * as ConnectionFacts from "./facts.ts";
