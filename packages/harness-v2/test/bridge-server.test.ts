import { describe, expect, it } from "@effect/vitest";
import { type Cause, Effect, Exit, FileSystem, Layer, Path, Queue, Scope, Stream } from "effect";
import { Prompt } from "effect/ai";
import { RpcTest } from "effect/rpc";
import { SessionId } from "../src/Agent.ts";
import * as Bridge from "../src/Bridge.ts";
import * as BridgeServer from "../src/BridgeServer.ts";
import { HarnessError, UnavailableError } from "../src/HarnessError.ts";
import type { StreamPart } from "../src/StreamPart.ts";
import { makeFakeBridgeAgent, makeMemoryFileSystem, reply } from "./fakes.ts";

const session = SessionId.make("session-1");
const firstTurn = Bridge.TurnId.make("turn-1");
const secondTurn = Bridge.TurnId.make("turn-2");

const startOptions = { session, directory: "/work/session-1", history: Prompt.empty };

const turnOptions = (text: string): Bridge.TurnOptions => ({
  prompt: Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text })] }),
  tools: [],
  responseFormat: { type: "text" },
});

const numbered = (parts: ReadonlyArray<StreamPart>, from = 1) =>
  parts.map((part, index) => ({ seq: from + index, part }));

/**
 * Starts a bridge for `agent` that keeps its turns in `fileSystem` and runs until `scope` closes,
 * returning a host's client of it.
 */
const startBridge = (agent: Bridge.Agent, fileSystem: FileSystem.FileSystem, scope: Scope.Scope) =>
  Effect.gen(function* () {
    const handlers = yield* Layer.buildWithScope(
      BridgeServer.layerHandlers(agent, { stateDirectory: "/state" }).pipe(
        Layer.provide(Layer.merge(Layer.succeed(FileSystem.FileSystem, fileSystem), Path.layer)),
      ),
      scope,
    );
    return yield* RpcTest.makeClient(Bridge.Rpcs).pipe(Effect.provideContext(handlers));
  });

/** A bridge over a fake agent whose turns stream what the test offers to `parts`, until it ends. */
const setUp = Effect.gen(function* () {
  const parts = yield* Queue.unbounded<StreamPart, HarnessError | Cause.Done>();
  const fake = yield* makeFakeBridgeAgent(() => Stream.fromQueue(parts));
  const { fileSystem, files } = yield* makeMemoryFileSystem;
  const bridgeScope = yield* Scope.make();
  const client = yield* startBridge(fake.agent, fileSystem, bridgeScope);
  return { parts, fake, fileSystem, files, bridgeScope, client };
});

describe("BridgeServer", () => {
  it.effect("streams a turn's parts, numbered, until its last", () =>
    Effect.gen(function* () {
      const { parts, client } = yield* setUp;
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offerAll(parts, reply("hello"));
      yield* Queue.end(parts);

      const read = yield* Stream.runCollect(
        client.ReadTurn({ session, turn: firstTurn, after: 0 }),
      );

      expect(read).toEqual(numbered(reply("hello")));
    }),
  );

  it.effect("keeps a turn running without readers, for one that reads on after its last part", () =>
    Effect.gen(function* () {
      const { parts, fake, client } = yield* setUp;
      const answer = reply("hello");
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offerAll(parts, answer.slice(0, 2));
      const first = yield* client
        .ReadTurn({ session, turn: firstTurn, after: 0 })
        .pipe(Stream.take(2), Stream.runCollect);

      yield* Queue.offerAll(parts, answer.slice(2));
      yield* Queue.end(parts);
      const rest = yield* Stream.runCollect(
        client.ReadTurn({ session, turn: firstTurn, after: 2 }),
      );

      expect(first).toEqual(numbered(answer.slice(0, 2)));
      expect(rest).toEqual(numbered(answer.slice(2), 3));
      expect(fake.turnEnds).toEqual(["finished"]);
    }),
  );

  it.effect("starts a turn once when asked again, and no other while it runs", () =>
    Effect.gen(function* () {
      const { parts, fake, client } = yield* setUp;
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      const refused = yield* Effect.flip(
        client.StartTurn({ session, turn: secondTurn, options: turnOptions("again") }),
      );
      yield* Queue.offerAll(parts, reply("hello"));
      yield* Queue.end(parts);
      yield* Stream.runDrain(client.ReadTurn({ session, turn: firstTurn, after: 0 }));
      expect(refused.reason._tag).toBe("TurnInProgressError");
      expect(fake.turns).toHaveLength(1);

      yield* client.StartTurn({ session, turn: secondTurn, options: turnOptions("again") });
      yield* Stream.runDrain(client.ReadTurn({ session, turn: secondTurn, after: 0 }));
      const forgotten = yield* Effect.flip(
        Stream.runDrain(client.ReadTurn({ session, turn: firstTurn, after: 0 })),
      );

      expect(fake.turns).toHaveLength(2);
      expect(forgotten.reason._tag).toBe("NoTurnError");
    }),
  );

  it.effect("aborts a turn, ending its readers, and leaves no turn to continue", () =>
    Effect.gen(function* () {
      const { parts, fake, client } = yield* setUp;
      const answer = reply("hello");
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offerAll(parts, answer.slice(0, 2));
      yield* client
        .ReadTurn({ session, turn: firstTurn, after: 0 })
        .pipe(Stream.take(2), Stream.runDrain);

      yield* client.AbortTurn({ session, turn: firstTurn });
      const read = yield* Stream.runCollect(
        client.ReadTurn({ session, turn: firstTurn, after: 0 }),
      );
      const { hasUnfinishedTurn } = yield* client.StartSession({
        ...startOptions,
        unfinishedTurn: firstTurn,
      });

      expect(read).toEqual(numbered(answer.slice(0, 2)));
      expect(fake.turnEnds).toEqual(["interrupted"]);
      expect(hasUnfinishedTurn).toBe(false);
    }),
  );

  it.effect("fails a turn's readers with the agent's error, after its parts", () =>
    Effect.gen(function* () {
      const { parts, fake, client } = yield* setUp;
      const error = new HarnessError({
        agent: "fake",
        reason: new UnavailableError({ description: "The model is down" }),
      });
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offer(parts, { type: "text-start", id: "answer" });
      yield* Queue.fail(parts, error);

      const read = client.ReadTurn({ session, turn: firstTurn, after: 0 });
      const first = yield* read.pipe(Stream.take(1), Stream.runCollect);
      const failure = yield* Effect.flip(Stream.runDrain(read));

      expect(first).toEqual(numbered([{ type: "text-start", id: "answer" }]));
      expect(failure).toEqual(error);
      expect(fake.turnEnds).toEqual(["failed"]);
    }),
  );

  it.effect("reads a turn that finished from its file once the bridge starts again", () =>
    Effect.gen(function* () {
      const { parts, fake, fileSystem, bridgeScope, client } = yield* setUp;
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offerAll(parts, reply("hello"));
      yield* Queue.end(parts);
      yield* Stream.runDrain(client.ReadTurn({ session, turn: firstTurn, after: 0 }));
      const agentState = yield* client.ReadState({ session });
      yield* Scope.close(bridgeScope, Exit.void);
      expect(fake.ended).toEqual([session]);

      const restarted = yield* startBridge(fake.agent, fileSystem, yield* Scope.make());
      const { hasUnfinishedTurn } = yield* restarted.StartSession({
        ...startOptions,
        agentState,
        unfinishedTurn: firstTurn,
      });
      const read = yield* Stream.runCollect(
        restarted.ReadTurn({ session, turn: firstTurn, after: 0 }),
      );

      expect(fake.starts[1]?.agentState).toEqual({ session, start: 1 });
      expect(hasUnfinishedTurn).toBe(true);
      expect(read).toEqual(numbered(reply("hello")));
    }),
  );

  it.effect("loses a turn it was running when it exited", () =>
    Effect.gen(function* () {
      const { parts, fake, fileSystem, bridgeScope, client } = yield* setUp;
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offer(parts, { type: "text-start", id: "answer" });
      yield* client
        .ReadTurn({ session, turn: firstTurn, after: 0 })
        .pipe(Stream.take(1), Stream.runDrain);
      yield* Scope.close(bridgeScope, Exit.void);

      const restarted = yield* startBridge(fake.agent, fileSystem, yield* Scope.make());
      const { hasUnfinishedTurn } = yield* restarted.StartSession({
        ...startOptions,
        unfinishedTurn: firstTurn,
      });

      expect(fake.turnEnds).toEqual(["interrupted"]);
      expect(hasUnfinishedTurn).toBe(false);
    }),
  );

  it.effect("takes up a session it runs instead of starting it again", () =>
    Effect.gen(function* () {
      const { fake, client } = yield* setUp;

      yield* client.StartSession(startOptions);
      yield* client.StartSession(startOptions);

      expect(fake.starts).toHaveLength(1);
    }),
  );

  it.effect("gives the session a host's tool result", () =>
    Effect.gen(function* () {
      const { fake, client } = yield* setUp;
      yield* client.StartSession(startOptions);

      yield* client.SubmitToolResult({
        session,
        result: { id: "call-1", name: "Add", result: 5, isFailure: false },
      });

      expect(fake.submitted).toEqual([5]);
    }),
  );

  it.effect("stops a session, aborting its turn and answering its state", () =>
    Effect.gen(function* () {
      const { parts, fake, client } = yield* setUp;
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offer(parts, { type: "text-start", id: "answer" });
      yield* client
        .ReadTurn({ session, turn: firstTurn, after: 0 })
        .pipe(Stream.take(1), Stream.runDrain);

      const state = yield* client.StopSession({ session });
      const afterStop = yield* Effect.flip(client.ReadState({ session }));

      expect(state).toEqual({ session, start: 1 });
      expect(fake.turnEnds).toEqual(["interrupted"]);
      expect(fake.ended).toEqual([session]);
      expect(afterStop.reason._tag).toBe("NotFoundError");
    }),
  );

  it.effect("destroys a session and the turns it kept", () =>
    Effect.gen(function* () {
      const { parts, fake, files, client } = yield* setUp;
      yield* client.StartSession(startOptions);
      yield* client.StartTurn({ session, turn: firstTurn, options: turnOptions("hi") });
      yield* Queue.offerAll(parts, reply("hello"));
      yield* Queue.end(parts);
      yield* Stream.runDrain(client.ReadTurn({ session, turn: firstTurn, after: 0 }));
      expect([...files.keys()]).toEqual(["/state/session-1/turn-1.jsonl"]);

      yield* client.DestroySession({ session });

      expect(fake.destroyed).toEqual([session]);
      expect(fake.ended).toEqual([session]);
      expect(files.size).toBe(0);
    }),
  );
});
