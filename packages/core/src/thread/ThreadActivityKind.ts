/**
 * How a domain defines a kind of thread activity, and how activity of that kind is recorded and
 * read back. A kind names itself, gives its details a schema and a version, says what an activity
 * of it is about, its thread unless the kind says otherwise, and whether it is repeatable, and
 * whether it counts as new activity for readers. A domain defines its kinds beside its facts,
 * records them through `ThreadCommand.publishActivity`, and shows them in timelines with a
 * resolver it registers in `ThreadActivityResolvers`.
 *
 * @since 0.1.0
 */
import { Effect, Schema } from "effect";
import { Subject } from "../journal/subject.ts";
import { ThreadActivity } from "./ThreadActivity.ts";
import type { ThreadId } from "./ThreadId.ts";

/**
 * Resolved timeline items by activity kind. Each domain that records activity adds its kinds'
 * items to this interface beside their definitions, by module augmentation, so the union covers
 * every kind without the thread importing the domains that own them.
 *
 * @category models
 * @since 0.1.0
 */
// oxlint-disable-next-line typescript/no-empty-interface -- domains extend it by augmentation.
export interface Items {}

/**
 * One timeline item: an activity with the records it references, as its kind resolves them.
 *
 * @category models
 * @since 0.1.0
 */
export type Item = Items[keyof Items];

/**
 * A kind's details: any schema whose encoded form is JSON, which is how activity carries them.
 *
 * @category models
 * @since 0.1.0
 */
export type Details = Schema.Codec<any, Schema.Json>;

/** The activity with its kind's details decoded. */
const activitySchema = <const Name extends string, const Version extends number, D extends Details>(
  name: Name,
  version: Version,
  details: D,
) =>
  Schema.Struct({
    ...ThreadActivity.Common.fields,
    kind: Schema.Literal(name),
    version: Schema.Literal(version),
    subject: Subject.Value,
    occurrence: ThreadActivity.Record.fields.occurrence,
    newActivity: ThreadActivity.Record.fields.newActivity,
    details,
  });

/**
 * An activity kind, defined by the domain whose operations record it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  D extends Details = Details,
> {
  readonly name: Name;
  /**
   * The version of the details' schema. A kind whose details change takes the next, and activity
   * recorded at another version reads back as a `Mismatch`, as a fact of another version does.
   */
  readonly version: Version;
  readonly details: D;
  /** Whether activity of this kind counts as its thread's and group's latest activity. */
  readonly newActivity: boolean;
  /** The activity with its details decoded, as timelines and handlers read it. */
  readonly Activity: ReturnType<typeof activitySchema<Name, Version, D>>;
  /** Pure: what the activity is about, given its details and the thread it is in. */
  subject(details: D["Type"], threadId: ThreadId.Id): Subject.Value;
  /** Pure: the activity's identity within the workspace, or null to leave it repeatable. */
  occurrence(details: D["Type"], threadId: ThreadId.Id): ReadonlyArray<string> | null;
}

/**
 * An activity of this kind with its details decoded.
 *
 * @category models
 * @since 0.1.0
 */
export type Activity<K extends Definition> = K["Activity"]["Type"];

/**
 * Define an activity kind. Without a subject rule, the activity is about its thread, as a rename
 * is. Without an occurrence rule, each subject holds at most one activity of the kind, as a message
 * has one publication.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <const Name extends string, const Version extends number, D extends Details>(
  name: Name,
  options: {
    readonly version: Version;
    readonly details: D;
    readonly subject?: (details: NoInfer<D["Type"]>) => Subject.Value;
    readonly occurrence?: (details: NoInfer<D["Type"]>) => ReadonlyArray<string> | null;
    readonly newActivity: boolean;
  },
): Readonly<Definition<Name, Version, D>> => {
  ThreadActivity.Kind.make(name);
  const subject =
    options.subject === undefined
      ? (_: D["Type"], threadId: ThreadId.Id) => Subject.make("thread", threadId)
      : options.subject;
  return Object.freeze({
    name,
    version: options.version,
    details: options.details,
    newActivity: options.newActivity,
    Activity: activitySchema(name, options.version, options.details),
    subject,
    occurrence:
      options.occurrence ??
      ((details: D["Type"], threadId: ThreadId.Id) => [subject(details, threadId)]),
  });
};

/**
 * The fields an activity of a kind takes from its details: what `prepare` derives.
 *
 * @category models
 * @since 0.1.0
 */
export interface Prepared extends Pick<
  ThreadActivity.Record,
  "kind" | "version" | "subject" | "occurrence" | "newActivity" | "details"
> {}

const occurrenceKey = (name: string, parts: ReadonlyArray<string> | null) =>
  parts === null ? null : JSON.stringify([name, ...parts]);

/**
 * Derive what an activity of a kind records in a thread from its details: the kind's name and
 * version, the subject and occurrence key the kind gives the details there, and the details
 * encoded.
 *
 * @category constructors
 * @since 0.1.0
 */
export const prepare = Effect.fn("ThreadActivityKind.prepare")(function* <K extends Definition>(
  kind: K,
  details: K["details"]["Type"],
  threadId: ThreadId.Id,
) {
  return {
    kind: ThreadActivity.Kind.make(kind.name),
    version: kind.version,
    subject: kind.subject(details, threadId),
    occurrence: occurrenceKey(kind.name, kind.occurrence(details, threadId)),
    newActivity: kind.newActivity,
    details: yield* Schema.encodeEffect(kind.details)(details),
  } satisfies Prepared;
});

/**
 * Whether an activity is of this kind.
 *
 * @category utils
 * @since 0.1.0
 */
export const is =
  <K extends Definition>(kind: K) =>
  (activity: ThreadActivity.Record): boolean =>
    activity.kind === kind.name;

/**
 * An activity was read as a kind, at a version, it is not.
 *
 * @category errors
 * @since 0.1.0
 */
export class Mismatch extends Schema.TaggedError<Mismatch>()("ThreadActivityKind.Mismatch", {
  kind: Schema.String,
  version: Schema.Int,
  activityId: ThreadActivity.Id,
}) {}

/**
 * Read an activity as this kind, decoding its details; one of another kind or version is a
 * `Mismatch`.
 *
 * @category utils
 * @since 0.1.0
 */
export const decode = Effect.fn("ThreadActivityKind.decode")(function* <K extends Definition>(
  kind: K,
  activity: ThreadActivity.Record,
) {
  if (activity.kind !== kind.name || activity.version !== kind.version)
    return yield* new Mismatch({ kind: kind.name, version: kind.version, activityId: activity.id });
  const details = yield* Schema.decodeEffect(kind.details)(activity.details);
  return Object.assign({}, activity, { details }) as Activity<K>;
});

/**
 * Build a whole activity record from known-valid details, throwing otherwise. For fixtures and
 * tests; operations record activity through `ThreadCommand`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeRecordUnsafe = <K extends Definition>(
  kind: K,
  common: (typeof ThreadActivity.Common)["Type"],
  details: K["details"]["Type"],
): ThreadActivity.Record =>
  Effect.runSync(
    Effect.map(prepare(kind, details, common.threadId), (prepared) => ({
      ...common,
      ...prepared,
    })),
  );

export * as ThreadActivityKind from "./ThreadActivityKind.ts";
