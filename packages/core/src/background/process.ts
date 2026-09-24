import { Schema } from "effect";
import type { DateTime, Effect } from "effect";
import type { Fact } from "../journal/fact.ts";

/** A process's name: dotted, chosen by the domain that owns it, such as `notification.settle`. */
export const Name = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/),
).pipe(Schema.brand("BackgroundProcessName"));
export type Name = typeof Name.Type;

/** What a run leaves outstanding, and so when the process should run next. */
export const Outcome = Schema.TaggedUnion({
  /** Nothing is outstanding: it runs again when a commit wakes it. */
  Idle: {},
  /** More is outstanding now: it handled a bounded batch and should run again soon. */
  Continue: {},
  /** Nothing is due before `at`, as for a retry or a deadline: it should run again then. */
  At: { at: Schema.DateTimeUtc },
});
export type Outcome = typeof Outcome.Type;
/** Nothing is outstanding. */
export const idle: Outcome = Outcome.cases.Idle.make({});
/** More is outstanding now. */
export const continuing: Outcome = Outcome.cases.Continue.make({});
/** Nothing is due before `at`. */
export const dueAt = (at: DateTime.Utc): Outcome => Outcome.cases.At.make({ at });

/** A fact whose publication asks for the process to run, when `when` holds for its payload. */
export interface Trigger {
  readonly fact: string;
  readonly when: (payload: unknown) => boolean;
}

/** Wake the process whenever a commit publishes this fact, or only for payloads `when` accepts. */
export const on = <F extends Fact.Definition>(
  fact: F,
  when?: (payload: Fact.Payload<F>) => boolean,
): Trigger => ({
  fact: fact.name,
  when: when === undefined ? () => true : (payload) => when(payload as Fact.Payload<F>),
});

/**
 * Work a domain does outside any request, within one workspace. It finds what is outstanding from
 * stored records, so a run after a restart is an ordinary run, and handles it in commits of its
 * own, each rechecking what it acts on and safe to repeat, since a run can be interrupted and
 * redone. A commit that publishes a fact it wakes on asks for it to run in that same commit.
 */
export interface Definition<E = never, R = never> {
  readonly name: Name;
  readonly wakesOn: ReadonlyArray<Trigger>;
  /** Advance outstanding work and report what remains. */
  readonly run: Effect.Effect<Outcome, E, R>;
}

/** @category constructors */
export const make = <E, R>(
  name: string,
  options: {
    readonly wakesOn: ReadonlyArray<Trigger>;
    readonly run: Effect.Effect<Outcome, E, R>;
  },
): Definition<E, R> => ({ name: Name.make(name), wakesOn: options.wakesOn, run: options.run });

export * as BackgroundProcess from "./process.ts";
