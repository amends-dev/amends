import { BackgroundProcess } from "@amends/core/background";
import { Store } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { ClusterBackground, Gateway, WorkspaceWakes } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { PostgresStorage } from "@amends/storage-postgresql";
import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Exit, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { LocalHost } from "../src/host.ts";
import { setup } from "./database.ts";

const { available, withDatabase } = setup();
const workspaceId = Workspace.Id.make("workspace-one");
const process = BackgroundProcess.Name.make("test.work");

describe.skipIf(!available)("background work on the local host", () => {
  // The host's database and cluster share one client, so Cluster stores a wake on the connection
  // of the commit that asks for it.
  it.live(
    "a wake asked for inside a commit is stored with it, and not if it rolls back",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs: Array<string> = [];
          const unexpected = () => Effect.die("Only background runs are expected");
          const gateway = Gateway.Service.of({
            createWorkspace: unexpected,
            inWorkspace: unexpected,
            asMember: unexpected,
            asMemberScoped: unexpected,
            runBackground: (_, name) =>
              Effect.sync(() => {
                runs.push(name);
                return BackgroundProcess.idle;
              }),
          });
          const context = yield* Layer.build(
            ClusterBackground.layer.pipe(
              Layer.provide(
                Layer.mergeAll(Layer.succeed(Gateway.Service, gateway), BunCrypto.layer),
              ),
              Layer.provideMerge(LocalHost.layerDatabase(Redacted.make(url))),
            ),
          );
          const storage = yield* PostgresStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(workspaceId), Store.Service);
          const wakes = Context.get(context, WorkspaceWakes.Service).forWorkspace(workspaceId);
          const stored = Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql<{ readonly count: number }>`
            SELECT count(*)::int AS count FROM cluster_messages
            WHERE entity_type = 'amends/WorkspaceProcess'`,
          ).pipe(
            Effect.map(([row]) => row?.count ?? 0),
            Effect.orDie,
            Effect.provide(context),
          );
          const rolledBack = yield* Effect.exit(
            store.transaction(wakes.request(process).pipe(Effect.andThen(Effect.fail("abandon")))),
          );
          expect(Exit.isFailure(rolledBack)).toBe(true);
          expect(yield* stored).toBe(0);
          yield* store.transaction(wakes.request(process));
          expect(yield* stored).toBe(1);
          // The committed wake reaches the worker; the rolled-back one never existed.
          yield* Effect.sleep("3 seconds");
          expect(runs).toEqual([process]);
        }).pipe(Effect.scoped),
      ),
    30_000,
  );
});
