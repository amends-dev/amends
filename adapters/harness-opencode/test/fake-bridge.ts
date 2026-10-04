// A bridge over a stand-in agent, served as opencode's bridge program serves its agent, which
// `bridge.test.ts` has the bridge client launch, as the command that runs a bridge. A turn follows
// its prompt: `reply <text>` answers `text`, and `wait <text>` starts to answer `text` and finishes
// once the session's directory has a file named `release`. A session's state counts the turns it
// has run, on from the state it started with. Each launch adds a line to `launches.jsonl` in the
// bridge's working directory, with its process id, its agent's options, and whether its environment
// holds the token, and destroying a session writes `destroyed-<session>` there.
import { type Bridge, BridgeServer, type StreamPart } from "@amends/harness-v2";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Option, Path, Ref, Schedule, Schema, Stream } from "effect";
import * as BunBridge from "../src/bridge/BunBridge.ts";

/** A session's state: the turns it has run. */
const State = Schema.Struct({ turns: Schema.Int });

/** The parts of a turn that answers `text` in one step. */
const answer = (text: string): ReadonlyArray<StreamPart.StreamPart> => [
  { type: "text-start", id: "answer" },
  { type: "text-delta", id: "answer", delta: text },
  { type: "text-end", id: "answer" },
  { type: "finish-step", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
  { type: "finish", reason: "stop", usage: { inputTokens: {}, outputTokens: {} } },
];

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const launch = yield* BridgeServer.readLaunchOptions;
  yield* fs.writeFileString(
    "launches.jsonl",
    `${JSON.stringify({
      pid: process.pid,
      agentOptions: launch.agentOptions,
      tokenInEnvironment: Object.values(process.env).includes(launch.token),
    })}\n`,
    { flag: "a" },
  );

  const agent: Bridge.Agent = {
    id: "fake",
    start: (options) =>
      Effect.gen(function* () {
        const turns = yield* Ref.make(
          Option.match(Schema.decodeUnknownOption(State)(options.agentState), {
            onNone: () => 0,
            onSome: (state) => state.turns,
          }),
        );
        const session: Bridge.AgentSession = {
          prompt: (turn) => {
            const text = turn.prompt.content
              .flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join("");
            const [command = "", ...words] = text.split(" ");
            const parts = answer(words.join(" "));
            const released = fs.exists(path.join(options.directory, "release")).pipe(
              Effect.repeat({
                until: (exists) => exists,
                schedule: Schedule.spaced("20 millis"),
              }),
              Effect.orDie,
            );
            const turnParts =
              command === "wait"
                ? Stream.concat(
                    Stream.fromIterable(parts.slice(0, 1)),
                    Stream.unwrap(Effect.as(released, Stream.fromIterable(parts.slice(1)))),
                  )
                : Stream.fromIterable(parts);
            return Stream.unwrap(
              Effect.as(
                Ref.update(turns, (count) => count + 1),
                turnParts,
              ),
            );
          },
          submitToolResult: () => Effect.void,
          approve: () => Effect.void,
          compact: () => Effect.void,
          state: Effect.map(Ref.get(turns), (count) => State.make({ turns: count })),
          destroy: Effect.orDie(fs.writeFileString(`destroyed-${options.id}`, "")),
        };
        return session;
      }),
  };

  return yield* BunBridge.serve(agent, launch);
});

BunRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(BunServices.layer)));
