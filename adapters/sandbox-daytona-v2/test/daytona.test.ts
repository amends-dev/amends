import { DaytonaSandboxProvider } from "@amends/sandbox-daytona-v2";
import type { Network, Sandbox, SandboxProvider } from "@amends/sandbox-v2";
import { Daytona } from "@daytona/sdk";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, layer } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { ChildProcess } from "effect/process";

/**
 * What the Daytona provider does beyond the conformance suites: what it asks of Daytona, and the
 * network policies Daytona enforces. These create real sandboxes too, so they run only with
 * `AMENDS_TEST_DAYTONA=1` and `DAYTONA_API_KEY`.
 */
const apiKey = Redacted.make(process.env.DAYTONA_API_KEY ?? "");
const timeout = 120_000;

/** A sandbox `provider` creates, destroyed when the test ends. */
const createSandbox = (provider: SandboxProvider.SandboxProvider["Service"]) =>
  Effect.acquireRelease(provider.create(), (sandbox) => Effect.ignore(sandbox.destroy));

/** Whether a request from inside `sandbox` reaches `host` over HTTPS within five seconds. */
const reaches = (sandbox: Sandbox.Sandbox["Service"], host: string) =>
  Effect.map(
    sandbox.childProcessSpawner.exitCode(
      ChildProcess.make("curl", ["-sS", "-o", "/dev/null", "-m", "5", `https://${host}`]),
    ),
    (exitCode) => exitCode === 0,
  );

const reachable = (sandbox: Sandbox.Sandbox["Service"]) =>
  Effect.all(
    { example: reaches(sandbox, "example.com"), npm: reaches(sandbox, "registry.npmjs.org") },
    { concurrency: "unbounded" },
  );

const allowList = (
  allowedHosts: ReadonlyArray<string>,
  allowedCidrs: ReadonlyArray<string> = [],
  deniedCidrs: ReadonlyArray<string> = [],
): Network.NetworkPolicy => ({ _tag: "AllowList", allowedHosts, allowedCidrs, deniedCidrs });

describe.skipIf(
  process.env.AMENDS_TEST_DAYTONA !== "1" || process.env.DAYTONA_API_KEY === undefined,
)("DaytonaSandboxProvider", () => {
  layer(BunServices.layer, { excludeTestServices: true })("in Daytona's cloud", (it) => {
    it.effect(
      "never stops a sandbox on its own, unless the options give an interval",
      () =>
        Effect.gen(function* () {
          const daytona = yield* Effect.acquireDisposable(
            Effect.sync(() => new Daytona({ apiKey: Redacted.value(apiKey) })),
          );
          const lasting = yield* createSandbox(yield* DaytonaSandboxProvider.make({ apiKey }));
          const stopping = yield* createSandbox(
            yield* DaytonaSandboxProvider.make({ apiKey, autoStopInterval: 30 }),
          );

          const intervalOf = (sandbox: Sandbox.Sandbox["Service"]) =>
            Effect.map(
              Effect.promise(() => daytona.get(sandbox.id)),
              (found) => found.autoStopInterval,
            );

          expect(yield* intervalOf(lasting)).toBe(0);
          expect(yield* intervalOf(stopping)).toBe(30);
        }),
      timeout,
    );

    it.effect(
      "enforces each network policy as soon as it is set, in place of the one before",
      () =>
        Effect.gen(function* () {
          const sandbox = yield* createSandbox(yield* DaytonaSandboxProvider.make({ apiKey }));

          yield* sandbox.setNetworkPolicy({ _tag: "DenyAll" });
          expect(yield* reachable(sandbox)).toEqual({ example: false, npm: false });

          yield* sandbox.setNetworkPolicy(allowList(["example.com"]));
          expect(yield* reachable(sandbox)).toEqual({ example: true, npm: false });

          yield* sandbox.setNetworkPolicy({ _tag: "AllowAll" });
          expect(yield* reachable(sandbox)).toEqual({ example: true, npm: true });
        }),
      timeout,
    );

    it.effect(
      "fails with UnsupportedError for an allow list of both hosts and ranges, or one that denies",
      () =>
        Effect.gen(function* () {
          const sandbox = yield* createSandbox(yield* DaytonaSandboxProvider.make({ apiKey }));

          const both = yield* Effect.flip(
            sandbox.setNetworkPolicy(allowList(["example.com"], ["1.1.1.1/32"])),
          );
          const denying = yield* Effect.flip(
            sandbox.setNetworkPolicy(allowList([], ["10.0.0.0/8"], ["10.0.0.1/32"])),
          );

          expect(both.reason._tag).toBe("UnsupportedError");
          expect(denying.reason._tag).toBe("UnsupportedError");
        }),
      timeout,
    );

    it.effect(
      "destroys a sandbox that several callers destroy at once",
      () =>
        Effect.gen(function* () {
          const provider = yield* DaytonaSandboxProvider.make({ apiKey });
          const sandbox = yield* createSandbox(provider);

          yield* Effect.all([sandbox.destroy, sandbox.destroy, sandbox.destroy], {
            concurrency: "unbounded",
          });

          expect((yield* Effect.flip(provider.resume(sandbox.id))).reason._tag).toBe(
            "NotFoundError",
          );
        }),
      timeout,
    );
  });
});
