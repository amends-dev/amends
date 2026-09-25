import { acquire } from "@amends/storage-postgresql/testing/postgres";
import { BunRuntime } from "@effect/platform-bun";
import { Effect, Schema } from "effect";
import { openScenario } from "./scenario.ts";

const Command = Schema.Literals([
  "expire",
  "hold",
  "fail",
  "release",
  "fail-directory",
  "lose-creation-response",
  "lose-invitation-response",
  "drop-changes",
  "break-directory",
  "restore-directory",
]);

BunRuntime.runMain(
  Effect.gen(function* () {
    const postgres = yield* Effect.acquireRelease(Effect.promise(acquire), (server) =>
      Effect.promise(async () => {
        await server?.stop();
      }),
    );
    if (!postgres)
      return yield* Effect.die(
        "The feature workshop requires PostgreSQL. Install it or set AMENDS_POSTGRES_URL.",
      );
    const scenarios = new Map<string, Awaited<ReturnType<typeof openScenario>>>();
    const opening = new Set<Promise<unknown>>();
    let stopping = false;
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        stopping = true;
        await Promise.allSettled(opening);
        await Promise.all([...scenarios.values()].map((scenario) => scenario.dispose()));
      }),
    );
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          maxRequestBodySize: 16_384,
          async fetch(request) {
            const url = new URL(request.url);
            // Only same-origin/proxied workshop requests, never cross-site control requests.
            if (request.headers.get("sec-fetch-site") === "cross-site")
              return new Response(null, { status: 403 });
            if (url.pathname === "/__workshop/scenarios" && request.method === "POST") {
              if (stopping || scenarios.size + opening.size >= 12)
                return new Response(null, { status: 503 });
              const pending = openScenario(postgres.url);
              opening.add(pending);
              try {
                const scenario = await pending;
                const id = crypto.randomUUID();
                scenarios.set(id, scenario);
                return Response.json({ path: `/__workshop/scenarios/${id}` });
              } finally {
                opening.delete(pending);
              }
            }
            const match = /^\/__workshop\/scenarios\/([^/]+)(\/.*)?$/.exec(url.pathname);
            const id = match?.[1];
            const scenario = id ? scenarios.get(id) : undefined;
            if (!scenario || !id) return new Response(null, { status: 404 });
            const rest = match?.[2];
            if (!rest && request.method === "GET") return Response.json(scenario.snapshot());
            if (!rest && request.method === "DELETE") {
              scenarios.delete(id);
              await scenario.dispose();
              return new Response(null, { status: 204 });
            }
            if (rest === "/control" && request.method === "POST") {
              const command: unknown = await request.json();
              if (!Schema.is(Command)(command)) return new Response(null, { status: 400 });
              scenario.command(command);
              return Response.json(scenario.snapshot());
            }
            if (rest?.startsWith("/api/")) {
              url.pathname = rest.slice(4);
              return scenario.handle(new Request(url.toString(), request));
            }
            return new Response(null, { status: 404 });
          },
        }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    );
    yield* Effect.logInfo(`Workshop listening on http://127.0.0.1:${server.port}`);
    return yield* Effect.never;
  }).pipe(Effect.scoped),
);
