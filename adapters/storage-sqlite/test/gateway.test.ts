import { expect, expectTypeOf, test } from "bun:test";
import { Log } from "@amends/core/journal";
import { Gateway } from "@amends/gateway";
import { Effect, Option } from "effect";
import { Operations } from "./operations.ts";

import { alice, bob, views, inDatabase, host, temporary } from "./support.ts";
test("one host creates two isolated workspaces and uses each operation's authenticated identity", async () =>
  temporary(async (filename) => {
    expectTypeOf<
      Effect.Services<ReturnType<typeof Operations.getMember>>
    >().toEqualTypeOf<Gateway.Service>();
    expectTypeOf<
      Effect.Services<ReturnType<Gateway.Interface["createWorkspace"]>>
    >().toEqualTypeOf<never>();
    const workspaces = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* Operations.createWorkspace(alice.id);
        const b = yield* Operations.createWorkspace(bob.id);
        const requests = Array.from({ length: 20 }, (_, index) => {
          const [workspace, identity] =
            index % 2 === 0 ? ([a, alice] as const) : ([b, bob] as const);
          return Operations.getMember(workspace.id, identity, workspace.ownerMemberId).pipe(
            Effect.tap((record) => {
              expect(record.workspaceId).toBe(workspace.id);
              expect(record.identity).toEqual(identity);
              return Effect.void;
            }),
          );
        });
        yield* Effect.all(requests, { concurrency: "unbounded" });
        expect(
          yield* Effect.flip(Operations.getMember(b.id, alice, b.ownerMemberId)),
        ).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(yield* Effect.flip(Operations.getMember(a.id, bob, a.ownerMemberId))).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(
          yield* Effect.flip(Operations.getMember(a.id, alice, b.ownerMemberId)),
        ).toMatchObject({
          _tag: "MemberApplication.NotFound",
        });
        return [a, b];
      }).pipe(Effect.provide(host(filename))),
    );
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* views;
        for (const workspace of workspaces) {
          const bound = yield* storage.forWorkspace(workspace.id);
          expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
          const assignments = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
          expect(assignments.map((assignment) => assignment.source)).toEqual(
            expect.arrayContaining([
              {
                _tag: "Direct",
                grant: {
                  permission: "member.read",
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              },
              {
                _tag: "Direct",
                grant: {
                  permission: "member.remove",
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              },
            ]),
          );
          expect(assignments).toHaveLength(3);
          const batches = yield* bound.store.read(Log.Id.make("journal"), { limit: 10 });
          expect(batches).toHaveLength(1);
          expect(batches[0]?.entries).toHaveLength(5);
          expect(batches[0]?.commit.entryCount).toBe(5);
        }
      }),
    );
  }));
