import { Clock, Context, Duration, Effect, Layer, Schedule, Stream } from "effect";
import type { Signal } from "../signal/signal.ts";
import { Signals } from "../signal/signals.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import type { TurnId } from "./id.ts";

/** A part of a response a turn is writing, as its drafts told it from the start. */
export interface Draft {
  readonly responseId: string;
  readonly part: number;
  readonly text: string;
}

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * What each part of the turn's responses held so far, as this process heard it from the start.
   * A part this process missed some of is left out.
   */
  readonly current: (turnId: TurnId.Id) => Effect.Effect<ReadonlyArray<Draft>>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/drafts/Service",
) {}

/** How long a turn's drafts are kept after its last one. */
const keep = Duration.minutes(10);

interface Held {
  readonly responseId: string;
  readonly part: number;
  text: string;
  /** Some of it went missing on the way here. */
  broken: boolean;
}

/**
 * Hold the text each turn is writing, as its drafts arrive in this process. A draft carries only
 * what follows the text before it, and reaches each process once, so a reader who starts
 * following a turn's log mid-response would otherwise miss what was written before. Drafts are
 * never stored: this holds them in memory while the workspace is prepared here, and forgets a
 * turn's a while after its last.
 *
 * @category constructors
 */
export const make = Effect.gen(function* () {
  const signals = yield* Signals.Service;
  const turns = new Map<string, { readonly parts: Map<string, Held>; at: number }>();
  const add = (signal: Extract<Signal.Value, { readonly _tag: "TurnDraft" }>, now: number) => {
    const turn = turns.get(signal.turnId) ?? { parts: new Map<string, Held>(), at: now };
    turns.set(signal.turnId, turn);
    turn.at = now;
    const key = `${signal.responseId}\u0000${signal.part}`;
    const held = turn.parts.get(key) ?? {
      responseId: signal.responseId,
      part: signal.part,
      text: "",
      broken: false,
    };
    turn.parts.set(key, held);
    if (held.broken) return;
    // Text already held is not added again; text past a gap cannot be placed.
    if (signal.offset > held.text.length) held.broken = true;
    else if (signal.offset + signal.text.length > held.text.length)
      held.text += signal.text.slice(held.text.length - signal.offset);
  };
  const live = yield* signals.subscribe;
  yield* live.pipe(
    Stream.runForEach((signal) =>
      signal._tag === "TurnDraft"
        ? Effect.map(Clock.currentTimeMillis, (now) => add(signal, now))
        : Effect.void,
    ),
    Effect.forkScoped,
  );
  yield* Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    for (const [turnId, turn] of turns)
      if (now - turn.at > Duration.toMillis(keep)) turns.delete(turnId);
  }).pipe(Effect.repeat(Schedule.spaced("1 minute")), Effect.forkScoped);
  const current: Interface["current"] = (turnId) =>
    Effect.sync(() =>
      [...(turns.get(turnId)?.parts.values() ?? [])].flatMap((held) =>
        held.broken || held.text === ""
          ? []
          : [{ responseId: held.responseId, part: held.part, text: held.text }],
      ),
    );
  return Service.of({ workspaceId: signals.workspaceId, current });
});

/** Internal service for following turns' logs. @category layers */
export const layer = Layer.effect(Service, make);

export * as TurnDrafts from "./drafts.ts";
