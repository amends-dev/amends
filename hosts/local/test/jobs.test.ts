import { Commit, Store } from "@amends/core/journal";
import { AgentJobs, AgentWork } from "@amends/core/turn";
import { Member, Workspace } from "@amends/core/workspace";
import { AgentJob } from "@amends/cluster";
import { Gateway, type GatewayErrors } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { PostgresStorage } from "@amends/storage-postgresql";
import { describe, expect, it } from "@effect/vitest";
import { Clock, Context, Duration, Effect, Exit, Layer, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { LocalHost } from "../src/host.ts";
import { setup } from "./database.ts";

const { available, withDatabase } = setup();
const workspaceId = Workspace.Id.make("workspace-one");
const agent = Member.Id.make("agent-member");

/** A gateway that only does agents' work, telling `ran` whose work it did, and where. */
const agentWorkOnly = (ran: (workspaceId: Workspace.Id, memberId: Member.Id) => void) => {
  const unexpected = () => Effect.die("Only agents' work is expected");
  return Gateway.Service.of({
    createWorkspace: unexpected,
    asMember: unexpected,
    inWorkspace: <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, unknown>) => {
      const record = (memberId: Member.Id) => Effect.sync(() => ran(id, memberId));
      return Effect.provideService(
        program as Effect.Effect<A, GatewayErrors.PublicErrorOf<E>, AgentWork.Service>,
        AgentWork.Service,
        AgentWork.Service.of({ acceptWork: record, stopDepartedTurns: record }),
      );
    },
  });
};

describe.skipIf(!available)("jobs on the local host", () => {
  // The host's database and cluster share one client, so Cluster stores a request on the connection
  // of the commit that asks for it.
  it.live(
    "a request asked for inside a commit is stored with it, and not if it rolls back",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs: Array<Member.Id> = [];
          const gateway = agentWorkOnly((_, memberId) => runs.push(memberId));
          const context = yield* Layer.build(
            AgentJob.layer.pipe(
              Layer.provide(
                Layer.mergeAll(Layer.succeed(Gateway.Service, gateway), BunCrypto.layer),
              ),
              Layer.provideMerge(LocalHost.layerDatabase(Redacted.make(url))),
            ),
          );
          const storage = yield* PostgresStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(workspaceId), Store.Service);
          const agentJobs = Context.get(context, AgentJobs.Service);
          const stored = Effect.flatMap(
            SqlClient.SqlClient,
            (sql) => sql<{ readonly count: number }>`
            SELECT count(*)::int AS count FROM cluster_messages
            WHERE entity_type = 'amends/AgentJob'`,
          ).pipe(
            Effect.map(([row]) => row?.count ?? 0),
            Effect.orDie,
            Effect.provide(context),
          );
          const rolledBack = yield* Effect.exit(
            store.transaction(
              agentJobs
                .requestAcceptWork({ workspaceId, memberId: agent })
                .pipe(Effect.andThen(Effect.fail("abandon"))),
            ),
          );
          expect(Exit.isFailure(rolledBack)).toBe(true);
          expect(yield* stored).toBe(0);
          yield* store.transaction(agentJobs.requestAcceptWork({ workspaceId, memberId: agent }));
          expect(yield* stored).toBe(1);
          // The committed request reaches the worker; the rolled-back one never existed.
          yield* Effect.sleep("3 seconds");
          expect(runs).toEqual([agent]);
        }).pipe(Effect.scoped),
      ),
    30_000,
  );

  // Cluster looks for a request as it stores it, before the commit can show it. Once the commit is
  // done the runner reads again, so the request does not wait for its next poll, here a minute away.
  it.live(
    "a committed request runs at once, not at the runner's next poll",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          let runs = 0;
          const gateway = agentWorkOnly(() => {
            runs += 1;
          });
          const context = yield* Layer.build(
            AgentJob.layer.pipe(
              Layer.provide(
                Layer.mergeAll(Layer.succeed(Gateway.Service, gateway), BunCrypto.layer),
              ),
              Layer.provideMerge(
                LocalHost.layerDatabase(Redacted.make(url), { pollInterval: "1 minute" }),
              ),
            ),
          );
          const storage = yield* PostgresStorage.make().pipe(Effect.provide(context));
          const store = Context.get(yield* storage.forWorkspace(workspaceId), Store.Service);
          const agentJobs = Context.get(context, AgentJobs.Service);
          // A commit goes on after it makes a request, as a real one does with its later facts
          // and staged writes, so Cluster's own look comes before the request is there to find.
          for (let commit = 1; commit <= 5; commit++) {
            yield* store.transaction(
              agentJobs
                .requestAcceptWork({ workspaceId, memberId: agent })
                .pipe(Effect.andThen(Effect.sleep("100 millis"))),
            );
            const committedAt = yield* Clock.currentTimeMillis;
            while (runs < commit) {
              if ((yield* Clock.currentTimeMillis) - committedAt > 5_000)
                return expect.fail(`Request ${commit} waited for the runner's next poll`);
              yield* Effect.sleep("10 millis");
            }
          }
          expect(runs).toBe(5);
        }).pipe(Effect.scoped),
      ),
    60_000,
  );

  it.effect("a process refuses to start at a runner address another process holds", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const at = (port: number) =>
          LocalHost.layerDatabase(Redacted.make(url), {
            runnerAddress: { host: "localhost", port },
          });
        yield* Layer.build(at(34461));
        expect(yield* Effect.flip(Effect.scoped(Layer.build(at(34461))))).toMatchObject({
          _tag: "PostgresClusterStorage.AddressTaken",
          address: "localhost:34461",
        });
        // A process at its own address runs beside it.
        yield* Effect.scoped(Layer.build(at(34462)));
      }).pipe(Effect.scoped),
    ),
  );

  // Two processes over one database, linked by sockets: a request for a workspace the other process
  // runs reaches it at once, well before its next read of the database.
  it.live(
    "over sockets, a request reaches the process that runs its workspace without waiting for a read",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const runs: Array<{ readonly runner: string; readonly key: string }> = [];
          const runner = (name: string, port: number) =>
            AgentJob.layer.pipe(
              Layer.provide(
                Layer.mergeAll(
                  Layer.succeed(
                    Gateway.Service,
                    agentWorkOnly((id) => runs.push({ runner: name, key: id })),
                  ),
                  BunCrypto.layer,
                ),
              ),
              Layer.provideMerge(
                LocalHost.layerDatabase(Redacted.make(url), {
                  runnerAddress: { host: "localhost", port },
                  runnerTransport: "socket",
                  pollInterval: "5 seconds",
                }),
              ),
            );
          const first = yield* Layer.build(runner("first", 34471));
          yield* Layer.build(runner("second", 34472));
          const agentJobs = Context.get(first, AgentJobs.Service);
          const workspaces = Array.from({ length: 20 }, (_, index) =>
            Workspace.Id.make(`workspace-${index}`),
          );
          const round = (name: string) =>
            Effect.forEach(
              workspaces,
              (id) =>
                agentJobs.requestAcceptWork({ workspaceId: id, memberId: agent }).pipe(
                  Effect.provideService(Store.Transaction, {
                    id: Commit.Id.make(`${name}:${id}`),
                    append: () => Effect.die("Unexpected append"),
                    afterCommit: (effect) => effect,
                  }),
                ),
              { discard: true },
            );
          const ran = (count: number, within: Duration.Input) =>
            Effect.gen(function* () {
              const deadline = (yield* Clock.currentTimeMillis) + Duration.toMillis(within);
              while (runs.length < count && (yield* Clock.currentTimeMillis) < deadline)
                yield* Effect.sleep("20 millis");
              return runs.length;
            });
          // The processes share out the workspaces once both run, a few seconds after starting.
          const deadline = (yield* Clock.currentTimeMillis) + 30_000;
          for (let attempt = 0; !runs.some((run) => run.runner === "second"); attempt++) {
            if ((yield* Clock.currentTimeMillis) > deadline)
              return expect.fail("The second process never took a workspace");
            runs.length = 0;
            yield* round(`warm-${attempt}`);
            yield* ran(20, "10 seconds");
            yield* Effect.sleep("1 second");
          }
          runs.length = 0;
          yield* round("warmed");
          expect(yield* ran(20, "1 second")).toBe(20);
          expect(runs.some((run) => run.runner === "second")).toBe(true);
        }).pipe(Effect.scoped),
      ),
    60_000,
  );
});
