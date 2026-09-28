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

/** A credential stored for it, by reference; the secret never enters the journal. */
export const CredentialSet = Fact.make("connection.credential-set", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.CredentialSet,
});

export const CredentialCleared = Fact.make("connection.credential-cleared", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Change,
});

/** Removed from use; its record remains for history and its credential is deleted. */
export const Removed = Fact.make("connection.removed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  occurrence: (payload) => [payload.connectionId],
  payload: Connection.Change,
});

export * as ConnectionFacts from "./facts.ts";
