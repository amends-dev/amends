import type { Sandbox } from "@amends/sandbox";
import { Effect, Result, Stream } from "effect";
import { Hex } from "effect/encoding";
import type { Harness } from "./harness.ts";

/** UTF-8 bytes, without a platform's text encoder. */
export const bytes = (text: string): Uint8Array => Result.getOrThrow(Hex.decode(Hex.encode(text)));

/** Text from UTF-8 bytes. */
export const text = (data: Uint8Array): string =>
  Result.getOrThrow(Hex.decodeString(Hex.encode(data)));

/** A sandbox for the test's scope, with the harness's options, destroyed when the test ends. */
export const acquire = (
  harness: Harness,
  provider: Sandbox.Provider,
  options?: Sandbox.AcquireOptions,
) =>
  Effect.acquireRelease(provider.acquire({ ...harness.options, ...options }), (acquired) =>
    Effect.ignore(acquired.sandbox.destroy),
  );

/** A process's output, joined per stream. */
export const collect = (process: Sandbox.Process) =>
  process.output.pipe(
    Stream.runFold(
      () => ({ stdout: "", stderr: "" }),
      (collected, output) => ({
        ...collected,
        [output.stream]: collected[output.stream] + output.text,
      }),
    ),
  );

export * as Support from "./support.ts";
