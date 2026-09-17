import { Identity } from "@amends/core";
import { Effect, Schema } from "effect";
import { LocalHost } from "./host.ts";

class Failed extends Schema.TaggedError<Failed>()("LocalDemo.Failed", { message: Schema.String }) {}

/** Exercise real application operations, then close and reopen their persistent storage. */
export const run = Effect.fn("LocalDemo.run")(function* (filename: string) {
  const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("demo-alice") });
  const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("demo-bob") });
  const created = yield* Effect.scoped(
    Effect.gen(function* () {
      const host = yield* LocalHost.Service;
      const a = yield* host.createWorkspace(alice.id);
      const b = yield* host.createWorkspace(bob.id);
      const members = yield* Effect.all(
        [host.getMember(a.id, alice, a.ownerMemberId), host.getMember(b.id, bob, b.ownerMemberId)],
        { concurrency: "unbounded" },
      );
      const rejected = yield* host.getMember(b.id, alice, b.ownerMemberId).pipe(
        Effect.match({
          onFailure: (error) => error._tag === "LocalHost.NotMember",
          onSuccess: () => false,
        }),
      );
      if (!rejected || members[0]?.identity.id !== alice.id || members[1]?.identity.id !== bob.id)
        return yield* new Failed({ message: "Workspace isolation failed" });
      return [a, b] as const;
    }).pipe(Effect.provide(LocalHost.layer(filename))),
  );

  // Layer and database resource scopes from creation have closed before this opens.
  yield* Effect.scoped(
    Effect.gen(function* () {
      const host = yield* LocalHost.Service;
      for (const [workspace, identity] of [
        [created[0], alice],
        [created[1], bob],
      ] as const) {
        const member = yield* host.getMember(workspace.id, identity, workspace.ownerMemberId);
        if (member.identity.id !== identity.id)
          return yield* new Failed({ message: "Reopened data differs" });
      }
    }).pipe(Effect.provide(LocalHost.layer(filename))),
  );
  yield* Effect.log(
    "Created two workspaces, verified concurrent authorized reads and isolation, and reopened their persisted memberships.",
    {
      database: filename,
      workspaces: created,
    },
  );
});

export * as LocalDemo from "./demo.ts";
