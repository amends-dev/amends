import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Logger } from "effect";
import { HarnessServerHost } from "./server.ts";

Layer.launch(HarnessServerHost.layer).pipe(
  Effect.provideService(Logger.LogToStderr, true),
  BunRuntime.runMain,
);
