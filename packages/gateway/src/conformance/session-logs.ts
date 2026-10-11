import { ThreadParticipation } from "@amends-dev/core/thread";
import { type SessionLog, Turn } from "@amends-dev/core/turn";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Result } from "effect";
import { Prompt } from "effect/ai";
import type { Fixture } from "./fixture.ts";
import { forWorkspace, otherWorkspaceId, workspaceId } from "./support.ts";

const participation = ThreadParticipation.Id.make("participation-1");
const turnId = Turn.Id.make("turn-1");
const usage = { inputTokens: { total: 10 }, outputTokens: { total: 5 } };

const joined: SessionLog.Entry = {
  _tag: "Joined",
  conversation: [
    Prompt.makeMessage("user", {
      content: [
        Prompt.makePart("text", { text: "Ada: Hello 👋" }),
        Prompt.makePart("text", { text: "Kai: Hi." }),
      ],
    }),
    Prompt.makeMessage("assistant", {
      content: [Prompt.makePart("text", { text: "Hello, both." })],
    }),
  ],
};
const prompted: SessionLog.Entry = {
  _tag: "Prompted",
  turnId,
  prompt: Prompt.makeMessage("user", {
    content: [Prompt.makePart("text", { text: "Ada: What is 2 and 3?" })],
  }),
  messages: 1,
};
/** A step with tagged parts, tool JSON, and provider metadata, as a harness streams them. */
const step: SessionLog.Entry = {
  _tag: "Step",
  turnId,
  id: "step-1",
  step: {
    parts: [
      {
        type: "reasoning",
        text: "The notes have it.",
        metadata: { anthropic: { signature: "sig" } },
      },
      { type: "text", text: "Reading 📄 the notes." },
      {
        type: "tool-call",
        id: "call-read",
        name: "read",
        params: { path: "notes.md", lines: [1, 2] },
        providerExecuted: true,
      },
      {
        type: "tool-result",
        id: "call-read",
        name: "read",
        result: { text: "2 and 3", found: true },
        isFailure: false,
        providerExecuted: true,
      },
      { type: "file-change", event: "modify", path: "notes.md" },
    ],
    finish: { type: "finish-step", reason: "tool-calls", usage },
  },
};
const started: SessionLog.Entry = {
  _tag: "Started",
  turnId,
  agent: "opencode",
  agentState: { session: "ses_1", turn: { id: "turn-1", bridge: "bridge-1" } },
};
const interrupted: SessionLog.Entry = { _tag: "Interrupted", turnId, reason: "The run stopped." };

/** Each participation's session log: append-only, apart from every commit. */
export const sessionLogs = (fixture: Fixture) => {
  describe.skipIf(!fixture.available)(`${fixture.name}: session logs`, () => {
    it.live(
      "appends entries after the latest, at the next positions, and reads them as recorded",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const { sessionLogs } = yield* forWorkspace(yield* storage.connect(), workspaceId);
            expect(yield* sessionLogs.head(participation)).toBe(0);
            expect(yield* sessionLogs.read(participation, { after: 0, limit: 10 })).toEqual([]);

            const first = yield* sessionLogs.append(participation, [joined, prompted], 0);
            const second = yield* sessionLogs.append(
              participation,
              [started, step, interrupted],
              2,
            );
            expect([...first, ...second].map(({ position, entry }) => [position, entry])).toEqual([
              [1, joined],
              [2, prompted],
              [3, started],
              [4, step],
              [5, interrupted],
            ]);
            expect(yield* sessionLogs.head(participation)).toBe(5);
            // Reads give each entry back as it was recorded, from past a position, a page at a time.
            expect(yield* sessionLogs.read(participation, { after: 0, limit: 10 })).toEqual([
              ...first,
              ...second,
            ]);
            expect(yield* sessionLogs.read(participation, { after: 1, limit: 2 })).toEqual([
              first[1],
              second[0],
            ]);
            expect(yield* sessionLogs.read(participation, { after: 5, limit: 10 })).toEqual([]);
          }),
        ),
    );

    it.live("refuses an append after any position but the latest, taking none of it", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const one = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const other = yield* forWorkspace(yield* storage.connect(), workspaceId);
          yield* one.sessionLogs.append(participation, [prompted], 0);
          for (const after of [0, 2])
            expect(
              yield* Effect.flip(one.sessionLogs.append(participation, [step, interrupted], after)),
            ).toMatchObject({ _tag: "SessionLogStore.Conflict", after });
          expect(yield* one.sessionLogs.head(participation)).toBe(1);

          // Of two writers that read the log to the same entry, one appends and the other is refused.
          const outcomes = yield* Effect.forEach(
            [one, other],
            (bound) =>
              Effect.result(bound.sessionLogs.append(participation, [step, interrupted], 1)),
            { concurrency: "unbounded" },
          );
          expect(outcomes.filter(Result.isSuccess)).toHaveLength(1);
          expect(outcomes.filter(Result.isFailure).map(({ failure }) => failure._tag)).toEqual([
            "SessionLogStore.Conflict",
          ]);
          expect(
            (yield* other.sessionLogs.read(participation, { after: 0, limit: 10 })).map(
              ({ position }) => position,
            ),
          ).toEqual([1, 2, 3]);
        }),
      ),
    );

    it.live("keeps each participation's log apart, and each workspace's", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const host = yield* storage.connect();
          const here = yield* forWorkspace(host, workspaceId);
          const there = yield* forWorkspace(host, otherWorkspaceId);
          const another = ThreadParticipation.Id.make("participation-2");
          yield* here.sessionLogs.append(participation, [prompted, step], 0);
          yield* here.sessionLogs.append(another, [joined], 0);
          yield* there.sessionLogs.append(participation, [interrupted], 0);
          const entriesOf = (bound: typeof here, id: ThreadParticipation.Id) =>
            Effect.map(bound.sessionLogs.read(id, { after: 0, limit: 10 }), (recorded) =>
              recorded.map(({ entry }) => entry._tag),
            );
          expect(yield* entriesOf(here, participation)).toEqual(["Prompted", "Step"]);
          expect(yield* entriesOf(here, another)).toEqual(["Joined"]);
          expect(yield* entriesOf(there, participation)).toEqual(["Interrupted"]);
          expect(yield* entriesOf(there, another)).toEqual([]);
        }),
      ),
    );

    it.live("takes part in no commit: an append in a transaction that rolls back is kept", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const rolledBack = yield* Effect.flip(
            bound.store.transaction(
              Effect.andThen(
                bound.sessionLogs.append(participation, [prompted], 0),
                Effect.fail("rolled back" as const),
              ),
            ),
          );
          expect(rolledBack).toBe("rolled back");
          expect(
            (yield* bound.sessionLogs.read(participation, { after: 0, limit: 10 })).map(
              ({ entry }) => entry,
            ),
          ).toEqual([prompted]);
        }),
      ),
    );

    it.live(
      "a reader waiting for an entry past a position wakes once one lands, from any host",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const writer = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const reader = yield* forWorkspace(yield* storage.connect(), workspaceId);
            yield* writer.sessionLogs.append(participation, [prompted], 0);
            // An entry past the position is there already.
            yield* reader.sessionLogs.waitForAppend(participation, 0);
            const waiting = yield* Effect.forkChild(
              reader.sessionLogs.waitForAppend(participation, 1),
            );
            yield* Effect.sleep("100 millis");
            expect(waiting.pollUnsafe()).toBeUndefined();
            yield* writer.sessionLogs.append(participation, [step], 1);
            yield* Fiber.join(waiting).pipe(Effect.timeout("10 seconds"));
          }),
        ),
    );
  });
};
