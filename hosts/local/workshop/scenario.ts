import { SignIn } from "@amends/gateway";
import { database } from "@amends/storage-postgresql/testing/postgres";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Clock, Context, Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { DevelopmentSignIn } from "../src/authentication/sign-in.ts";
import { DevelopmentCredentials } from "../src/authentication/credentials.ts";

/** Development controls wrap the real host; they are never registered by LocalServer. */
const make = Effect.fn("Workshop.make")(function* (serverUrl: string) {
  const url = yield* database(serverUrl);
  const delivered: Array<{ email: string; code: string }> = [];
  let offset = 0;
  const clock = yield* Clock.Clock;
  const now = () => clock.currentTimeMillisUnsafe() + offset;
  const authClock: Clock.Clock = {
    currentTimeMillisUnsafe: now,
    currentTimeMillis: Effect.sync(now),
    currentTimeNanosUnsafe: () => BigInt(now()) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(now()) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: clock.monotonicTimeNanos,
    sleep: (duration) => clock.sleep(duration),
  };
  const authentication = Layer.effect(
    SignIn.Service,
    Effect.gen(function* () {
      const service = yield* DevelopmentSignIn.make((email, code) =>
        Effect.sync(() => {
          delivered.push({ email, code });
        }),
      );
      return SignIn.Service.of({
        start: (email) => service.start(email).pipe(Effect.provideService(Clock.Clock, authClock)),
        complete: (email, code) =>
          service.complete(email, code).pipe(Effect.provideService(Clock.Clock, authClock)),
      });
    }),
  ).pipe(Layer.provide(BunCrypto.layer));
  const app = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        LocalServer.layerRoutes.pipe(
          Layer.provide(
            Layer.mergeAll(
              LocalHost.layer(Redacted.make(url)),
              authentication,
              DevelopmentCredentials.layer,
            ),
          ),
          Layer.provide(BunHttpServer.layerHttpServices),
        ),
        { disableLogger: true },
      ),
    ),
    ({ dispose }) => Effect.promise(dispose),
  );
  // A real directory request eagerly builds the host before publishing this fixture.
  yield* Effect.promise(() => app.handler(new Request("http://localhost/me/workspaces")));
  let next: "hold" | "fail" | undefined;
  let failDirectory = false;
  let loseCreationResponse = false;
  let release: (() => void) | undefined;
  let requests = 0;
  let completed = 0;
  let cancelled = 0;
  yield* Effect.addFinalizer(() => Effect.sync(() => release?.()));
  return {
    snapshot: () => ({
      delivered: [...delivered],
      requests,
      completed,
      cancelled,
      held: !!release,
    }),
    command: (
      command: "expire" | "hold" | "fail" | "release" | "fail-directory" | "lose-creation-response",
    ) => {
      if (command === "expire") offset += 600_001;
      else if (command === "fail-directory") failDirectory = true;
      else if (command === "lose-creation-response") loseCreationResponse = true;
      else if (command === "release") release?.();
      else next = command;
    },
    handle: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/me/workspaces" && failDirectory) {
        failDirectory = false;
        return new Response("Workshop directory failure", { status: 503 });
      }
      if (
        path === "/session/email" ||
        path === "/session/code" ||
        path === "/workspaces" ||
        path === "/me/workspaces"
      ) {
        requests++;
        const action = next;
        next = undefined;
        if (action === "fail") return new Response("Workshop request failure", { status: 503 });
        if (action === "hold") {
          await new Promise<void>((resolve) => {
            const finish = () => {
              request.signal.removeEventListener("abort", finish);
              release = undefined;
              resolve();
            };
            release = finish;
            request.signal.addEventListener("abort", finish, { once: true });
            if (request.signal.aborted) finish();
          });
          if (request.signal.aborted) {
            cancelled++;
            return new Response(null, { status: 499 });
          }
        }
      }
      const response = await app.handler(request);
      completed++;
      if (path === "/workspaces" && request.method === "POST" && loseCreationResponse) {
        loseCreationResponse = false;
        await response.arrayBuffer();
        return new Response("Workshop lost creation response", { status: 503 });
      }
      return response;
    },
  };
});

class Scenario extends Context.Service<Scenario, Effect.Success<ReturnType<typeof make>>>()(
  "amends/workshop/Scenario",
) {}

export const openScenario = async (serverUrl: string) => {
  const runtime = ManagedRuntime.make(Layer.effect(Scenario, make(serverUrl)));
  try {
    return { ...(await runtime.runPromise(Scenario)), dispose: () => runtime.dispose() };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
};
