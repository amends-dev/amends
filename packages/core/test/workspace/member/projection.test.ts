import * as Publication from "../../../src/journal/publication.ts";
import { testProvenance } from "../../publication.ts";
import { expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import * as Identity from "../../../src/identity/identity.ts";
import * as Checkpoint from "../../../src/journal/checkpoint.ts";
import * as Journal from "../../../src/journal/journal.ts";
import * as Log from "../../../src/journal/log.ts";
import * as Store from "../../../src/journal/store.ts";
import * as Transaction from "../../../src/journal/transaction.ts";
import * as MemberFacts from "../../../src/workspace/member/facts.ts";
import * as MemberProjection from "../../../src/workspace/member/projection.ts";
import * as MemberStore from "../../../src/workspace/member/store.ts";
import * as Member from "../../../src/workspace/member/member.ts";
import * as Workspace from "../../../src/workspace/workspace.ts";
import { make, type Fixture } from "../../memory.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const logId = Log.Id.make("workspace-one/journal");
const firstId = Member.Id.make("member-one");
const secondId = Member.Id.make("member-two");
const agentId = Member.Id.make("member-agent");
const human = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("same-id") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("same-id") });
const name = Member.Name.make("same-id");
const added = (memberId: Member.Id, identity: Identity.MemberReference) => ({
  memberId,
  workspaceId,
  identity,
  name,
});
const removed = (memberId: Member.Id) => ({ memberId, workspaceId });
const setup = Journal.make({ logId, projections: [MemberProjection.definition] });
const source = Journal.make({ logId, projections: [] });
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    | Publication.Publication
    | Log.Log
    | Transaction.Transaction
    | Checkpoint.Checkpoint
    | MemberStore.MemberStore
  >,
) =>
  program.pipe(
    Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Store, fixture.store),
    Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
    Effect.provideService(MemberStore.MemberStore, fixture.members),
  );
it.effect(
  "membership projection adds humans and agents, preserves removal, and admits a fresh membership",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* setup;
          const memberStore = yield* MemberStore.MemberStore;
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(MemberFacts.Added, added(firstId, human));
              expect(yield* memberStore.findActive(human)).toEqual(
                Option.some({
                  id: firstId,
                  workspaceId,
                  identity: human,
                  name,
                  status: "active",
                }),
              );
              yield* journal.publish(MemberFacts.Added, added(agentId, agent));
            }),
          );
          expect(yield* memberStore.findActive(agent)).toEqual(
            Option.some({
              id: agentId,
              workspaceId,
              identity: agent,
              name,
              status: "active",
            }),
          );
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(MemberFacts.Removed, removed(firstId));
              expect(Option.isNone(yield* memberStore.findActive(human))).toBe(true);
              yield* journal.publish(MemberFacts.Added, added(secondId, human));
            }),
          );
          expect(yield* memberStore.get(firstId)).toEqual(
            Option.some({
              id: firstId,
              workspaceId,
              identity: human,
              name,
              status: "removed",
            }),
          );
          expect(yield* memberStore.findActive(human)).toEqual(
            Option.some({
              id: secondId,
              workspaceId,
              identity: human,
              name,
              status: "active",
            }),
          );
          const beforeRetry = yield* fixture.snapshot;
          yield* journal.publish(MemberFacts.Added, added(firstId, human));
          yield* journal.publish(MemberFacts.Removed, removed(firstId));
          // Reusing creation cannot reactivate the removed membership or replace its successor.
          expect(yield* fixture.snapshot).toEqual(beforeRetry);
          yield* journal.replay;
          expect((yield* fixture.snapshot).members.size).toBe(3);
          expect(
            (yield* journal.log.read({ limit: 10 })).map((batch) => batch.entries.length),
          ).toEqual([2, 2]);
        }),
      );
    }),
);

it.effect("replay reconstructs membership history and resumes without reapplying additions", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* source;
        yield* journal.publish(MemberFacts.Added, added(firstId, human));
        yield* journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(MemberFacts.Removed, removed(firstId));
            yield* journal.publish(MemberFacts.Added, added(secondId, human));
            yield* journal.publish(MemberFacts.Added, added(agentId, agent));
          }),
        );
        expect((yield* fixture.snapshot).members.size).toBe(0);
        yield* (yield* setup).replay;
        const memberStore = yield* MemberStore.MemberStore;
        expect(yield* memberStore.get(firstId)).toEqual(
          Option.some({
            id: firstId,
            workspaceId,
            identity: human,
            name,
            status: "removed",
          }),
        );
        expect(Option.map(yield* memberStore.findActive(human), (member) => member.id)).toEqual(
          Option.some(secondId),
        );
        expect(Option.map(yield* memberStore.findActive(agent), (member) => member.id)).toEqual(
          Option.some(agentId),
        );
      }),
    );
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* setup;
        yield* journal.replay;
        expect((yield* fixture.snapshot).members.size).toBe(3);
        expect(yield* journal.log.read({ limit: 10 })).toHaveLength(2);
      }),
    );
  }),
);

it.effect(
  "a caught membership conflict rolls back the journal, member records, and checkpoint",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const journal = yield* setup;
          const failure = yield* Effect.flip(
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(MemberFacts.Added, added(firstId, human));
                yield* journal
                  .publish(MemberFacts.Added, added(secondId, human))
                  .pipe(Effect.catch(() => Effect.void));
              }),
            ),
          );
          expect(failure._tag).toBe("Commit.Aborted");
          const state = yield* fixture.snapshot;
          expect(state.members.size).toBe(0);
          expect(state.logs.size).toBe(0);
          expect(state.checkpoints.size).toBe(0);
          const outcomes = yield* Effect.forEach(
            [firstId, secondId],
            (id) =>
              journal
                .publish(MemberFacts.Added, added(id, human))
                .pipe(
                  Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "success" }),
                ),
            { concurrency: "unbounded" },
          );
          expect(outcomes.filter((outcome) => outcome === "success")).toHaveLength(1);
          expect(outcomes.filter((outcome) => outcome === "Projection.Failure")).toHaveLength(1);
          expect((yield* fixture.snapshot).members.size).toBe(1);
          expect(yield* journal.log.read({ limit: 10 })).toHaveLength(1);
        }),
      );
    }),
);

it.effect(
  "a failed removal rolls back the entire replay batch while retaining earlier progress",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const writer = yield* source;
          yield* writer.publish(MemberFacts.Added, added(firstId, human));
          yield* writer.commit(
            Effect.gen(function* () {
              yield* writer.publish(MemberFacts.Removed, removed(firstId));
              yield* writer.publish(MemberFacts.Removed, removed(Member.Id.make("missing")));
            }),
          );
          const journal = yield* setup;
          expect(yield* Effect.flip(journal.replay)).toMatchObject({
            _tag: "Projection.Failure",
            cause: { _tag: "MemberStore.Conflict", operation: "markRemoved" },
          });
          expect(yield* (yield* MemberStore.MemberStore).get(firstId)).toEqual(
            Option.some({
              id: firstId,
              workspaceId,
              identity: human,
              name,
              status: "active",
            }),
          );
          const cursor = yield* fixture.checkpoints.get({
            logId,
            name: MemberProjection.definition.name,
            version: MemberProjection.definition.version,
          });
          expect(Option.isSome(cursor) && cursor.value.position).toBe(Log.Position.make(0));
          expect(yield* journal.log.read({ limit: 10 })).toHaveLength(2);
        }),
      );
    }),
);

it.effect("membership changes roll back when the first commit cannot record live projections", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const failure = new Store.Failure({ operation: "checkpoint.setLive", cause: "unavailable" });
    const broken: Fixture = {
      ...fixture,
      checkpoints: Checkpoint.Checkpoint.of({
        ...fixture.checkpoints,
        setLive: () => Effect.fail(failure),
      }),
    };
    yield* run(
      broken,
      Effect.gen(function* () {
        const journal = yield* setup;
        expect(yield* Effect.flip(journal.publish(MemberFacts.Added, added(firstId, human)))).toBe(
          failure,
        );
        const state = yield* fixture.snapshot;
        expect(state.members.size).toBe(0);
        expect(state.logs.size).toBe(0);
        expect(state.checkpoints.size).toBe(0);
      }),
    );
  }),
);
