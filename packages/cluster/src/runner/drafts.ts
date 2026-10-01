/**
 * Text a harness is still writing, shown to the turn's readers before its block completes, best
 * effort: at most every 150 milliseconds, each block's new text in pieces of up to 1,500
 * characters, at the offset it continues. A completed block replaces its draft in the log, and a
 * draft that fails to show is not retried.
 */
import type { HarnessEvent } from "@amends/harness";
import { Clock, Effect } from "effect";
import type { TurnSteps } from "./turn-steps.ts";

/** How often readers are shown more of a response being written, in milliseconds. */
const showInterval = 150;
/** The most text one draft carries, so a signal stays small wherever it is relayed. */
const pieceSize = 1500;

/** A block's text not yet shown to readers, and how much of the block they have. */
interface Draft {
  readonly responseId: string;
  readonly part: number;
  offset: number;
  pending: string;
}

/** @category constructors */
export const make = (turnSteps: TurnSteps.Interface) => {
  const drafts = new Map<string, Draft>();
  let lastShownAt = Number.NEGATIVE_INFINITY;
  const draftKey = (responseId: string, part: number) => `${responseId}\u0000${part}`;
  const showPending = Effect.gen(function* () {
    if (![...drafts.values()].some((draft) => draft.pending !== "")) return;
    lastShownAt = yield* Clock.currentTimeMillis;
    for (const draft of drafts.values()) {
      while (draft.pending !== "") {
        const text = draft.pending.slice(0, pieceSize);
        yield* turnSteps
          .showDraft({ responseId: draft.responseId, part: draft.part, offset: draft.offset, text })
          .pipe(Effect.catchCause((cause) => Effect.logDebug("Draft not shown", cause)));
        draft.offset += text.length;
        draft.pending = draft.pending.slice(text.length);
      }
    }
  });
  return {
    /** Keep the text a harness event adds to a block, or drop a block's draft once it completes. */
    applyEvent: (event: HarnessEvent.Event) => {
      if (event._tag === "TextDelta") {
        const key = draftKey(event.responseId, event.part);
        const draft = drafts.get(key) ?? {
          responseId: event.responseId,
          part: event.part,
          offset: 0,
          pending: "",
        };
        draft.pending += event.delta;
        drafts.set(key, draft);
      } else if (event._tag === "BlockCompleted")
        drafts.delete(draftKey(event.responseId, event.part));
    },
    /** Show readers what was written since the last draft, once the interval has passed. */
    showWhenDue: Effect.gen(function* () {
      if ((yield* Clock.currentTimeMillis) - lastShownAt >= showInterval) yield* showPending;
    }),
  };
};

export * as Drafts from "./drafts.ts";
