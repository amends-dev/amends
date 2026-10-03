import type { Sandbox } from "@amends/sandbox";
import { describe, expect, it } from "@effect/vitest";
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem } from "effect";
import { harness } from "./harness.ts";

/** The temporary directory the sandbox's commands get. */
const temporaryOf = (sandbox: Sandbox.Running) =>
  Effect.map(
    sandbox.exec({ argv: ["sh", "-c", 'printf "%s" "$TMPDIR"'] }),
    (result) => result.stdout,
  );

describe("local sandboxes", () => {
  it.effect("each has a temporary directory of its own, removed when it is destroyed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const provider = yield* harness.provider;
      const first = (yield* provider.acquire()).sandbox;
      const second = (yield* provider.acquire()).sandbox;
      const temporary = yield* temporaryOf(first);
      expect(temporary).not.toBe(yield* temporaryOf(second));
      expect(temporary.startsWith(`${first.workdir}/`)).toBe(false);
      yield* first.writeFile(`${temporary}/scratch.txt`, new TextEncoder().encode("x"));
      // Acquired again, it keeps its temporary directory; destroyed, the directory goes too.
      const again = (yield* provider.acquire({ id: first.id })).sandbox;
      expect(yield* temporaryOf(again)).toBe(temporary);
      yield* again.destroy;
      expect(yield* fs.exists(temporary)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
