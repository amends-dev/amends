import { HarnessEvent, Transcript } from "@amends/harness";
import type { Harness } from "@amends/harness";
import { Effect, Stream } from "effect";
import type { Script, Subject } from "./subject.ts";

export const alice: Transcript.Author = { id: "alice", name: "Alice" };

export const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: alice,
  content: [{ _tag: "Text", text }],
});

export const batch = (id: string, text: string): HarnessEvent.InputBatch => ({
  id: HarnessEvent.BatchId.make(id),
  items: [input(text)],
});

export const response = (
  id: string,
  ...parts: ReadonlyArray<Transcript.ResponsePart>
): Transcript.Response => ({ _tag: "Response", id: Transcript.ResponseId.make(id), parts });

export const text = (value: string): Transcript.ResponsePart => ({ _tag: "Text", text: value });

/** A session of the subject's harness over a model following `script`, for the test's scope. */
export const start = Effect.fnUntraced(function* <R>(
  subject: Subject<R>,
  script: Script,
  options: Partial<Harness.StartOptions> = {},
) {
  const harness = yield* subject.harness;
  const model = yield* subject.model(script);
  const session = yield* harness
    .start({ sessionId: "s1", ...options })
    .pipe(Effect.provide(model.layer));
  return { harness, session, requests: model.requests };
});

/** What a session reports until it is idle. */
export const untilIdle = (session: Harness.Session) =>
  session.events.pipe(Stream.takeUntil(HarnessEvent.Event.isAnyOf(["Idle"])), Stream.runCollect);

/** The kinds of events, without deltas, whose number and split vary by harness and model. */
export const kinds = (events: ReadonlyArray<HarnessEvent.Event>) =>
  events.filter((event) => !HarnessEvent.isDelta(event)).map((event) => event._tag);

/** The text of each response the events finished, in order. */
export const answers = (events: ReadonlyArray<HarnessEvent.Event>) =>
  HarnessEvent.transcript(events).flatMap((item) =>
    item._tag === "Response" ? [HarnessEvent.textOf(item.parts).trim()] : [],
  );

export * as Support from "./support.ts";
