// A bridge over a stand-in agent, served as opencode's bridge program serves its agent, which
// `bridge.test.ts` has the bridge client launch, as the command that runs a bridge. A turn follows
// its prompt: `reply <text>` answers `text`, and `wait <text>` starts to answer `text` and finishes
// once the session's directory has a file named `release`. Each launch adds a line to
// `launches.jsonl` in the bridge's working directory, with its agent's options and whether its
// environment holds the token, and destroying a session writes `destroyed-<session>` there.
import { type Bridge, BridgeServer, type StreamPart } from "@amends/harness-v2";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Path, Schedule, Stream } from "effect";
import * as BunBridge from "../src/bridge/BunBridge.ts";

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
      agentOptions: launch.agentOptions,
      tokenInEnvironment: Object.values(process.env).includes(launch.token),
    })}\n`,
    { flag: "a" },
  );

  const agent: Bridge.Agent = {
    id: "fake",
    start: (options) =>
      Effect.succeed({
        prompt: (turn) => {
          const text = turn.prompt.content
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("");
          const [command = "", ...words] = text.split(" ");
          const parts = answer(words.join(" "));
          if (command !== "wait") return Stream.fromIterable(parts);
          const released = fs
            .exists(path.join(options.directory, "release"))
            .pipe(
              Effect.repeat({ until: (exists) => exists, schedule: Schedule.spaced("20 millis") }),
              Effect.orDie,
            );
          return Stream.concat(
            Stream.fromIterable(parts.slice(0, 1)),
            Stream.unwrap(Effect.as(released, Stream.fromIterable(parts.slice(1)))),
          );
        },
        submitToolResult: () => Effect.void,
        approve: () => Effect.void,
        compact: () => Effect.void,
        state: Effect.succeed({ directory: options.directory }),
        destroy: Effect.orDie(fs.writeFileString(`destroyed-${options.id}`, "")),
      }),
  };

  return yield* BunBridge.serve(agent, launch);
});

BunRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(BunServices.layer)));
