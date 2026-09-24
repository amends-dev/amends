import { Effect, Schema } from "effect";
import { Subject } from "../../journal/subject.ts";
import { ThreadActivity } from "./activity.ts";

/**
 * Resolved timeline items by activity kind. Each domain that records activity adds its kinds'
 * items to this interface beside their definitions, so the union covers every kind without the
 * thread importing the domains that own them.
 */
// oxlint-disable-next-line typescript/no-empty-interface -- domains extend it by augmentation.
export interface Items {}
/** One timeline item: an activity with the records it references, as its kind resolves them. */
export type Item = Items[keyof Items];

/** Details whose encoded form is JSON, which is how activity carries them. */
export type Details = Schema.Codec<any, Schema.Json>;

/** The activity with its kind's details decoded. */
const activitySchema = <const Name extends string, D extends Details>(name: Name, details: D) =>
  Schema.Struct({
    ...ThreadActivity.Common.fields,
    kind: Schema.Literal(name),
    subject: Subject.Value,
    occurrence: ThreadActivity.Record.fields.occurrence,
    newActivity: ThreadActivity.Record.fields.newActivity,
    details,
  });

/** An activity kind, defined by the domain whose operations record it. */
export interface Definition<Name extends string = string, D extends Details = Details> {
  readonly name: Name;
  readonly details: D;
  /** Whether activity of this kind counts as its thread's and group's latest activity. */
  readonly newActivity: boolean;
  /** The activity with its details decoded, as timelines and handlers read it. */
  readonly Activity: ReturnType<typeof activitySchema<Name, D>>;
  /** Pure: what the activity is about. */
  subject(details: D["Type"]): Subject.Value;
  /** Pure: the activity's identity within the workspace, or null to leave it repeatable. */
  occurrence(details: D["Type"]): ReadonlyArray<string> | null;
}
/** An activity of this kind with its details decoded. */
export type Activity<K extends Definition> = K["Activity"]["Type"];

/**
 * Define an activity kind. Without an occurrence rule, each subject holds at most one activity of
 * the kind, as a message has one publication.
 *
 * @category constructors
 */
export const make = <const Name extends string, D extends Details>(
  name: Name,
  options: {
    readonly details: D;
    readonly subject: (details: NoInfer<D["Type"]>) => Subject.Value;
    readonly occurrence?: (details: NoInfer<D["Type"]>) => ReadonlyArray<string> | null;
    readonly newActivity: boolean;
  },
): Readonly<Definition<Name, D>> => {
  ThreadActivity.Kind.make(name);
  return Object.freeze({
    name,
    details: options.details,
    newActivity: options.newActivity,
    Activity: activitySchema(name, options.details),
    subject: options.subject,
    occurrence: options.occurrence ?? ((details) => [options.subject(details)]),
  });
};

/** The fields an activity of a kind takes from its details. */
export interface Prepared extends Pick<
  ThreadActivity.Record,
  "kind" | "subject" | "occurrence" | "newActivity" | "details"
> {}

const occurrenceKey = (name: string, parts: ReadonlyArray<string> | null) =>
  parts === null ? null : JSON.stringify([name, ...parts]);

/** Validate a kind's details and derive what the activity records from them. */
export const prepare = Effect.fn("ThreadActivityKind.prepare")(function* <K extends Definition>(
  kind: K,
  input: K["details"]["Type"],
) {
  const details = yield* Schema.decodeUnknownEffect(Schema.toType(kind.details))(input);
  return {
    kind: ThreadActivity.Kind.make(kind.name),
    subject: yield* Schema.decodeEffect(Subject.Value)(kind.subject(details)),
    occurrence: occurrenceKey(kind.name, kind.occurrence(details)),
    newActivity: kind.newActivity,
    details: yield* Schema.encodeEffect(kind.details)(details),
  } satisfies Prepared;
});

/** Whether an activity is of this kind. */
export const is =
  <K extends Definition>(kind: K) =>
  (activity: ThreadActivity.Record): boolean =>
    activity.kind === kind.name;

/**
 * Read an activity as this kind, decoding its details. Its subject, occurrence, and new-activity
 * flag must be what the kind derives from them.
 */
export const decode = Effect.fn("ThreadActivityKind.decode")(function* <K extends Definition>(
  kind: K,
  activity: ThreadActivity.Record,
) {
  const details = yield* Schema.decodeEffect(kind.details)(activity.details);
  const derived = yield* prepare(kind, details);
  if (
    activity.kind !== derived.kind ||
    activity.subject !== derived.subject ||
    activity.occurrence !== derived.occurrence ||
    activity.newActivity !== derived.newActivity
  )
    return yield* new Mismatch({ kind: kind.name, activityId: activity.id });
  return Object.assign({}, activity, { details }) as Activity<K>;
});

/** An activity whose recorded fields disagree with its kind's definition. */
export class Mismatch extends Schema.TaggedError<Mismatch>()("ThreadActivityKind.Mismatch", {
  kind: Schema.String,
  activityId: ThreadActivity.Id,
}) {}

/**
 * Build a whole activity record from known-valid details, throwing otherwise. For fixtures and
 * tests; operations record activity through the recorder.
 */
export const makeRecordUnsafe = <K extends Definition>(
  kind: K,
  common: (typeof ThreadActivity.Common)["Type"],
  details: K["details"]["Type"],
): ThreadActivity.Record =>
  Effect.runSync(Effect.map(prepare(kind, details), (prepared) => ({ ...common, ...prepared })));

export * as ThreadActivityKind from "./kind.ts";
