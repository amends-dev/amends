/**
 * The journal: append-only logs, the facts domains publish to them, the projections that keep
 * read models from those facts, and the commits that make both visible together. Domains declare
 * facts with `Fact` and projections with `Projection`, and publish through `Journal`; hosts
 * implement `Store` and `Checkpoint`; `Transaction` coordinates commits over them, and `Log`
 * writes logs of any schema.
 *
 * @since 0.1.0
 */

/**
 * Who may learn of a fact beyond the projections that apply it.
 *
 * @since 0.1.0
 */
export * as Audience from "./Audience.ts";

/**
 * The storage contract for projection progress and each log's live projection versions.
 *
 * @since 0.1.0
 */
export * as Checkpoint from "./Checkpoint.ts";

/**
 * How log values and fact payloads become stored bytes and back.
 *
 * @since 0.1.0
 */
export * as Codec from "./Codec.ts";

/**
 * The identity and record of a commit, one transaction across logs and stores.
 *
 * @since 0.1.0
 */
export * as Commit from "./Commit.ts";

/**
 * Where a log entry is and which commit recorded it.
 *
 * @since 0.1.0
 */
export * as Entry from "./Entry.ts";

/**
 * A fact as the journal recorded it: its header, provenance, and decoded event.
 *
 * @since 0.1.0
 */
export * as Event from "./Event.ts";

/**
 * How a domain declares a fact: its name, versioned payload, subject, occurrence, and audience.
 *
 * @since 0.1.0
 */
export * as Fact from "./Fact.ts";

/**
 * The workspace journal: publishing facts and applying projections in the same commit.
 *
 * @since 0.1.0
 */
export * as Journal from "./Journal.ts";

/**
 * Typed, append-only logs: appends, reads, streams, and live tails.
 *
 * @since 0.1.0
 */
export * as Log from "./Log.ts";

/**
 * The identity of one occurrence of a fact, which makes publishing it idempotent.
 *
 * @since 0.1.0
 */
export * as Occurrence from "./Occurrence.ts";

/**
 * How a domain keeps a read model from facts, live in each commit or rebuilt from the log.
 *
 * @since 0.1.0
 */
export * as Projection from "./Projection.ts";

/**
 * The provenance each publication records: performer, cause, correlation, and time.
 *
 * @since 0.1.0
 */
export * as Publication from "./Publication.ts";

/**
 * What a commit does, in that same commit, when it publishes a fact.
 *
 * @since 0.1.0
 */
export * as Reaction from "./Reaction.ts";

/**
 * The storage contract for logs and native transactions.
 *
 * @since 0.1.0
 */
export * as Store from "./Store.ts";

/**
 * The entity a fact changes, as a `kind:id` key.
 *
 * @since 0.1.0
 */
export * as Subject from "./Subject.ts";

/**
 * The commit coordinator the journal and logs share.
 *
 * @since 0.1.0
 */
export * as Transaction from "./Transaction.ts";
