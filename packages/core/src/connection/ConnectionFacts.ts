/**
 * The facts recorded about a workspace's connections, which `ConnectionService` publishes and
 * `ConnectionProjection` keeps as records. Connections are workspace configuration, so every member
 * may learn of each change. No fact carries a key: the commit that stores one records only that it
 * was replaced.
 *
 * @since 0.1.0
 */
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Subject from "../journal/Subject.ts";
import * as Connection from "./Connection.ts";

/** Connections are workspace configuration: every member may learn of changes to them. */
const workspace = () => [Audience.workspace];

/**
 * A connection was created, as its record says, without its key, which the same commit stored
 * apart.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("connection.created", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Connection.Record,
});

/**
 * A connection's name changed.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("connection.renamed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Renamed,
});

/**
 * A connection's settings were replaced as a whole.
 *
 * @category facts
 * @since 0.1.0
 */
export const Configured = Fact.make("connection.configured", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Configured,
});

/**
 * Its key replaced with another, which the commit stored apart from the journal. The fact names no
 * key and changes nothing a reader sees; it records when the key was replaced, and by whom.
 *
 * @category facts
 * @since 0.1.0
 */
export const KeyReplaced = Fact.make("connection.key-replaced", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  payload: Connection.Reference,
});

/**
 * A connection was removed from use, and its key deleted; its record remains, as `removed`.
 *
 * @category facts
 * @since 0.1.0
 */
export const Removed = Fact.make("connection.removed", {
  audience: workspace,
  version: 1,
  subject: (payload) => Subject.make("connection", payload.connectionId),
  occurrence: (payload) => [payload.connectionId],
  payload: Connection.Reference,
});
